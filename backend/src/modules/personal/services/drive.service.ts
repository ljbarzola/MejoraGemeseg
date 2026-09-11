import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { MovimientoPersonalService } from './movimiento-personal.service';
import { google } from 'googleapis';
import * as fs from 'fs';
import * as path from 'path';

// Nombre fijo del .json de ficha personal que syncEntidadesFolder crea o
// sobrescribe en la carpeta de cada guardia. Se excluye explícitamente de la
// lista de EmployeeDocument (no es un documento de cumplimiento, no debe
// intentar matchearse contra ningún RequisitoDocumento).
const FICHA_PERSONAL_FILENAME = 'Datos_Personales.json';

@Injectable()
export class DriveService {
  private readonly logger = new Logger(DriveService.name);
  private driveClient: any = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly movimientoPersonalService: MovimientoPersonalService,
  ) {}

  private getDriveClient() {
    if (this.driveClient) return this.driveClient;

    const candidates = [
      path.join(process.cwd(), 'google-service-account.json'),
      path.join(
        __dirname,
        '..',
        '..',
        '..',
        '..',
        'google-service-account.json',
      ),
    ];
    this.logger.log(
      `DriveClient: process.cwd()=${process.cwd()}, __dirname=${__dirname}`,
    );

    let keyFile: any = null;
    for (const candidate of candidates) {
      if (fs.existsSync(candidate)) {
        keyFile = JSON.parse(fs.readFileSync(candidate, 'utf-8'));
        this.logger.log(`DriveClient: loaded credentials from ${candidate}`);
        break;
      }
    }

    if (!keyFile) {
      throw new BadRequestException(
        'Google Drive no configurado. Coloca google-service-account.json en la raíz del backend.',
      );
    }

    const auth = new google.auth.GoogleAuth({
      credentials: keyFile,
      scopes: ['https://www.googleapis.com/auth/drive'],
    });
    this.driveClient = google.drive({ version: 'v3', auth });
    return this.driveClient;
  }

  private sanitizeFolderId(id: string): string {
    return id?.trim().replace(/\.+$/, '') || '';
  }

  async testConnection(
    companyId: number,
    folderId?: string,
    type: string = 'CUMPLIMIENTO',
  ) {
    if (!companyId)
      return {
        success: false,
        message: 'Usuario sin empresa asociada. Inicia sesión nuevamente.',
      };
    try {
      const drive = this.getDriveClient();
      let targetFolderId = this.sanitizeFolderId(folderId || '');
      this.logger.log(
        `testConnection: raw folderId=${folderId}, sanitized=${targetFolderId}`,
      );
      if (!targetFolderId) {
        const config = await this.prisma.folderConfig.findFirst({
          where: { companyId, type },
        });
        if (!config) {
          return {
            success: false,
            message:
              'Escribe el ID de la carpeta raíz y pulsa Probar Conexión.',
          };
        }
        targetFolderId = this.sanitizeFolderId(config.driveFolderId);
      }
      const folder = await drive.files.get({
        fileId: targetFolderId,
        fields: 'id, name',
        supportsAllDrives: true,
      });
      return {
        success: true,
        folderName: folder.data.name,
        folderId: folder.data.id,
      };
    } catch (error) {
      this.logger.error(`Error de conexión Drive: ${error.message}`);
      let hint = '';
      if (
        error.message?.includes('File not found') ||
        error.message?.includes('not found')
      ) {
        hint =
          ' La carpeta no fue encontrada. Verifica: (1) el ID es correcto, (2) la carpeta existe, (3) compartiste la carpeta con drive-sync@agentes-504115.iam.gserviceaccount.com.';
      } else if (
        error.message?.includes('permission') ||
        error.message?.includes('403')
      ) {
        hint =
          ' El service account no tiene permisos. Comparte la carpeta con drive-sync@agentes-504115.iam.gserviceaccount.com.';
      }
      return {
        success: false,
        message: `No se pudo conectar a Google Drive: ${error.message}.${hint}`,
      };
    }
  }

  async getConfig(companyId: number, type: string = 'CUMPLIMIENTO') {
    if (!companyId) return null;
    return this.prisma.folderConfig.findFirst({ where: { companyId, type } });
  }

  // El nombre de la carpeta no lo escribe el usuario: se lee de Drive con el
  // ID que da, así siempre queda igual al nombre real y sirve de validación
  // (si el ID está mal o no está compartida, falla aquí con un mensaje claro).
  async saveConfig(
    companyId: number,
    driveFolderId: string,
    type: string = 'CUMPLIMIENTO',
  ) {
    if (!companyId)
      throw new BadRequestException('Usuario sin empresa asociada');
    const sanitizedId = this.sanitizeFolderId(driveFolderId);
    if (!sanitizedId)
      throw new BadRequestException('Ingresa el ID de la carpeta raíz.');

    let driveFolderName: string;
    try {
      const drive = this.getDriveClient();
      const folder = await drive.files.get({
        fileId: sanitizedId,
        fields: 'id, name',
        supportsAllDrives: true,
      });
      driveFolderName = folder.data.name || sanitizedId;
    } catch (err) {
      throw new BadRequestException(
        `No se pudo leer la carpeta en Google Drive: ${err.message}. Verifica el ID y que esté compartida con drive-sync@agentes-504115.iam.gserviceaccount.com.`,
      );
    }

    const existing = await this.prisma.folderConfig.findFirst({
      where: { companyId, type },
    });
    if (existing) {
      return this.prisma.folderConfig.update({
        where: { id: existing.id },
        data: { driveFolderId: sanitizedId, driveFolderName },
      });
    }
    return this.prisma.folderConfig.create({
      data: { driveFolderId: sanitizedId, driveFolderName, type, companyId },
    });
  }

  async syncFolder(companyId: number, userId: number) {
    if (!companyId)
      throw new BadRequestException('Usuario sin empresa asociada');
    const drive = this.getDriveClient();
    const config = await this.prisma.folderConfig.findFirst({
      where: { companyId, type: 'CUMPLIMIENTO' },
    });
    if (!config) {
      throw new BadRequestException(
        'No hay carpeta configurada. Guarda el ID de la carpeta raíz primero.',
      );
    }

    const result = {
      custodias: 0,
      personal: 0,
      employees: 0,
      documents: 0,
      errors: [] as string[],
    };

    try {
      const subFolders = await this.listSubFolders(
        this.sanitizeFolderId(config.driveFolderId),
      );

      for (const subFolder of subFolders) {
        const subName = subFolder.name.toLowerCase();
        const folderType = subName.includes('custod')
          ? 'CUSTODIAS'
          : 'PERSONAL';

        const employeeFolders = await this.listSubFolders(subFolder.id);

        for (const empFolder of employeeFolders) {
          try {
            const parsed = this.parseEmployeeFolderName(
              empFolder.name,
              empFolder.id,
            );

            let candidate = await this.prisma.candidate.findFirst({
              where: { companyId, cedula: parsed.cedula },
            });

            if (!candidate) {
              const columns = await this.prisma.kanbanColumn.findMany({
                where: { companyId },
                orderBy: { position: 'asc' },
              });
              const firstCol = columns[0];

              candidate = await this.prisma.candidate.create({
                data: {
                  fullName: parsed.name,
                  cedula: parsed.cedula,
                  positionApplied:
                    folderType === 'CUSTODIAS'
                      ? 'Custodio'
                      : 'Personal Administrativo',
                  columnId: firstCol?.id || null,
                  companyId,
                  createdBy: userId,
                },
              });
              result.employees++;
            } else if (
              candidate.positionApplied !==
              (folderType === 'CUSTODIAS'
                ? 'Custodio'
                : 'Personal Administrativo')
            ) {
              await this.prisma.candidate.update({
                where: { id: candidate.id },
                data: {
                  positionApplied:
                    folderType === 'CUSTODIAS'
                      ? 'Custodio'
                      : 'Personal Administrativo',
                },
              });
            }

            await this.prisma.employeeDriveFolder.upsert({
              where: { companyId_cedula: { companyId, cedula: parsed.cedula } },
              create: {
                employeeName: parsed.name,
                cedula: parsed.cedula,
                folderId: empFolder.id,
                folderUrl: `https://drive.google.com/drive/folders/${empFolder.id}`,
                folderType,
                lastSyncAt: new Date(),
                companyId,
              },
              update: {
                employeeName: parsed.name,
                folderId: empFolder.id,
                folderUrl: `https://drive.google.com/drive/folders/${empFolder.id}`,
                folderType,
                lastSyncAt: new Date(),
              },
            });

            const files = await this.listFilesInFolder(empFolder.id);
            for (const file of files) {
              await this.prisma.employeeDocument.upsert({
                where: { driveFileId: file.id },
                create: {
                  employeeName: parsed.name,
                  cedula: parsed.cedula,
                  fileName: file.name,
                  fileUrl: `https://drive.google.com/file/d/${file.id}/view`,
                  fileType: file.mimeType,
                  driveFileId: file.id,
                  folder: folderType,
                  companyId,
                },
                update: {
                  employeeName: parsed.name,
                  cedula: parsed.cedula,
                  fileName: file.name,
                  folder: folderType,
                  companyId,
                },
              });
              result.documents++;
            }

            if (folderType === 'CUSTODIAS') result.custodias++;
            else result.personal++;
          } catch (empErr: any) {
            this.logger.error(
              `Error procesando carpeta ${empFolder.name}: ${empErr.message}`,
              empErr.stack,
            );
            result.errors.push(
              `No se pudo procesar la carpeta "${empFolder.name}". Vuelve a sincronizar; si persiste, contacta a soporte.`,
            );
          }
        }
      }
    } catch (error) {
      this.logger.error(`Error en sincronización: ${error.message}`, error.stack);
      result.errors.push(
        'No se pudo completar la sincronización por un problema técnico. Intenta de nuevo; si persiste, contacta a soporte.',
      );
    }

    return result;
  }

  // Normaliza un nombre de carpeta para matchear "Público"/"Privado" sin
  // importar tildes/mayúsculas — Drive en Windows suele guardar el nombre
  // exactamente como lo tipeó RRHH, con o sin acento.
  private normalizeFolderName(name: string): string {
    return name
      .normalize('NFD')
      .replace(/\p{Mn}/gu, '')
      .trim()
      .toLowerCase();
  }

  // Sync de la estructura Raíz → Público/Privado → Entidad → Guardia (Fase D
  // del módulo de Entidades/Cumplimiento). Reemplaza la estructura plana
  // Custodios/Personal que usaba syncFolder para esta carpeta — folderType se
  // sigue escribiendo como 'CUSTODIAS' a propósito: el módulo de Custodias
  // (viajes/nómina, `custodias.service.ts:getAvailableCustodios`) depende de
  // ese valor para su selector de personal y no debe romperse.
  //
  // Principio de resiliencia (pedido explícito del usuario): esta función
  // NUNCA borra `Entidad` ni `RequisitoDocumento` — si una carpeta desaparece
  // o el ID está mal configurado, el guardia simplemente queda sin
  // asignación activa hasta que la carpeta reaparezca (se re-vincula por
  // nombre, no por ID guardado) o RRHH corrija algo a mano. Tampoco
  // sobreescribe el `tipo` de una Entidad ya existente si no coincide con la
  // carpeta — eso se reporta como advertencia, nunca se corrige solo.
  async syncEntidadesFolder(companyId: number, userId: number) {
    if (!companyId)
      throw new BadRequestException('Usuario sin empresa asociada');
    const config = await this.prisma.folderConfig.findFirst({
      where: { companyId, type: 'CUMPLIMIENTO' },
    });
    if (!config) {
      throw new BadRequestException(
        'No hay carpeta configurada. Guarda el ID de la carpeta raíz primero.',
      );
    }

    const result = {
      entidadesCreadas: [] as string[],
      entidadesRenombradas: [] as string[],
      entidadesTipoDistinto: [] as string[],
      entidadesColisionNombre: [] as string[],
      guardiasActualizados: 0,
      documentos: 0,
      fichasPersonales: 0,
      asignacionesAbiertas: 0,
      asignacionesCerradas: 0,
      carpetasNoReconocidas: [] as string[],
      guardiasNoReconocidos: [] as string[],
      renombresIgnorados: [] as string[],
      guardiasFueraConCarpetaActiva: [] as string[],
      errors: [] as string[],
    };

    // cedula -> { entidadId, nombreGuardia }, visto en ESTA corrida.
    const vistos = new Map<
      string,
      { entidadId: number; nombreGuardia: string }
    >();

    try {
      const rootSubFolders = await this.listSubFolders(
        this.sanitizeFolderId(config.driveFolderId),
      );

      for (const tipoFolder of rootSubFolders) {
        const normalized = this.normalizeFolderName(tipoFolder.name);

        // Bucket de guardias activos sin entidad todavía (ver
        // DriveService.contratarCandidato): un nivel menos de anidación que
        // Público/Privado — sus subcarpetas SON guardias directamente, no
        // entidades. Se sincroniza igual (identidad, documentos, ficha
        // personal) pero nunca se registra en `vistos`, así que nunca abren
        // una AsignacionGuardia — quedan "sin asignación" hasta que alguien
        // mueva su carpeta a Público/Privado/<Entidad> a mano.
        if (normalized === 'sin asignar') {
          const guardiasSinAsignar = await this.listSubFolders(tipoFolder.id);
          for (const guardiaFolder of guardiasSinAsignar) {
            await this.syncGuardiaFolder(
              companyId,
              guardiaFolder,
              null,
              vistos,
              result,
            );
          }
          continue;
        }

        let tipo: 'PUBLICA' | 'PRIVADA' | null = null;
        if (normalized === 'publico') tipo = 'PUBLICA';
        else if (normalized === 'privado') tipo = 'PRIVADA';

        if (!tipo) {
          result.carpetasNoReconocidas.push(tipoFolder.name);
          continue;
        }

        const entidadFolders = await this.listSubFolders(tipoFolder.id);

        for (const entidadFolder of entidadFolders) {
          const nombreEntidad = entidadFolder.name.trim();
          if (!nombreEntidad) continue;

          // Ancla por folderId primero: si esta carpeta ya estaba vinculada
          // a una Entidad, es la MISMA entidad aunque el nombre haya
          // cambiado — se actualiza el nombre en vez de crear una fila
          // nueva y dejar huérfana la anterior (con sus requisitos e
          // historial de guardias).
          let entidad = await this.prisma.entidad.findFirst({
            where: { companyId, driveFolderId: entidadFolder.id },
          });

          if (entidad) {
            if (entidad.nombre !== nombreEntidad) {
              const nombreAnterior = entidad.nombre;
              entidad = await this.prisma.entidad.update({
                where: { id: entidad.id },
                data: { nombre: nombreEntidad },
              });
              result.entidadesRenombradas.push(
                `"${nombreAnterior}" → "${nombreEntidad}"`,
              );
            }
          } else {
            entidad = await this.prisma.entidad.findFirst({
              where: {
                companyId,
                nombre: { equals: nombreEntidad, mode: 'insensitive' },
              },
            });

            if (!entidad) {
              entidad = await this.prisma.entidad.create({
                data: {
                  nombre: nombreEntidad,
                  tipo,
                  companyId,
                  driveFolderId: entidadFolder.id,
                },
              });
              result.entidadesCreadas.push(nombreEntidad);
            } else if (!entidad.driveFolderId) {
              // Primera vez que esta entidad (creada a mano, o de antes de
              // que existiera este campo) se ve junto a una carpeta real —
              // se ancla de ahora en más.
              entidad = await this.prisma.entidad.update({
                where: { id: entidad.id },
                data: { driveFolderId: entidadFolder.id },
              });
            } else if (entidad.driveFolderId !== entidadFolder.id) {
              // Dos carpetas de Drive DISTINTAS comparten nombre de entidad
              // — no se puede saber cuál es la "real" sin ambigüedad, así
              // que no se reancla nada (se sigue usando esta fila por
              // nombre, comportamiento previo) y se avisa para que RRHH lo
              // revise a mano.
              result.entidadesColisionNombre.push(
                `"${nombreEntidad}" — hay más de una carpeta en Drive con este nombre; solo la primera queda vinculada, renombra una de las carpetas para diferenciarlas`,
              );
            }
          }

          if (entidad.tipo !== tipo) {
            result.entidadesTipoDistinto.push(
              `${nombreEntidad} (carpeta: ${tipo === 'PUBLICA' ? 'Público' : 'Privado'}, sistema: ${entidad.tipo === 'PUBLICA' ? 'Pública' : 'Privada'}) — corrígelo editando la entidad en Entidades y Requisitos, o mueve la carpeta en Drive`,
            );
          }

          const guardiaFolders = await this.listSubFolders(entidadFolder.id);

          for (const guardiaFolder of guardiaFolders) {
            await this.syncGuardiaFolder(
              companyId,
              guardiaFolder,
              entidad,
              vistos,
              result,
            );
          }
        }
      }

      // Reconciliación de AsignacionGuardia (historial auto-generado): nunca
      // toca Entidad/RequisitoDocumento, solo abre/cierra filas de historial.
      const activas = await this.prisma.asignacionGuardia.findMany({
        where: { companyId, fechaFin: null },
      });
      const ahora = new Date();

      // Un guardia con una SALIDA ya completada en Movimientos de Personal
      // no debe volver a quedar "asignado" solo porque su carpeta de Drive
      // sigue existiendo (RRHH pudo olvidarse de borrarla/moverla) — eso
      // reabriría en silencio a alguien que ya se marcó como que salió. Sí
      // se sigue cerrando su asignación vieja con total normalidad si
      // corresponde; lo único que se evita es ABRIR una nueva.
      const cedulasFuera = new Set(
        await this.movimientoPersonalService.getCedulasFuera(companyId),
      );

      for (const activa of activas) {
        const visto = vistos.get(activa.cedula);
        if (!visto) {
          // El guardia ya no aparece en ninguna carpeta de entidad.
          await this.prisma.asignacionGuardia.update({
            where: { id: activa.id },
            data: { fechaFin: ahora },
          });
          result.asignacionesCerradas++;
        } else if (visto.entidadId !== activa.entidadId) {
          await this.prisma.asignacionGuardia.update({
            where: { id: activa.id },
            data: { fechaFin: ahora },
          });
          result.asignacionesCerradas++;
          if (cedulasFuera.has(activa.cedula)) {
            result.guardiasFueraConCarpetaActiva.push(visto.nombreGuardia);
            continue;
          }
          await this.prisma.asignacionGuardia.create({
            data: {
              cedula: activa.cedula,
              nombreGuardia: visto.nombreGuardia,
              entidadId: visto.entidadId,
              fechaInicio: ahora,
              companyId,
              createdBy: userId,
            },
          });
          result.asignacionesAbiertas++;
        }
      }

      const cedulasConActiva = new Set(activas.map((a) => a.cedula));
      for (const [cedula, visto] of vistos.entries()) {
        if (cedulasConActiva.has(cedula)) continue;
        if (cedulasFuera.has(cedula)) {
          result.guardiasFueraConCarpetaActiva.push(visto.nombreGuardia);
          continue;
        }
        await this.prisma.asignacionGuardia.create({
          data: {
            cedula,
            nombreGuardia: visto.nombreGuardia,
            entidadId: visto.entidadId,
            fechaInicio: ahora,
            companyId,
            createdBy: userId,
          },
        });
        result.asignacionesAbiertas++;
      }
    } catch (error: any) {
      this.logger.error(
        `Error en sincronización de Entidades: ${error.message}`,
      );
      result.errors.push(error.message);
    }

    return result;
  }

  // Identidad/documentos/ficha personal de una carpeta de guardia — usado
  // tanto para guardias dentro de una Entidad (Público/Privado/<Entidad>/...)
  // como para los que están en el bucket "Sin Asignar" (entidad=null, ver
  // contratarCandidato). Solo se registra en `vistos` (y por lo tanto solo se
  // abre una AsignacionGuardia) cuando hay una Entidad real — un guardia "Sin
  // Asignar" queda sin asignación hasta que RRHH lo mueva a mano.
  private async syncGuardiaFolder(
    companyId: number,
    guardiaFolder: { id: string; name: string },
    entidad: { id: number } | null,
    vistos: Map<string, { entidadId: number; nombreGuardia: string }>,
    result: {
      guardiasNoReconocidos: string[];
      renombresIgnorados: string[];
      documentos: number;
      fichasPersonales: number;
      guardiasActualizados: number;
      errors: string[];
    },
  ) {
    try {
      const parsed = this.parseEmployeeFolderName(
        guardiaFolder.name,
        guardiaFolder.id,
      );

      // Ancla de identidad: la MISMA carpeta de Drive (folderId, estable)
      // ya vinculada a una cédula. Si alguien renombra la carpeta y el
      // nombre nuevo no parsea bien (o parsea a OTRA cédula por un
      // typo), NO se crea una identidad nueva ni se cierra la vieja por
      // accidente — se ignora el rename para efectos de identidad y se
      // reporta, hasta que alguien lo confirme a mano. Esto es lo que
      // pasaba antes: renombrar mal una carpeta fragmentaba al mismo
      // guardia en varias cédulas ("ID-xxxxx", cédulas a medio escribir).
      const existente = await this.prisma.employeeDriveFolder.findFirst({
        where: { companyId, folderId: guardiaFolder.id },
      });

      let cedula: string;
      let nombreGuardia: string;

      if (!existente) {
        if (!parsed.cedulaConfiable) {
          // Carpeta nueva y no se pudo leer "Nombre - Cédula": no se
          // inventa una identidad — mejor no detectarlo que crear un
          // guardia fantasma con cédula sintética.
          result.guardiasNoReconocidos.push(guardiaFolder.name);
          return;
        }
        cedula = parsed.cedula;
        nombreGuardia = parsed.name;
      } else if (
        parsed.cedulaConfiable &&
        parsed.cedula === existente.cedula
      ) {
        // Mismo folderId, misma cédula (el nombre pudo cambiar
        // cosméticamente) — actualización normal.
        cedula = parsed.cedula;
        nombreGuardia = parsed.name;
      } else {
        // El folderId ya existía con OTRA cédula (o la nueva no se
        // pudo leer con confianza): se mantiene la identidad vieja tal
        // cual, sin tocar nombre ni cédula, y se avisa para revisión.
        cedula = existente.cedula;
        nombreGuardia = existente.employeeName;
        result.renombresIgnorados.push(
          parsed.cedulaConfiable
            ? `"${guardiaFolder.name}" — antes "${existente.employeeName} - ${existente.cedula}", la cédula detectada ahora sería "${parsed.cedula}"; se mantuvo la cédula original por seguridad`
            : `"${guardiaFolder.name}" no se pudo leer como "Nombre - Cédula"; se mantuvo la identidad original "${existente.employeeName} - ${existente.cedula}"`,
        );
      }

      await this.prisma.employeeDriveFolder.upsert({
        where: {
          companyId_cedula: { companyId, cedula },
        },
        create: {
          employeeName: nombreGuardia,
          cedula,
          folderId: guardiaFolder.id,
          folderUrl: `https://drive.google.com/drive/folders/${guardiaFolder.id}`,
          folderType: 'CUSTODIAS',
          lastSyncAt: new Date(),
          companyId,
        },
        update: {
          employeeName: nombreGuardia,
          folderId: guardiaFolder.id,
          folderUrl: `https://drive.google.com/drive/folders/${guardiaFolder.id}`,
          folderType: 'CUSTODIAS',
          lastSyncAt: new Date(),
        },
      });

      const files = await this.listFilesInFolder(guardiaFolder.id);
      const fichaFile = files.find(
        (f: { id?: string; name?: string }) =>
          f.name === FICHA_PERSONAL_FILENAME,
      );
      for (const file of files) {
        if (file.name === FICHA_PERSONAL_FILENAME) continue;
        await this.prisma.employeeDocument.upsert({
          where: { driveFileId: file.id },
          create: {
            employeeName: nombreGuardia,
            cedula,
            fileName: file.name,
            fileUrl: `https://drive.google.com/file/d/${file.id}/view`,
            fileType: file.mimeType,
            driveFileId: file.id,
            folder: 'CUSTODIAS',
            companyId,
          },
          update: {
            employeeName: nombreGuardia,
            cedula,
            fileName: file.name,
            folder: 'CUSTODIAS',
            companyId,
          },
        });
        result.documentos++;
      }

      try {
        const fichaSynced = await this.syncFichaPersonal(
          companyId,
          cedula,
          nombreGuardia,
          guardiaFolder.id,
          fichaFile?.id,
        );
        if (fichaSynced) result.fichasPersonales++;
      } catch (fichaErr: any) {
        result.errors.push(
          `No se pudo guardar Datos_Personales.json de ${nombreGuardia}: ${fichaErr.message}`,
        );
      }

      if (entidad) {
        vistos.set(cedula, {
          entidadId: entidad.id,
          nombreGuardia,
        });
      }
      result.guardiasActualizados++;
    } catch (empErr: any) {
      this.logger.error(
        `Error procesando carpeta ${guardiaFolder.name}: ${empErr.message}`,
      );
      result.errors.push(
        `Error en ${guardiaFolder.name}: ${empErr.message}`,
      );
    }
  }

  // Personal Administrativo tiene su propia carpeta raíz (config
  // type='PERSONAL_ADMIN'), independiente de la de Cumplimiento/Custodios.
  // Dentro de ella hay una subcarpeta por empleado, hermanas entre sí,
  // nombradas "Nombre Apellido - Puesto" (sin cédula).
  private async getPersonalAdminFolderId(companyId: number): Promise<string> {
    const config = await this.prisma.folderConfig.findFirst({
      where: { companyId, type: 'PERSONAL_ADMIN' },
    });
    if (!config) {
      throw new BadRequestException(
        'No hay carpeta de Drive configurada para Personal Administrativo. Configúrala en la tuerca ⚙ de la página de Personal Administrativo.',
      );
    }
    return this.sanitizeFolderId(config.driveFolderId);
  }

  // Parser exclusivo del bucket Personal Administrativo. NO reutiliza ni
  // toca `parseEmployeeFolderName` (que sigue siendo el único parser usado
  // por Custodios/CUMPLIMIENTO, con cédulas reales). Aquí el nombre de
  // carpeta es "Nombre Apellido - Puesto" (sin cédula), así que la
  // identidad de la fila en BD se deriva del ID de carpeta de Drive (estable
  // y único), nunca del texto del "puesto" — evita que dos empleados con el
  // mismo puesto colisionen en la misma fila.
  private parsePersonalAdminFolderName(
    folderName: string,
    folderId: string,
  ): { name: string; puesto: string; identityKey: string } {
    const idx = folderName.lastIndexOf(' - ');
    const name = (idx >= 0 ? folderName.slice(0, idx) : folderName).trim();
    const puesto = idx >= 0 ? folderName.slice(idx + 3).trim() : '';
    const identityKey = `PA-${folderId.slice(-16)}`;
    return { name, puesto, identityKey };
  }

  // `userId` no se usa hoy (esta sincronización no crea candidatos, a
  // diferencia de syncFolder) — se mantiene en la firma por simetría con el
  // resto de métodos de sync de este servicio y por si se necesita para
  // auditoría a futuro.
  async syncPersonalAdminFolder(companyId: number, _userId: number) {
    if (!companyId)
      throw new BadRequestException('Usuario sin empresa asociada');

    const rootFolderId = await this.getPersonalAdminFolderId(companyId);

    const result = {
      foldersCount: 0,
      documentsCount: 0,
      errors: [] as string[],
    };

    const employeeFolders = await this.listSubFolders(rootFolderId);

    for (const empFolder of employeeFolders) {
      try {
        const { name, puesto, identityKey } = this.parsePersonalAdminFolderName(
          empFolder.name,
          empFolder.id,
        );

        await this.prisma.employeeDriveFolder.upsert({
          where: {
            companyId_cedula: { companyId, cedula: identityKey },
          },
          create: {
            employeeName: name,
            cedula: identityKey,
            puesto,
            folderId: empFolder.id,
            folderUrl: `https://drive.google.com/drive/folders/${empFolder.id}`,
            folderType: 'PERSONAL_ADMIN',
            lastSyncAt: new Date(),
            companyId,
          },
          update: {
            employeeName: name,
            puesto,
            folderId: empFolder.id,
            folderUrl: `https://drive.google.com/drive/folders/${empFolder.id}`,
            folderType: 'PERSONAL_ADMIN',
            lastSyncAt: new Date(),
          },
        });

        const files = await this.listFilesInFolder(empFolder.id);
        for (const file of files) {
          await this.prisma.employeeDocument.upsert({
            where: { driveFileId: file.id },
            create: {
              employeeName: name,
              cedula: identityKey,
              fileName: file.name,
              fileUrl: `https://drive.google.com/file/d/${file.id}/view`,
              fileType: file.mimeType,
              driveFileId: file.id,
              folder: 'PERSONAL_ADMIN',
              companyId,
            },
            update: {
              employeeName: name,
              cedula: identityKey,
              fileName: file.name,
              folder: 'PERSONAL_ADMIN',
              companyId,
            },
          });
          result.documentsCount++;
        }

        result.foldersCount++;
      } catch (empErr: any) {
        this.logger.error(
          `Error procesando carpeta ${empFolder.name}: ${empErr.message}`,
        );
        result.errors.push(`Error en ${empFolder.name}: ${empErr.message}`);
      }
    }

    return result;
  }

  async getCompliance(cedula: string, companyId: number) {
    if (!companyId)
      throw new BadRequestException('Usuario sin empresa asociada');
    const driveFolder = await this.prisma.employeeDriveFolder.findFirst({
      where: { companyId, cedula },
    });

    if (!driveFolder) {
      throw new BadRequestException(
        `No se encontró carpeta de Drive para cédula ${cedula}`,
      );
    }

    const folderType = driveFolder.folderType;
    const docTypes = await this.prisma.documentType.findMany({
      where: { companyId, folder: folderType },
      orderBy: { name: 'asc' },
    });

    // Orden determinista: con re-subidas hay varios archivos que matchean el mismo
    // tipo, y el más reciente debe ganar (de ello depende la detección de "stale").
    const employeeDocs = await this.prisma.employeeDocument.findMany({
      where: { companyId, cedula, folder: folderType },
      orderBy: { createdAt: 'desc' },
    });

    const candidate = await this.prisma.candidate.findFirst({
      where: { companyId, cedula },
      include: { column: true },
    });
    const column_name = candidate?.column?.name || '';

    const reviews = await this.prisma.documentReview.findMany({
      where: { companyId, cedula },
      include: { reviewer: { select: { id: true, fullName: true } } },
    });
    const reviewByType = new Map(
      reviews
        .filter((r) => r.documentTypeId != null)
        .map((r) => [r.documentTypeId, r]),
    );
    const reviewByFile = new Map(
      reviews
        .filter((r) => r.documentTypeId == null && r.driveFileId)
        .map((r) => [r.driveFileId, r]),
    );

    const { byType, usedDocIds } = this.matchDocuments(docTypes, employeeDocs);

    const documents = docTypes.map((dt) => {
      const matchResult = byType.get(dt.id);
      const isContrato = dt.name.toLowerCase().includes('contrato');
      const isActivo = column_name === 'Activo' || column_name === 'Contratado';

      let required = dt.required;
      if (isContrato && !isActivo) {
        required = false;
      }

      return {
        documentTypeId: dt.id,
        type: dt.name,
        required,
        status: matchResult ? 'present' : 'missing',
        fileName: matchResult?.fileName || null,
        fileUrl: matchResult?.fileUrl || null,
        driveFileId: matchResult?.driveFileId || null,
        uploadedAt: matchResult?.createdAt || null,
        review: this.buildReviewInfo(
          reviewByType.get(dt.id),
          matchResult?.driveFileId,
        ),
      };
    });

    const requiredCount = documents.filter((d) => d.required).length;
    const presentCount = documents.filter(
      (d) => d.required && d.status === 'present',
    ).length;
    const compliancePercent =
      requiredCount > 0 ? Math.round((presentCount / requiredCount) * 100) : 0;

    // Un archivo queda "sin reconocer" si no fue asignado a ningún tipo de documento.
    const unmatchedFiles = employeeDocs
      .filter((doc) => !usedDocIds.has(doc.id))
      .map((doc) => ({
        fileName: doc.fileName,
        fileUrl: doc.fileUrl,
        driveFileId: doc.driveFileId,
        uploadedAt: doc.createdAt,
        review: this.buildReviewInfo(
          reviewByFile.get(doc.driveFileId),
          doc.driveFileId,
        ),
      }));

    const allReviewed = [...documents, ...unmatchedFiles];
    const reviewSummary = {
      approved: allReviewed.filter((d) => d.review.status === 'APROBADO')
        .length,
      rejected: allReviewed.filter((d) => d.review.status === 'RECHAZADO')
        .length,
      pending: allReviewed.filter((d) => d.review.status === 'PENDIENTE')
        .length,
    };

    return {
      employee: driveFolder.employeeName,
      cedula,
      folder: folderType,
      stage: column_name,
      documents,
      compliancePercent,
      unmatchedFiles,
      reviewSummary,
      lastSyncAt: driveFolder.lastSyncAt,
    };
  }

  /**
   * Estado de revisión de una fila del checklist. `stale` marca que el archivo
   * revisado ya no es el actual (típicamente: lo rechazaron y volvieron a subir),
   * así que la aprobación/rechazo anterior ya no aplica al archivo que se ve hoy.
   */
  private buildReviewInfo(review: any, currentDriveFileId?: string | null) {
    if (!review) {
      return {
        status: 'PENDIENTE',
        reason: null,
        reviewedBy: null,
        reviewedAt: null,
        stale: false,
      };
    }
    return {
      status: review.status,
      reason: review.reason,
      reviewedBy: review.reviewer?.fullName || null,
      reviewedAt: review.reviewedAt,
      stale:
        review.status !== 'PENDIENTE' &&
        !!currentDriveFileId &&
        review.reviewedDriveFileId !== currentDriveFileId,
    };
  }

  private normalizeStr(s: string): string {
    return s
      .normalize('NFC')
      .toLowerCase()
      .replace(/\.[^/.]+$/, '')
      .trim();
  }

  private removeAccents(s: string): string {
    return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  }

  /**
   * Busca en un datosFormulario (candidato.json) un valor cuya clave
   * coincida con alguno de los sinonimos dados, ignorando acentos,
   * mayusculas y espacios (asi "Nombre Completo" y "nombreCompleto" matchean
   * el mismo sinonimo "nombre completo").
   */
  private buscarDatoFormulario(
    datos: Record<string, any>,
    sinonimos: string[],
  ): string {
    const normalizados = sinonimos.map((s) =>
      this.removeAccents(s.toLowerCase()).replace(/\s+/g, ''),
    );
    for (const key of Object.keys(datos || {})) {
      const normalizedKey = this.removeAccents(key.toLowerCase()).replace(
        /\s+/g,
        '',
      );
      if (normalizados.includes(normalizedKey)) {
        const value = datos[key];
        if (value !== undefined && value !== null && String(value).trim()) {
          return String(value).trim();
        }
      }
    }
    return '';
  }

  /**
   * Puntúa cuánto se parece el nombre de un archivo al de un tipo de documento.
   * 0 = no coincide. Antes bastaba con que UNA palabra de más de 2 letras
   * coincidiera, así que un mismo archivo podía aparecer en varias filas del
   * checklist ("Certificado médico" y "Certificado de antecedentes"). Ahora se
   * exige la frase completa, o todos los términos, o al menos el 60 % cuando
   * son tres o más.
   */
  private scoreMatch(rawFileName: string, docTypeName: string): number {
    if (!rawFileName || !docTypeName) return 0;

    const fileName = this.normalizeStr(rawFileName);
    const accentlessFile = this.removeAccents(fileName);
    const normalizedType = this.normalizeStr(docTypeName);
    const accentlessType = this.removeAccents(normalizedType);

    if (
      fileName.includes(normalizedType) ||
      accentlessFile.includes(accentlessType)
    ) {
      return 1000 + normalizedType.length;
    }

    const terms = normalizedType.split(/\s+/).filter((w) => w.length > 2);
    if (terms.length === 0) return 0;

    const accentlessTerms = accentlessType
      .split(/\s+/)
      .filter((w) => w.length > 2);
    const matched = terms.filter(
      (term, i) =>
        fileName.includes(term) ||
        accentlessFile.includes(accentlessTerms[i] ?? term),
    ).length;

    if (matched === terms.length) return 500 + matched;
    if (terms.length >= 3 && matched / terms.length >= 0.6)
      return 100 + matched;
    return 0;
  }

  /**
   * Asigna cada archivo a como mucho un tipo de documento (y cada tipo a como
   * mucho un archivo), resolviendo los empates por mayor puntaje. `docs` debe
   * venir ordenado del más reciente al más antiguo: ante igual puntaje gana el
   * más nuevo.
   */
  private matchDocuments(
    docTypes: any[],
    docs: any[],
  ): { byType: Map<number, any>; usedDocIds: Set<number> } {
    const pairs: { typeId: number; docIdx: number; score: number }[] = [];

    for (const dt of docTypes) {
      docs.forEach((doc, docIdx) => {
        const score = this.scoreMatch(doc.fileName, dt.name);
        if (score > 0) pairs.push({ typeId: dt.id, docIdx, score });
      });
    }

    pairs.sort((a, b) => b.score - a.score || a.docIdx - b.docIdx);

    const byType = new Map<number, any>();
    const usedIdx = new Set<number>();
    const usedDocIds = new Set<number>();

    for (const pair of pairs) {
      if (byType.has(pair.typeId) || usedIdx.has(pair.docIdx)) continue;
      const doc = docs[pair.docIdx];
      byType.set(pair.typeId, doc);
      usedIdx.add(pair.docIdx);
      usedDocIds.add(doc.id);
    }

    return { byType, usedDocIds };
  }

  /**
   * Variante para listas de archivos crudos de la API de Drive, que traen `name`
   * en lugar de `fileName`.
   */
  private hasMatchingFile(files: any[], docTypeName: string): boolean {
    return files.some(
      (f) => this.scoreMatch(f.fileName ?? f.name, docTypeName) > 0,
    );
  }

  private findMatchingFile(files: any[], docTypeName: string): any {
    let best: any;
    let bestScore = 0;
    for (const f of files) {
      const score = this.scoreMatch(f.fileName ?? f.name, docTypeName);
      if (score > bestScore) {
        bestScore = score;
        best = f;
      }
    }
    return best;
  }

  /**
   * Wrapper público de findMatchingFile para que otros servicios de Personal
   * (p. ej. CumplimientoEntidadService, matcheando RequisitoDocumento contra
   * EmployeeDocument) reutilicen el mismo scoring por substring/palabras sin
   * duplicarlo. `files` acepta objetos con `fileName` (EmployeeDocument) o
   * `name` (respuesta cruda de la API de Drive).
   */
  findMatchingDocument(files: any[], requiredName: string): any {
    return this.findMatchingFile(files, requiredName);
  }

  // Los campos/archivos requeridos de un puesto se guardan como JSON con
  // forma { nombre, tipo? } / { nombre, extensiones? }. Estos normalizadores
  // toleran datos históricos guardados como texto plano (versión anterior de
  // esta feature) o con claves en inglés (name/extensions, de una migración
  // intermedia), para que ninguna pantalla se rompa por datos viejos.
  // obligatorio: si el dato no trae la clave (datos de antes de esta
  // funcionalidad), se asume true para no aflojar de golpe requisitos que
  // ya eran obligatorios.
  private normalizeObligatorio(item: any): boolean {
    if (item?.obligatorio !== undefined) return !!item.obligatorio;
    if (item?.required !== undefined) return !!item.required;
    return true;
  }

  private normalizeCampo(item: any): {
    nombre: string;
    tipo?: string;
    obligatorio: boolean;
  } {
    if (typeof item === 'string') return { nombre: item, obligatorio: true };
    return {
      nombre: item?.nombre || item?.name || '',
      tipo: item?.tipo || item?.type || undefined,
      obligatorio: this.normalizeObligatorio(item),
    };
  }

  private normalizeArchivo(item: any): {
    nombre: string;
    extensiones: string[];
    obligatorio: boolean;
  } {
    if (typeof item === 'string')
      return { nombre: item, extensiones: [], obligatorio: true };
    return {
      nombre: item?.nombre || item?.name || '',
      extensiones: item?.extensiones || item?.extensions || [],
      obligatorio: this.normalizeObligatorio(item),
    };
  }

  private normalizeCamposList(
    raw: any,
  ): { nombre: string; tipo?: string; obligatorio: boolean }[] {
    return (Array.isArray(raw) ? raw : [])
      .map((item) => this.normalizeCampo(item))
      .filter((c) => c.nombre);
  }

  private normalizeArchivosList(
    raw: any,
  ): { nombre: string; extensiones: string[]; obligatorio: boolean }[] {
    return (Array.isArray(raw) ? raw : [])
      .map((item) => this.normalizeArchivo(item))
      .filter((a) => a.nombre);
  }

  async getTree(companyId: number) {
    if (!companyId) return { CUSTODIAS: [], PERSONAL: [], PERSONAL_ADMIN: [] };
    const folders = await this.prisma.employeeDriveFolder.findMany({
      where: { companyId },
      orderBy: [{ folderType: 'asc' }, { employeeName: 'asc' }],
    });

    const tree: Record<string, any[]> = {
      CUSTODIAS: [],
      PERSONAL: [],
      PERSONAL_ADMIN: [],
    };
    for (const f of folders) {
      const docs = await this.prisma.employeeDocument.findMany({
        where: { companyId, cedula: f.cedula },
      });
      tree[f.folderType]?.push({
        employeeName: f.employeeName,
        cedula: f.cedula,
        puesto: f.puesto,
        folderUrl: f.folderUrl,
        lastSyncAt: f.lastSyncAt,
        documentCount: docs.length,
      });
    }

    return tree;
  }

  async getDocumentTypes(companyId: number) {
    if (!companyId) return [];
    return this.prisma.documentType.findMany({
      where: { companyId },
      orderBy: [{ folder: 'asc' }, { name: 'asc' }],
    });
  }

  async createDocumentType(
    data: { name: string; folder: string; required?: boolean },
    companyId: number,
  ) {
    if (!companyId)
      throw new BadRequestException('Usuario sin empresa asociada');
    return this.prisma.documentType.create({
      data: {
        name: data.name,
        folder: data.folder,
        required: data.required ?? true,
        companyId,
      },
    });
  }

  async updateDocumentType(
    id: number,
    data: { name?: string; required?: boolean },
    companyId: number,
  ) {
    if (!companyId)
      throw new BadRequestException('Usuario sin empresa asociada');
    const dt = await this.prisma.documentType.findFirst({
      where: { id, companyId },
    });
    if (!dt) throw new BadRequestException('Tipo de documento no encontrado');
    return this.prisma.documentType.update({ where: { id }, data });
  }

  async deleteDocumentType(id: number, companyId: number) {
    if (!companyId)
      throw new BadRequestException('Usuario sin empresa asociada');
    const dt = await this.prisma.documentType.findFirst({
      where: { id, companyId },
    });
    if (!dt) throw new BadRequestException('Tipo de documento no encontrado');
    return this.prisma.documentType.delete({ where: { id } });
  }

  private async listSubFolders(parentId: string) {
    const drive = this.getDriveClient();
    const res = await drive.files.list({
      q: `'${parentId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
      fields: 'files(id, name)',
      pageSize: 100,
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
    });
    return res.data.files || [];
  }

  private async listFilesInFolder(folderId: string) {
    const drive = this.getDriveClient();
    const res = await drive.files.list({
      q: `'${folderId}' in parents and trashed = false and mimeType != 'application/vnd.google-apps.folder'`,
      fields: 'files(id, name, mimeType)',
      pageSize: 100,
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
    });
    return res.data.files || [];
  }

  // Fase A del módulo de cumplimiento por entidad: RRHH confirma manualmente
  // la fecha de vencimiento de un documento ya sincronizado desde Drive.
  async setDocumentExpiry(
    driveFileId: string,
    data: { issueDate?: string; expiryDate?: string },
    companyId: number,
    userId: number,
  ) {
    if (!companyId)
      throw new BadRequestException('Usuario sin empresa asociada');
    const doc = await this.prisma.employeeDocument.findFirst({
      where: { driveFileId, companyId },
    });
    if (!doc)
      throw new BadRequestException(
        'Documento no encontrado para esta empresa.',
      );

    return this.prisma.employeeDocument.update({
      where: { id: doc.id },
      data: {
        issueDate: data.issueDate ? new Date(data.issueDate) : undefined,
        expiryDate: data.expiryDate ? new Date(data.expiryDate) : undefined,
        expiryConfirmedBy: userId,
      },
    });
  }

  // Descarga los bytes reales de un archivo de Drive (no solo metadata, a
  // diferencia de listFilesInFolder/listSubFolders). Único punto de este
  // servicio que trae contenido binario en vez de listados — lo usa
  // DocumentExtractionService (Fase B de cumplimiento por entidad) para pasarle
  // el PDF a pdf-parse. `supportsAllDrives: true` por consistencia con el resto
  // de llamadas de este archivo (compatibilidad con unidades compartidas).
  async downloadFileBuffer(driveFileId: string): Promise<Buffer> {
    const drive = this.getDriveClient();
    const res = await drive.files.get(
      { fileId: driveFileId, alt: 'media', supportsAllDrives: true },
      { responseType: 'arraybuffer' },
    );
    return Buffer.from(res.data as ArrayBuffer);
  }

  // RRHH reclasifica un archivo "adicional" (subido en la carpeta equivocada,
  // p. ej. la cédula subida como adicional en vez de en su casilla) como el
  // documento requerido X que en realidad es. Se renombra el archivo en Drive
  // incluyendo el nombre del tipo de documento, para que el mismo matching por
  // nombre (scoreMatch/matchDocuments) lo reconozca solo la próxima vez que se
  // calcule el checklist — sin agregar un modelo de asociación nuevo.
  async reassignDocumentType(
    driveFileId: string,
    documentTypeId: number,
    companyId: number,
  ) {
    if (!companyId)
      throw new BadRequestException('Usuario sin empresa asociada');

    const doc = await this.prisma.employeeDocument.findFirst({
      where: { driveFileId, companyId },
    });
    if (!doc)
      throw new BadRequestException(
        'Documento no encontrado para esta empresa.',
      );

    const docType = await this.prisma.documentType.findFirst({
      where: { id: documentTypeId, companyId },
    });
    if (!docType)
      throw new BadRequestException(
        'Tipo de documento no encontrado para esta empresa.',
      );
    if (docType.folder !== doc.folder) {
      throw new BadRequestException(
        'El tipo de documento seleccionado pertenece a otra sección.',
      );
    }

    const extMatch = doc.fileName.match(/\.[^/.]+$/);
    const extension = extMatch ? extMatch[0] : '';
    const baseName = extension
      ? doc.fileName.slice(0, -extension.length)
      : doc.fileName;
    const newFileName = `${docType.name} - ${baseName}${extension}`;

    try {
      const drive = this.getDriveClient();
      await drive.files.update({
        fileId: driveFileId,
        requestBody: { name: newFileName },
        supportsAllDrives: true,
      });
    } catch (err) {
      throw new BadRequestException(
        `No se pudo renombrar el archivo en Drive: ${err.message}`,
      );
    }

    return this.prisma.employeeDocument.update({
      where: { id: doc.id },
      data: { fileName: newFileName },
    });
  }

  async deleteEmployeeByCedula(cedula: string, companyId: number) {
    if (!companyId)
      throw new BadRequestException('Usuario sin empresa asociada');

    await this.prisma.employeeDocument.deleteMany({
      where: { companyId, cedula },
    });

    await this.prisma.candidate.deleteMany({
      where: { companyId, cedula },
    });

    return this.prisma.employeeDriveFolder.deleteMany({
      where: { companyId, cedula },
    });
  }

  // Mueve la carpeta de un guardia a la carpeta de archivo configurada
  // (FolderConfig type='GUARDIAS_ARCHIVO') una vez que su salida ya está
  // COMPLETADA. Es manual (RRHH lo dispara desde el detalle del movimiento),
  // no automático al completarse la salida, para no mover carpetas por
  // accidente. No borra ni un documento — solo cambia de padre en Drive.
  async archivarCarpetaGuardia(companyId: number, cedula: string) {
    if (!companyId)
      throw new BadRequestException('Usuario sin empresa asociada');

    const folder = await this.prisma.employeeDriveFolder.findUnique({
      where: { companyId_cedula: { companyId, cedula } },
    });
    if (!folder) {
      throw new BadRequestException(
        'Este guardia no tiene una carpeta de Drive vinculada.',
      );
    }

    const activo = await this.movimientoPersonalService.isActivo(
      companyId,
      cedula,
    );
    if (activo) {
      throw new BadRequestException(
        'Solo se puede archivar la carpeta de un guardia cuya salida ya esté completada.',
      );
    }

    const config = await this.prisma.folderConfig.findFirst({
      where: { companyId, type: 'GUARDIAS_ARCHIVO' },
    });
    if (!config) {
      throw new BadRequestException(
        'No hay carpeta de archivo configurada. Configúrala primero (carpeta destino para guardias fuera).',
      );
    }

    try {
      const drive = this.getDriveClient();
      const current = await drive.files.get({
        fileId: folder.folderId,
        fields: 'parents',
        supportsAllDrives: true,
      });
      const previousParents = (current.data.parents || []).join(',');
      await drive.files.update({
        fileId: folder.folderId,
        addParents: this.sanitizeFolderId(config.driveFolderId),
        removeParents: previousParents,
        fields: 'id, parents',
        supportsAllDrives: true,
      });
    } catch (err) {
      throw new BadRequestException(
        `No se pudo mover la carpeta en Drive: ${err.message}`,
      );
    }

    return { cedula, folderId: folder.folderId, archivedTo: config.driveFolderName };
  }

  // La carpeta de Reclutamiento es su propia carpeta raíz dedicada (config
  // type='RECLUTAMIENTO'), independiente de la de Cumplimiento. Dentro de
  // ella hay una subcarpeta por cada Puesto/Vacante (creada automáticamente
  // al crear el puesto); esa subcarpeta contiene el JSON del puesto y, como
  // hermanas, las carpetas de los candidatos postulados a esa vacante.
  private async getReclutamientoFolderId(companyId: number): Promise<string> {
    const config = await this.prisma.folderConfig.findFirst({
      where: { companyId, type: 'RECLUTAMIENTO' },
    });
    if (!config) {
      throw new BadRequestException(
        'No hay carpeta de Drive configurada para Reclutamiento. Configúrala en la tuerca ⚙ de la página de Reclutamiento.',
      );
    }
    return this.sanitizeFolderId(config.driveFolderId);
  }

  async getJobPositions(companyId: number) {
    if (!companyId) return [];
    const positions = await this.prisma.jobPosition.findMany({
      where: { companyId },
      orderBy: { createdAt: 'desc' },
    });
    return positions.map((p) => ({
      ...p,
      camposRequeridos: this.normalizeCamposList(p.camposRequeridos),
      archivosRequeridos: this.normalizeArchivosList(p.archivosRequeridos),
    }));
  }

  async createJobPosition(
    dto: {
      puesto: string;
      descripcion?: string;
      camposRequeridos?: any[];
      archivosRequeridos?: any[];
      estado?: string;
    },
    companyId: number,
  ) {
    if (!companyId)
      throw new BadRequestException('Usuario sin empresa asociada');
    if (!dto.puesto?.trim())
      throw new BadRequestException('El nombre del puesto es obligatorio.');

    const position = await this.prisma.jobPosition.create({
      data: {
        puesto: dto.puesto.trim(),
        estado: dto.estado || 'ABIERTA',
        descripcion: dto.descripcion?.trim() || null,
        camposRequeridos: this.normalizeCamposList(dto.camposRequeridos),
        archivosRequeridos: this.normalizeArchivosList(dto.archivosRequeridos),
        companyId,
      },
    });

    let driveSynced = false;
    let driveWarning: string | null = null;
    let driveFolderId: string | undefined;
    let driveFileId: string | undefined;

    try {
      const drive = this.getDriveClient();
      const recFolderId = await this.getReclutamientoFolderId(companyId);

      // 1) Carpeta propia de la vacante (contendrá el JSON + las carpetas de candidatos).
      const folder = await drive.files.create({
        requestBody: {
          name: position.puesto,
          parents: [recFolderId],
          mimeType: 'application/vnd.google-apps.folder',
        },
        fields: 'id',
        supportsAllDrives: true,
      });
      driveFolderId = folder.data?.id || undefined;
      if (!driveFolderId) {
        throw new Error('Drive no devolvió un ID para la carpeta creada.');
      }

      // 2) JSON del puesto, dentro de esa carpeta.
      const jsonPayload = JSON.stringify(
        {
          id: position.id,
          puesto: position.puesto,
          descripcion: position.descripcion || '',
          // Espejo booleano de `estado` para quien abre el JSON directamente
          // en Drive — igual que `estado`, nunca se lee de vuelta (Postgres
          // manda, ver comentario en updateJobPosition/syncJobPositionsFromDrive).
          abierta: position.estado === 'ABIERTA',
          camposRequeridos: position.camposRequeridos || [],
          archivosRequeridos: position.archivosRequeridos || [],
          createdAt: position.createdAt,
        },
        null,
        2,
      );

      const fileName = `Puesto_${position.puesto.replace(/[^a-zA-Z0-9\-_]/g, '_')}.json`;

      const driveFile = await drive.files.create({
        requestBody: {
          name: fileName,
          parents: [driveFolderId],
          mimeType: 'application/json',
        },
        media: { mimeType: 'application/json', body: jsonPayload },
        fields: 'id',
        supportsAllDrives: true,
      });

      driveFileId = driveFile.data?.id || undefined;
      if (driveFileId) {
        await this.prisma.jobPosition.update({
          where: { id: position.id },
          data: { driveFolderId, driveFileId },
        });
        driveSynced = true;
      }
    } catch (err) {
      this.logger.warn(
        `No se pudo sincronizar puesto con Drive: ${err.message}`,
      );
      driveWarning = `Puesto creado en BD. No se pudo sincronizar con Drive: ${err.message}`;
    }

    return {
      ...position,
      driveFolderId,
      driveFileId,
      driveSynced,
      driveWarning,
    };
  }

  async updateJobPosition(
    id: number,
    dto: {
      puesto?: string;
      descripcion?: string;
      camposRequeridos?: any[];
      archivosRequeridos?: any[];
      estado?: string;
    },
    companyId: number,
  ) {
    if (!companyId)
      throw new BadRequestException('Usuario sin empresa asociada');
    const position = await this.prisma.jobPosition.findFirst({
      where: { id, companyId },
    });
    if (!position) throw new BadRequestException('Puesto no encontrado.');

    const updateData: any = {};
    if (dto.puesto !== undefined) updateData.puesto = dto.puesto.trim();
    if (dto.descripcion !== undefined)
      updateData.descripcion = dto.descripcion?.trim() || null;
    if (dto.camposRequeridos !== undefined)
      updateData.camposRequeridos = this.normalizeCamposList(
        dto.camposRequeridos,
      );
    if (dto.archivosRequeridos !== undefined)
      updateData.archivosRequeridos = this.normalizeArchivosList(
        dto.archivosRequeridos,
      );
    if (dto.estado !== undefined) updateData.estado = dto.estado;

    let updated = await this.prisma.jobPosition.update({
      where: { id },
      data: updateData,
    });

    let driveWarning: string | null = null;
    let driveFolderId = position.driveFolderId;

    // Si cambió el nombre del puesto, renombrar también su carpeta en Drive
    // para que siga coincidiendo (la sincronización empareja por nombre).
    if (
      driveFolderId &&
      dto.puesto !== undefined &&
      updated.puesto !== position.puesto
    ) {
      try {
        const drive = this.getDriveClient();
        await drive.files.update({
          fileId: driveFolderId,
          requestBody: { name: updated.puesto },
          supportsAllDrives: true,
        });
      } catch (err) {
        this.logger.warn(
          `No se pudo renombrar la carpeta de Drive: ${err.message}`,
        );
        driveWarning = `Puesto actualizado. No se pudo renombrar la carpeta en Drive: ${err.message}`;
      }
    }

    // Actualizar el JSON del puesto en Drive. Postgres es la única fuente de
    // verdad para camposRequeridos/archivosRequeridos (ver syncJobPositionsFromDrive);
    // este JSON es solo un espejo de salida. Si el enlace con Drive está roto
    // (driveFolderId/driveFileId ausentes por un fallo previo al crear el
    // puesto), se autorrepara creándolos ahora en vez de saltarse la
    // sincronización en silencio para siempre.
    try {
      const drive = this.getDriveClient();
      const jsonPayload = JSON.stringify(
        {
          id: updated.id,
          puesto: updated.puesto,
          descripcion: updated.descripcion || '',
          abierta: updated.estado === 'ABIERTA',
          camposRequeridos: updated.camposRequeridos || [],
          archivosRequeridos: updated.archivosRequeridos || [],
          createdAt: updated.createdAt,
          updatedAt: updated.updatedAt,
        },
        null,
        2,
      );

      if (!driveFolderId) {
        const recFolderId = await this.getReclutamientoFolderId(companyId);
        const folder = await drive.files.create({
          requestBody: {
            name: updated.puesto,
            parents: [recFolderId],
            mimeType: 'application/vnd.google-apps.folder',
          },
          fields: 'id',
          supportsAllDrives: true,
        });
        driveFolderId = folder.data?.id || undefined;
        if (!driveFolderId) {
          throw new Error('Drive no devolvió un ID para la carpeta creada.');
        }
      }

      // No confiar ciegamente en position.driveFileId: si por un bug/edición
      // manual previa quedó apuntando a un archivo que ya no es el JSON real
      // de esta carpeta (o fue borrado/movido), la escritura "tendría éxito"
      // sobre un archivo huérfano y el JSON que el usuario ve en Drive nunca
      // cambiaría. Se busca el .json que realmente existe hoy en la carpeta y
      // se usa ese id (autorreparando el que había en BD si estaba mal).
      let driveFileId = position.driveFileId;
      try {
        const filesInFolder = await this.listFilesInFolder(driveFolderId);
        const currentJsonFile = filesInFolder.find((f: any) =>
          f.name.toLowerCase().endsWith('.json'),
        );
        if (currentJsonFile) driveFileId = currentJsonFile.id;
      } catch (err) {
        this.logger.warn(
          `No se pudo listar la carpeta del puesto para ubicar su JSON actual: ${err.message}`,
        );
      }

      if (driveFileId) {
        await drive.files.update({
          fileId: driveFileId,
          media: { mimeType: 'application/json', body: jsonPayload },
          supportsAllDrives: true,
        });
      } else {
        const fileName = `Puesto_${updated.puesto.replace(/[^a-zA-Z0-9\-_]/g, '_')}.json`;
        const driveFile = await drive.files.create({
          requestBody: {
            name: fileName,
            parents: [driveFolderId],
            mimeType: 'application/json',
          },
          media: { mimeType: 'application/json', body: jsonPayload },
          fields: 'id',
          supportsAllDrives: true,
        });
        driveFileId = driveFile.data?.id || undefined;
      }

      if (
        driveFolderId !== position.driveFolderId ||
        driveFileId !== position.driveFileId
      ) {
        updated = await this.prisma.jobPosition.update({
          where: { id },
          data: { driveFolderId, driveFileId },
        });
      }
    } catch (err) {
      this.logger.warn(
        `No se pudo actualizar el archivo JSON en Drive: ${err.message}`,
      );
      driveWarning = `Puesto actualizado en BD. No se pudo sincronizar con Drive: ${err.message}`;
    }

    return { ...updated, driveWarning };
  }

  async deleteJobPosition(id: number, companyId: number) {
    if (!companyId)
      throw new BadRequestException('Usuario sin empresa asociada');
    const position = await this.prisma.jobPosition.findFirst({
      where: { id, companyId },
    });
    if (!position) throw new BadRequestException('Puesto no encontrado.');

    // Se envía a la papelera de Drive (reversible) en vez de borrar
    // permanentemente, ya que la carpeta del puesto puede contener las
    // carpetas de candidatos reales que ya postularon.
    if (position.driveFolderId || position.driveFileId) {
      try {
        const drive = this.getDriveClient();
        await drive.files.update({
          fileId: position.driveFolderId || position.driveFileId!,
          requestBody: { trashed: true },
          supportsAllDrives: true,
        });
      } catch (err) {
        this.logger.warn(
          `No se pudo enviar a la papelera la carpeta/archivo de Drive: ${err.message}`,
        );
      }
    }

    return this.prisma.jobPosition.delete({ where: { id } });
  }

  async syncJobPositionsFromDrive(companyId: number) {
    if (!companyId)
      throw new BadRequestException('Usuario sin empresa asociada');

    const config = await this.prisma.folderConfig.findFirst({
      where: { companyId, type: 'RECLUTAMIENTO' },
    });
    if (!config) {
      return {
        synced: 0,
        created: 0,
        updated: 0,
        skipped: 0,
        puestos: [],
        warning:
          'No hay carpeta de Drive configurada para Reclutamiento (tuerca ⚙).',
      };
    }

    let recFolderId: string;
    try {
      recFolderId = await this.getReclutamientoFolderId(companyId);
    } catch (err) {
      return {
        synced: 0,
        created: 0,
        updated: 0,
        skipped: 0,
        puestos: [],
        warning: `No se pudo acceder a RECLUTAMIENTO: ${err.message}`,
      };
    }

    const drive = this.getDriveClient();
    let puestoFolders: any[] = [];
    try {
      puestoFolders = await this.listSubFolders(recFolderId);
    } catch (err) {
      return {
        synced: 0,
        created: 0,
        updated: 0,
        skipped: 0,
        puestos: [],
        warning: `Error listando carpetas de puestos: ${err.message}`,
      };
    }

    if (puestoFolders.length === 0) {
      return {
        synced: 0,
        created: 0,
        updated: 0,
        skipped: 0,
        puestos: [],
        warning: 'No hay carpetas de puestos en la carpeta RECLUTAMIENTO.',
      };
    }

    const existingPositions = await this.prisma.jobPosition.findMany({
      where: { companyId },
    });
    let created = 0,
      updated = 0,
      skipped = 0,
      deleted = 0;
    const result: any[] = [];
    const matchedPositionIds = new Set<number>();

    for (const puestoFolder of puestoFolders) {
      try {
        // Cada carpeta de puesto contiene su JSON (Puesto_*.json) como
        // hermano de las carpetas de candidatos.
        const filesInFolder = await this.listFilesInFolder(puestoFolder.id);
        const jsonFile = filesInFolder.find((f: any) =>
          f.name.toLowerCase().endsWith('.json'),
        );

        let jsonData: any = {};
        if (jsonFile) {
          const fileRes = await drive.files.get(
            { fileId: jsonFile.id, alt: 'media', supportsAllDrives: true },
            { responseType: 'text' },
          );
          jsonData =
            typeof fileRes.data === 'string'
              ? JSON.parse(fileRes.data)
              : fileRes.data;
        }

        const puestoName =
          jsonData.puesto || jsonData.nombre || puestoFolder.name;
        if (!puestoName || !puestoName.trim()) {
          skipped++;
          continue;
        }

        const existing =
          existingPositions.find((p) => p.driveFolderId === puestoFolder.id) ||
          existingPositions.find(
            (p) =>
              p.puesto.toLowerCase().trim() === puestoName.toLowerCase().trim(),
          );

        if (existing) {
          matchedPositionIds.add(existing.id);
          // Postgres es la única fuente de verdad para camposRequeridos/
          // archivosRequeridos/descripcion de un puesto que ya existe en BD
          // (se editan vía updateJobPosition, que a su vez escribe el JSON
          // de Drive). Si esta sync también los leyera de Drive, un JSON
          // desactualizado revertiría ediciones recientes en cada carga de
          // página. Aquí solo se autorrepara el enlace BD<->Drive.
          const needsUpdate =
            existing.driveFolderId !== puestoFolder.id ||
            (jsonFile && existing.driveFileId !== jsonFile.id);

          if (needsUpdate) {
            await this.prisma.jobPosition.update({
              where: { id: existing.id },
              data: {
                driveFolderId: puestoFolder.id,
                driveFileId: jsonFile?.id || existing.driveFileId,
              },
            });
            updated++;
            result.push({
              id: existing.id,
              puesto: puestoName,
              action: 'updated',
              driveFolderId: puestoFolder.id,
            });
          } else {
            skipped++;
            result.push({
              id: existing.id,
              puesto: puestoName,
              action: 'unchanged',
            });
          }
        } else {
          const newPosition = await this.prisma.jobPosition.create({
            data: {
              puesto: puestoName.trim(),
              descripcion: jsonData.descripcion || null,
              camposRequeridos: this.normalizeCamposList(
                jsonData.camposRequeridos,
              ),
              archivosRequeridos: this.normalizeArchivosList(
                jsonData.archivosRequeridos,
              ),
              driveFolderId: puestoFolder.id,
              driveFileId: jsonFile?.id || null,
              companyId,
            },
          });
          created++;
          matchedPositionIds.add(newPosition.id);
          result.push({
            id: newPosition.id,
            puesto: puestoName,
            action: 'created',
            driveFolderId: puestoFolder.id,
          });
        }
      } catch (err) {
        this.logger.warn(
          `Error procesando carpeta de puesto ${puestoFolder.name}: ${err.message}`,
        );
        skipped++;
      }
    }

    // Huérfanos: puestos que se sincronizaron desde Drive alguna vez
    // (driveFolderId no nulo) pero cuya carpeta ya no está entre las
    // carpetas actuales de RECLUTAMIENTO. Los puestos sin driveFolderId
    // (creados sin conexión a Drive, p. ej. antes de esta versión) nunca se
    // tocan aquí.
    const orphans = existingPositions.filter(
      (p) => p.driveFolderId && !matchedPositionIds.has(p.id),
    );
    for (const orphan of orphans) {
      try {
        await this.prisma.jobPosition.delete({ where: { id: orphan.id } });
        deleted++;
        result.push({
          id: orphan.id,
          puesto: orphan.puesto,
          action: 'deleted-orphan',
        });
      } catch (err) {
        this.logger.warn(
          `No se pudo eliminar puesto huérfano ${orphan.puesto}: ${err.message}`,
        );
      }
    }

    return {
      synced: puestoFolders.length,
      created,
      updated,
      skipped,
      deleted,
      puestos: result,
    };
  }

  async syncReclutamientoCandidates(companyId: number) {
    if (!companyId)
      throw new BadRequestException('Usuario sin empresa asociada');

    const config = await this.prisma.folderConfig.findFirst({
      where: { companyId, type: 'RECLUTAMIENTO' },
    });
    if (!config) {
      return {
        puestosCount: 0,
        candidatosCount: 0,
        candidatos: [],
        warning:
          'No hay carpeta de Drive configurada para Reclutamiento. Configúrala en la tuerca ⚙ de esta página.',
      };
    }

    let recFolderId: string;
    try {
      recFolderId = await this.getReclutamientoFolderId(companyId);
    } catch (err) {
      return {
        puestosCount: 0,
        candidatosCount: 0,
        candidatos: [],
        warning: `No se pudo acceder a la carpeta de Reclutamiento: ${err.message}`,
      };
    }

    const jobPositions = await this.getJobPositions(companyId);

    // Estructura esperada: RECLUTAMIENTO/<Puesto>/<Nombre - Cédula>/archivos...
    // Cada subcarpeta de la raíz es un PUESTO (idealmente con el mismo nombre
    // que un JobPosition); los candidatos viven un nivel más abajo, dentro de
    // su carpeta de puesto. Los "Puesto_*.json" quedan sueltos en la raíz y
    // listSubFolders ya los ignora (solo devuelve carpetas).
    let puestoFolders: any[] = [];
    try {
      puestoFolders = await this.listSubFolders(recFolderId);
    } catch (err) {
      this.logger.warn(
        `Error listando subcarpetas de Reclutamiento: ${err.message}`,
      );
    }

    const drive = this.getDriveClient();
    const candidateList: any[] = [];

    for (const puestoFolder of puestoFolders) {
      const matchedPosition = jobPositions.find(
        (p) =>
          p.puesto.toLowerCase().trim() ===
          puestoFolder.name.toLowerCase().trim(),
      );

      let candidateFolders: any[] = [];
      try {
        candidateFolders = await this.listSubFolders(puestoFolder.id);
      } catch (err) {
        this.logger.warn(
          `Error listando candidatos en la carpeta de puesto "${puestoFolder.name}": ${err.message}`,
        );
        continue;
      }

      for (const folder of candidateFolders) {
        try {
          const parsed = this.parseEmployeeFolderName(folder.name, folder.id);
          const files = await this.listFilesInFolder(folder.id);

          let candidatoJsonData: any = null;
          const jsonFile = files.find((f: any) =>
            f.name.toLowerCase().endsWith('.json'),
          );

          if (jsonFile) {
            try {
              const fileRes = await drive.files.get(
                { fileId: jsonFile.id, alt: 'media', supportsAllDrives: true },
                { responseType: 'text' },
              );
              candidatoJsonData =
                typeof fileRes.data === 'string'
                  ? JSON.parse(fileRes.data)
                  : fileRes.data;
            } catch (e) {
              this.logger.warn(
                `Error leyendo candidato.json en ${folder.name}: ${e.message}`,
              );
            }
          }

          // datosFormulario es el mapa { [campoRequerido.nombre]: valor } que
          // guarda saveCandidatoDatos. Se acepta también un candidato.json
          // "plano" (sin la clave datosFormulario) por compatibilidad con
          // archivos creados a mano antes de que existiera este formulario.
          const datosFormulario: Record<string, any> =
            candidatoJsonData?.datosFormulario || candidatoJsonData || {};

          const nombre =
            this.buscarDatoFormulario(datosFormulario, [
              'nombre completo',
              'nombre',
            ]) ||
            candidatoJsonData?.nombreCompleto ||
            candidatoJsonData?.nombre ||
            parsed.name;
          const cedula =
            this.buscarDatoFormulario(datosFormulario, ['cedula']) ||
            candidatoJsonData?.cedula ||
            parsed.cedula;
          const telefono =
            this.buscarDatoFormulario(datosFormulario, [
              'telefono',
              'celular',
            ]) ||
            candidatoJsonData?.telefono ||
            '';
          const email =
            this.buscarDatoFormulario(datosFormulario, ['email', 'correo']) ||
            candidatoJsonData?.email ||
            '';
          const puestoAplicado =
            candidatoJsonData?.puestoAplicado ||
            candidatoJsonData?.puesto ||
            matchedPosition?.puesto ||
            puestoFolder.name;

          const archivosRequeridos: {
            nombre: string;
            extensiones: string[];
            obligatorio?: boolean;
          }[] = matchedPosition?.archivosRequeridos || [];
          // Solo los archivos marcados como obligatorios cuentan para el % de
          // Completitud — uno opcional que falte no debe bloquearlo (mismo
          // criterio que DocumentType.required en Cumplimiento por Entidad).
          let archivosPresentesCount = 0;
          const matchedFileIds: string[] = [];

          if (archivosRequeridos.length > 0) {
            for (const reqDoc of archivosRequeridos) {
              const match = this.findMatchingFile(files, reqDoc.nombre);
              if (match) {
                matchedFileIds.push(match.id);
                if (reqDoc.obligatorio !== false) archivosPresentesCount++;
              }
            }
          } else {
            archivosPresentesCount = files.length;
            matchedFileIds.push(...files.map((f: any) => f.id));
          }

          const archivosObligatoriosCount = archivosRequeridos.filter(
            (r) => r.obligatorio !== false,
          ).length;

          const completitudPercent =
            archivosRequeridos.length === 0
              ? files.length > 0
                ? 100
                : 0
              : archivosObligatoriosCount === 0
                ? 100
                : Math.min(
                    100,
                    Math.round(
                      (archivosPresentesCount / archivosObligatoriosCount) *
                        100,
                    ),
                  );

          candidateList.push({
            id: folder.id,
            nombre,
            cedula,
            puestoAplicado,
            completitudPercent,
            archivosSubidosCount: files.length,
            archivosRequeridosCount: archivosRequeridos.length,
            archivosRequeridos,
            camposRequeridos: matchedPosition?.camposRequeridos || [],
            archivosSubidosList: files.map((f: any) => ({
              id: f.id,
              name: f.name,
            })),
            // Archivos que el postulante subió pero que no matchearon ningún
            // archivoRequerido del puesto (p. ej. la cédula subida "como
            // adicional" en vez de en su casilla). RRHH puede reclasificarlos
            // con reassignReclutamientoFile. El/los .json (candidato.json) se
            // excluyen: son metadata del expediente, no un documento del
            // postulante.
            archivosAdicionales: files
              .filter(
                (f: any) =>
                  !matchedFileIds.includes(f.id) &&
                  !f.name.toLowerCase().endsWith('.json'),
              )
              .map((f: any) => ({ id: f.id, name: f.name })),
            folderUrl: `https://drive.google.com/drive/folders/${folder.id}`,
            datosFormulario,
            telefono,
            email,
            _matchedFileIds: matchedFileIds,
          });
        } catch (err) {
          this.logger.error(
            `Error procesando carpeta candidato ${folder.name}: ${err.message}`,
          );
        }
      }
    }

    // Anota cada candidato con cuántos de sus documentos subidos están
    // rechazados o todavía sin revisar, para que RRHH pueda priorizar a quién
    // atender primero (en vez de un orden alfabético ciego).
    const cedulas = [...new Set(candidateList.map((c) => c.cedula))];
    let reviews: {
      cedula: string;
      driveFileId: string | null;
      status: string;
    }[] = [];
    if (cedulas.length > 0) {
      try {
        reviews = await this.prisma.documentReview.findMany({
          where: { companyId, cedula: { in: cedulas } },
          select: { cedula: true, driveFileId: true, status: true },
        });
      } catch (err) {
        this.logger.warn(
          `Error obteniendo revisiones de documentos: ${err.message}`,
        );
      }
    }
    const reviewsByCedula = new Map<string, Map<string, string>>();
    for (const r of reviews) {
      if (!r.driveFileId) continue;
      if (!reviewsByCedula.has(r.cedula))
        reviewsByCedula.set(r.cedula, new Map());
      reviewsByCedula.get(r.cedula)!.set(r.driveFileId, r.status);
    }

    for (const candidate of candidateList) {
      const reviewByFileId = reviewsByCedula.get(candidate.cedula);
      let rechazados = 0;
      let pendientesRevision = 0;
      for (const fileId of candidate._matchedFileIds as string[]) {
        const status = reviewByFileId?.get(fileId);
        if (status === 'RECHAZADO') rechazados++;
        else if (!status || status === 'PENDIENTE') pendientesRevision++;
      }
      candidate.documentosRechazados = rechazados;
      candidate.documentosPendientesRevision = pendientesRevision;
      delete candidate._matchedFileIds;
    }

    candidateList.sort(
      (a, b) =>
        b.documentosRechazados - a.documentosRechazados ||
        b.documentosPendientesRevision - a.documentosPendientesRevision ||
        a.completitudPercent - b.completitudPercent ||
        a.nombre.localeCompare(b.nombre),
    );

    return {
      puestosCount: jobPositions.length,
      candidatosCount: candidateList.length,
      candidatos: candidateList,
    };
  }

  // RRHH reclasifica un archivo "adicional" de un candidato de Reclutamiento
  // (uno que syncReclutamientoCandidates dejó en archivosAdicionales por no
  // matchear ningún archivoRequerido) como el documento faltante X. A
  // diferencia de reassignDocumentType (candidatos ya en BD como
  // EmployeeDocument), aquí no hay ninguna tabla que respalde al candidato de
  // Drive: se lee el nombre actual directo de la API y se renombra, para que
  // el mismo matching por nombre (scoreMatch/findMatchingFile) lo reconozca
  // en el próximo sync.
  async reassignReclutamientoFile(
    driveFileId: string,
    archivoNombre: string,
    companyId: number,
  ) {
    if (!companyId)
      throw new BadRequestException('Usuario sin empresa asociada');
    if (!archivoNombre?.trim())
      throw new BadRequestException(
        'Debes indicar a qué documento requerido corresponde este archivo.',
      );

    const drive = this.getDriveClient();
    let currentName: string;
    try {
      const current = await drive.files.get({
        fileId: driveFileId,
        fields: 'id, name',
        supportsAllDrives: true,
      });
      currentName = current.data?.name || '';
    } catch (err) {
      throw new BadRequestException(
        `No se encontró el archivo en Drive: ${err.message}`,
      );
    }

    const extMatch = currentName.match(/\.[^/.]+$/);
    const extension = extMatch ? extMatch[0] : '';
    const baseName = extension
      ? currentName.slice(0, -extension.length)
      : currentName;
    const newFileName = `${archivoNombre.trim()} - ${baseName}${extension}`;

    try {
      await drive.files.update({
        fileId: driveFileId,
        requestBody: { name: newFileName },
        supportsAllDrives: true,
      });
    } catch (err) {
      throw new BadRequestException(
        `No se pudo renombrar el archivo en Drive: ${err.message}`,
      );
    }

    return { driveFileId, fileName: newFileName };
  }

  // RRHH carga/edita los datos del postulante (uno por cada camposRequerido
  // del puesto: nombre, cédula, teléfono, email, o cualquier campo extra) para
  // un candidato de Reclutamiento. Se guardan en datosFormulario dentro de
  // candidato.json, en la propia carpeta del candidato en Drive — creando el
  // archivo si todavía no existe, o fusionando (merge) si ya había uno.
  async saveCandidatoDatos(
    folderId: string,
    datos: Record<string, string>,
    companyId: number,
  ) {
    if (!companyId)
      throw new BadRequestException('Usuario sin empresa asociada');

    const drive = this.getDriveClient();
    let files: any[];
    try {
      files = await this.listFilesInFolder(folderId);
    } catch (err) {
      throw new BadRequestException(
        `No se pudo acceder a la carpeta del candidato: ${err.message}`,
      );
    }

    const jsonFile = files.find((f: any) =>
      f.name.toLowerCase().endsWith('.json'),
    );

    let candidatoJsonData: any = {};
    if (jsonFile) {
      try {
        const fileRes = await drive.files.get(
          { fileId: jsonFile.id, alt: 'media', supportsAllDrives: true },
          { responseType: 'text' },
        );
        candidatoJsonData =
          (typeof fileRes.data === 'string'
            ? JSON.parse(fileRes.data)
            : fileRes.data) || {};
      } catch (err) {
        this.logger.warn(
          `Error leyendo candidato.json existente en carpeta ${folderId}: ${err.message}`,
        );
      }
    }

    const datosFormularioPrevios =
      candidatoJsonData?.datosFormulario &&
      typeof candidatoJsonData.datosFormulario === 'object'
        ? candidatoJsonData.datosFormulario
        : {};

    const updated = {
      ...candidatoJsonData,
      datosFormulario: { ...datosFormularioPrevios, ...datos },
    };
    const jsonPayload = JSON.stringify(updated, null, 2);

    try {
      if (jsonFile) {
        await drive.files.update({
          fileId: jsonFile.id,
          media: { mimeType: 'application/json', body: jsonPayload },
          supportsAllDrives: true,
        });
      } else {
        await drive.files.create({
          requestBody: {
            name: 'candidato.json',
            parents: [folderId],
            mimeType: 'application/json',
          },
          media: { mimeType: 'application/json', body: jsonPayload },
          fields: 'id',
          supportsAllDrives: true,
        });
      }
    } catch (err) {
      throw new BadRequestException(
        `No se pudo guardar candidato.json en Drive: ${err.message}`,
      );
    }

    return { folderId, datosFormulario: updated.datosFormulario };
  }

  // RRHH marca a un postulante de Reclutamiento como contratado: se guarda el
  // estado en su candidato.json (mismo archivo que usa saveCandidatoDatos) y
  // su carpeta se mueve de Reclutamiento a la raíz de Guardias, dentro del
  // bucket "Sin Asignar" (ver syncEntidadesFolder) — todavía sin entidad,
  // hasta que alguien mueva la carpeta a Público/Privado/<Entidad> a mano.
  // Mueve, no copia ni duplica nada — mismo mecanismo que archivarCarpetaGuardia.
  async contratarCandidato(companyId: number, folderId: string) {
    if (!companyId)
      throw new BadRequestException('Usuario sin empresa asociada');

    const drive = this.getDriveClient();

    let folder: any;
    try {
      const res = await drive.files.get({
        fileId: folderId,
        fields: 'id, name, parents',
        supportsAllDrives: true,
      });
      folder = res.data;
    } catch (err: any) {
      throw new BadRequestException(
        `No se pudo acceder a la carpeta del candidato: ${err.message}`,
      );
    }

    const parsed = this.parseEmployeeFolderName(folder.name, folder.id);
    if (!parsed.cedulaConfiable) {
      throw new BadRequestException(
        'No se pudo leer la cédula del nombre de esta carpeta ("Nombre - Cédula", 10 dígitos). Corrígelo en Drive antes de contratar.',
      );
    }
    const { cedula, name: nombre } = parsed;

    // Mismo espíritu que evitó el caso de los "Juan Perez" duplicados: no se
    // crea un guardia nuevo si esa cédula ya tiene una carpeta vinculada.
    const yaExiste = await this.prisma.employeeDriveFolder.findFirst({
      where: { companyId, cedula },
    });
    if (yaExiste) {
      throw new BadRequestException(
        `Ya existe un guardia con la cédula ${cedula} (${yaExiste.employeeName}). Revisa Listado de Guardias, o usa "Fusionar cédulas duplicadas" en Entidades y Requisitos si son la misma persona.`,
      );
    }

    const config = await this.prisma.folderConfig.findFirst({
      where: { companyId, type: 'CUMPLIMIENTO' },
    });
    if (!config) {
      throw new BadRequestException(
        'No hay carpeta de Guardias configurada. Configúrala primero desde "Configurar Drive" en Listado de Guardias.',
      );
    }
    const raizGuardias = this.sanitizeFolderId(config.driveFolderId);

    // Marca el estado en su candidato.json antes de mover la carpeta — mismo
    // patrón create-vs-update que saveCandidatoDatos.
    try {
      const files = await this.listFilesInFolder(folderId);
      const jsonFile = files.find((f: any) =>
        f.name.toLowerCase().endsWith('.json'),
      );
      let candidatoJsonData: any = {};
      if (jsonFile) {
        try {
          const fileRes = await drive.files.get(
            { fileId: jsonFile.id, alt: 'media', supportsAllDrives: true },
            { responseType: 'text' },
          );
          candidatoJsonData =
            (typeof fileRes.data === 'string'
              ? JSON.parse(fileRes.data)
              : fileRes.data) || {};
        } catch (err: any) {
          this.logger.warn(
            `Error leyendo candidato.json existente en carpeta ${folderId}: ${err.message}`,
          );
        }
      }
      const updated = {
        ...candidatoJsonData,
        estado: 'CONTRATADO',
        fechaContratacion: new Date().toISOString(),
      };
      const jsonPayload = JSON.stringify(updated, null, 2);
      if (jsonFile) {
        await drive.files.update({
          fileId: jsonFile.id,
          media: { mimeType: 'application/json', body: jsonPayload },
          supportsAllDrives: true,
        });
      } else {
        await drive.files.create({
          requestBody: {
            name: 'candidato.json',
            parents: [folderId],
            mimeType: 'application/json',
          },
          media: { mimeType: 'application/json', body: jsonPayload },
          fields: 'id',
          supportsAllDrives: true,
        });
      }
    } catch (err: any) {
      throw new BadRequestException(
        `No se pudo guardar el estado de contratación en Drive: ${err.message}`,
      );
    }

    // Resuelve (o crea si es la primera vez) la carpeta "Sin Asignar" bajo la
    // raíz de Guardias.
    let sinAsignarFolderId: string;
    try {
      const subFolders = await this.listSubFolders(raizGuardias);
      const existente = subFolders.find(
        (f: any) => this.normalizeFolderName(f.name) === 'sin asignar',
      );
      if (existente) {
        sinAsignarFolderId = existente.id;
      } else {
        const created = await drive.files.create({
          requestBody: {
            name: 'Sin Asignar',
            parents: [raizGuardias],
            mimeType: 'application/vnd.google-apps.folder',
          },
          fields: 'id',
          supportsAllDrives: true,
        });
        sinAsignarFolderId = created.data.id;
      }
    } catch (err: any) {
      throw new BadRequestException(
        `No se pudo preparar la carpeta "Sin Asignar" en Drive: ${err.message}`,
      );
    }

    // Mueve la carpeta del candidato ahí — sin copiar ni borrar documentos.
    try {
      const previousParents = (folder.parents || []).join(',');
      await drive.files.update({
        fileId: folderId,
        addParents: sinAsignarFolderId,
        removeParents: previousParents,
        fields: 'id, parents',
        supportsAllDrives: true,
      });
    } catch (err: any) {
      throw new BadRequestException(
        `No se pudo mover la carpeta a Guardias: ${err.message}`,
      );
    }

    return { cedula, nombre, carpetaDestino: 'Sin Asignar' };
  }

  // Crea o sobrescribe Datos_Personales.json dentro de la carpeta del
  // guardia. La ficha en Drive es un espejo de solo lectura: la fuente de la
  // verdad es GuardiaFichaPersonal (editable desde la app) + Candidate (si el
  // guardia vino del Kanban de Reclutamiento, solo como dato base). Nunca se
  // lee de vuelta desde Drive. Un fallo aquí (ej. la carpeta solo está
  // compartida como "Lector") no debe tumbar el resto del sync — el llamador
  // ya envuelve esto en try/catch.
  private async syncFichaPersonal(
    companyId: number,
    cedula: string,
    nombreCarpeta: string,
    folderId: string,
    existingFileId: string | undefined,
  ): Promise<boolean> {
    const [ficha, candidate, activo] = await Promise.all([
      this.prisma.guardiaFichaPersonal.findUnique({
        where: { companyId_cedula: { companyId, cedula } },
      }),
      this.prisma.candidate.findUnique({
        where: { companyId_cedula: { companyId, cedula } },
      }),
      this.movimientoPersonalService.isActivo(companyId, cedula),
    ]);

    const payload = {
      cedula,
      nombreCompleto: candidate?.fullName || nombreCarpeta,
      // Refleja el mismo cálculo que "Activo: Sí/No" en la Ficha Personal de
      // la app (última SALIDA completada = inactivo) — así RRHH puede ver el
      // estado del guardia con solo abrir este archivo en Drive.
      activo,
      telefono: ficha?.telefono || candidate?.phone || null,
      email: ficha?.email || candidate?.email || null,
      puesto: ficha?.puestoFormal || candidate?.positionApplied || null,
      direccion: ficha?.direccion || null,
      fechaNacimiento: ficha?.fechaNacimiento || null,
      contactoEmergenciaNombre: ficha?.contactoEmergenciaNombre || null,
      contactoEmergenciaTelefono: ficha?.contactoEmergenciaTelefono || null,
      horario: ficha?.horario || null,
      salarioAcordado: ficha?.salarioAcordado ?? null,
      camposPersonalizados: ficha?.camposPersonalizados ?? {},
      actualizadoEn: new Date().toISOString(),
    };

    const drive = this.getDriveClient();
    const jsonPayload = JSON.stringify(payload, null, 2);

    if (existingFileId) {
      await drive.files.update({
        fileId: existingFileId,
        media: { mimeType: 'application/json', body: jsonPayload },
        supportsAllDrives: true,
      });
    } else {
      await drive.files.create({
        requestBody: {
          name: FICHA_PERSONAL_FILENAME,
          parents: [folderId],
          mimeType: 'application/json',
        },
        media: { mimeType: 'application/json', body: jsonPayload },
        fields: 'id',
        supportsAllDrives: true,
      });
    }

    return true;
  }

  // `cedulaConfiable: false` marca que no se pudo leer "Nombre - Cédula" ni
  // "Cédula" del nombre de carpeta y se usó un id sintético de respaldo — el
  // llamador (syncEntidadesFolder) usa esta señal para NO crear una identidad
  // nueva a partir de una carpeta mal nombrada/mal renombrada.
  //
  // Exige exactamente 10 dígitos (formato de cédula ecuatoriana) en vez de
  // aceptar cualquier alfanumérico de 7-13 caracteres: la validación laxa
  // anterior dejaba que variantes mal escritas de la misma cédula (ej.
  // "09999999" y "0999999999") se parsearan como cédulas distintas y
  // válidas, creando guardias duplicados. Una carpeta con una "cédula" que no
  // cumpla el formato cae al id sintético de respaldo (cedulaConfiable:
  // false) en vez de crear una identidad nueva.
  private parseEmployeeFolderName(
    folderName: string,
    folderId?: string,
  ): { name: string; cedula: string; cedulaConfiable: boolean } {
    const match = folderName.match(/^(.+?)\s*-\s*(\d{10})$/);
    if (match) {
      return {
        name: match[1].trim(),
        cedula: match[2].trim(),
        cedulaConfiable: true,
      };
    }
    const cedulaOnly = folderName.match(/^(\d{10})$/);
    if (cedulaOnly) {
      return {
        name: cedulaOnly[1],
        cedula: cedulaOnly[1],
        cedulaConfiable: true,
      };
    }
    const fallbackCedula = folderId
      ? `ID-${folderId.slice(-10)}`
      : `TEMP-${Date.now()}`;
    return {
      name: folderName.trim(),
      cedula: fallbackCedula,
      cedulaConfiable: false,
    };
  }
}
