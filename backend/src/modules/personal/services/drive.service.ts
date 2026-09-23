import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { MovimientoPersonalService } from './movimiento-personal.service';
import { PersonalFieldDefinitionService } from './personal-field-definition.service';
import { AdministrativeStaffFichaService } from './administrative-staff-ficha.service';
import { GuardiaFichaPersonalService } from './guardia-ficha-personal.service';
import { google } from 'googleapis';
import * as fs from 'fs';
import * as path from 'path';
import { Readable } from 'stream';
import {
  cedulaEsDigitosDeCarpeta,
  reasignarCedulaPersona,
} from '../utils/identidad-persona.util';
import {
  advertenciaNombreCarpeta,
  formatNombrePersona,
  normalizarNombrePersona,
  validarNombrePersona,
} from '../utils/nombre-persona.util';
import {
  ANALISIS_IA_FILENAME,
  ANALISIS_IA_PENDIENTE_FILENAME,
  REVISION_ARCHIVOS_IA_FILENAME,
  FICHA_PERSONAL_FILENAME,
  FICHA_PERSONAL_FILENAME_LEGACY,
  NO_MOSTRAR_EN_LISTA_FILENAME,
  NON_DOCUMENT_FILENAMES,
} from '../constants/employee-document-exclusions';
import { validarFormatoEntidad } from '../utils/entidad-folder-format.util';
import {
  buscarDatoFormulario,
  resolverCamposConPostulacion,
  valorCampoPostulacion,
  POSTULACION_STASH_KEY,
} from '../utils/form-data.util';
import {
  mismaPersona,
  validarDatosPostulacion,
  type CampoPostulacion,
} from '../utils/postulacion-validacion.util';
import {
  resumirExpediente,
  type SlotExpediente,
} from '../utils/expediente-completitud.util';
import { extractDriveFolderId } from '../../../common/utils/drive-link.util';
import {
  driveFolderPublicUrl,
  hardcodedFolderId,
  HARDCODED_DRIVE_FOLDERS,
  isLockedDriveFolderType,
  type LockedDriveFolderType,
} from '../constants/hardcoded-drive-folders';

@Injectable()
export class DriveService {
  private readonly logger = new Logger(DriveService.name);
  private driveClient: any = null;
  private driveKeyFile: any = null;
  private driveClientsPorDueno = new Map<string, any>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly movimientoPersonalService: MovimientoPersonalService,
    private readonly personalFieldDefinitionService: PersonalFieldDefinitionService,
    private readonly administrativeStaffFichaService: AdministrativeStaffFichaService,
    private readonly guardiaFichaPersonalService: GuardiaFichaPersonalService,
  ) {}

  private loadDriveServiceAccountKey(): any {
    if (this.driveKeyFile) return this.driveKeyFile;

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

    for (const candidate of candidates) {
      if (fs.existsSync(candidate)) {
        this.driveKeyFile = JSON.parse(fs.readFileSync(candidate, 'utf-8'));
        this.logger.log(`DriveClient: loaded credentials from ${candidate}`);
        return this.driveKeyFile;
      }
    }

    // Fallback para Cloud Run: el archivo está en .gitignore (es un secreto) y
    // nunca llega a la imagen Docker, así que en producción las credenciales
    // viajan como el contenido del JSON en esta env var (Secret Manager vía
    // --set-secrets en cloudbuild.yaml), no como archivo.
    if (process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
      this.driveKeyFile = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
      this.logger.log(
        'DriveClient: loaded credentials from GOOGLE_SERVICE_ACCOUNT_JSON env var',
      );
      return this.driveKeyFile;
    }

    throw new BadRequestException(
      'Google Drive no configurado. Coloca google-service-account.json en la raíz del backend o define GOOGLE_SERVICE_ACCOUNT_JSON.',
    );
  }

  private getDriveClient() {
    if (this.driveClient) return this.driveClient;

    const auth = new google.auth.GoogleAuth({
      credentials: this.loadDriveServiceAccountKey(),
      scopes: ['https://www.googleapis.com/auth/drive'],
    });
    this.driveClient = google.drive({ version: 'v3', auth });
    return this.driveClient;
  }

  // La papelera de Drive es del dueño del archivo. La cuenta de servicio, si
  // manda a la papelera por su cuenta, o no puede (no es dueña) o lo esconde
  // en una papelera que nadie abre. Impersonar al dueño deja la carpeta en
  // la papelera de esa persona. Requiere delegación de dominio del scope
  // drive sobre drive-sync; si no está, Google responde unauthorized_client.
  private getDriveClientComoDueno(email: string) {
    const cacheado = this.driveClientsPorDueno.get(email);
    if (cacheado) return cacheado;

    const auth = new google.auth.GoogleAuth({
      credentials: this.loadDriveServiceAccountKey(),
      scopes: ['https://www.googleapis.com/auth/drive'],
      clientOptions: { subject: email },
    });
    const cliente = google.drive({ version: 'v3', auth });
    this.driveClientsPorDueno.set(email, cliente);
    return cliente;
  }

  private sanitizeFolderId(id: string): string {
    return extractDriveFolderId(id || '');
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
      let targetFolderId = '';
      if (isLockedDriveFolderType(type)) {
        targetFolderId = this.sanitizeFolderId(
          (await this.resolveLockedFolderId(companyId, type)) || '',
        );
        if (!targetFolderId) {
          return {
            success: false,
            message:
              'Esta carpeta de Drive está fijada en código y todavía no tiene ID.',
          };
        }
      } else {
        targetFolderId = this.sanitizeFolderId(folderId || '');
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
    if (isLockedDriveFolderType(type)) {
      return this.getLockedConfig(companyId, type);
    }
    return this.prisma.folderConfig.findFirst({ where: { companyId, type } });
  }

  private async resolveLockedFolderId(
    companyId: number,
    type: LockedDriveFolderType,
  ): Promise<string | null> {
    const fromCode = hardcodedFolderId(type);
    if (fromCode) return fromCode;
    const row = await this.prisma.folderConfig.findFirst({
      where: { companyId, type },
    });
    return row?.driveFolderId ? this.sanitizeFolderId(row.driveFolderId) : null;
  }

  private async getLockedConfig(companyId: number, type: LockedDriveFolderType) {
    const meta = HARDCODED_DRIVE_FOLDERS[type];
    const fromCode = hardcodedFolderId(type);
    if (fromCode) {
      return {
        id: 0,
        companyId,
        type,
        driveFolderId: fromCode,
        driveFolderName: meta.name,
        driveFolderLink: driveFolderPublicUrl(fromCode),
        createdAt: new Date(0),
        hardcoded: true,
      };
    }
    const row = await this.prisma.folderConfig.findFirst({
      where: { companyId, type },
    });
    if (!row) return null;
    // Filas antiguas guardaron acá lo que la persona pegó tal cual, y en
    // algunos casos fue solo el ID pelado (no una URL) — usarlo directo como
    // link rompía el botón "Ver carpeta". Solo se reusa si de verdad es una URL.
    const validLink = row.driveFolderLink?.trim().startsWith('http')
      ? row.driveFolderLink
      : null;
    return {
      ...row,
      driveFolderLink: validLink || driveFolderPublicUrl(row.driveFolderId),
      hardcoded: true,
    };
  }

  // Sube un archivo arbitrario (no un .json generado por el sync, uno real
  // que suba un usuario) a una carpeta de Drive ya configurada — usado por
  // TrainingService para los adjuntos de capacitaciones. Primer uso de
  // media.body con un Buffer real en este servicio (el resto solo sube JSON).
  async uploadFile(
    folderId: string,
    buffer: Buffer,
    fileName: string,
    mimeType: string,
  ): Promise<{ id: string; url: string }> {
    const drive = this.getDriveClient();
    const sanitizedFolderId = this.sanitizeFolderId(folderId);
    const res = await drive.files.create({
      requestBody: { name: fileName, parents: [sanitizedFolderId] },
      media: { mimeType, body: Readable.from(buffer) },
      fields: 'id',
      supportsAllDrives: true,
    });
    const id = res.data.id as string;
    return { id, url: `https://drive.google.com/file/d/${id}/view` };
  }

  // Crea una subcarpeta nueva dentro de otra carpeta de Drive. Usado por
  // Ventas/Contratos para crear "una carpeta por plantilla" dentro de la
  // carpeta raíz configurada (type='VENTAS_CONTRATOS'), mismo patrón que ya
  // usa Reclutamiento para sus carpetas por puesto.
  async createSubfolder(parentId: string, name: string): Promise<string> {
    const drive = this.getDriveClient();
    const res = await drive.files.create({
      requestBody: {
        name,
        parents: [this.sanitizeFolderId(parentId)],
        mimeType: 'application/vnd.google-apps.folder',
      },
      fields: 'id',
      supportsAllDrives: true,
    });
    const id = res.data?.id;
    if (!id)
      throw new Error(`Drive no devolvió un id al crear la carpeta "${name}".`);
    return id;
  }

  // Busca una subcarpeta por nombre, sin importar mayúsculas. Pagina por si
  // la carpeta padre tiene más de 100 hijas.
  async findChildFolderByName(
    parentId: string,
    name: string,
  ): Promise<{ id: string; name: string } | null> {
    const objetivo = name.trim().replace(/\s+/g, ' ').toLocaleLowerCase('es');
    if (!objetivo) return null;
    const drive = this.getDriveClient();
    const parent = this.sanitizeFolderId(parentId);
    let pageToken: string | undefined;
    do {
      const res = await drive.files.list({
        q: `'${parent}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
        fields: 'nextPageToken, files(id, name)',
        pageSize: 100,
        pageToken,
        supportsAllDrives: true,
        includeItemsFromAllDrives: true,
      });
      const hit = (res.data.files || []).find(
        (f: { id?: string | null; name?: string | null }) =>
          (f.name || '').trim().replace(/\s+/g, ' ').toLocaleLowerCase('es') === objetivo,
      );
      if (hit?.id) return { id: hit.id, name: hit.name || name };
      pageToken = res.data.nextPageToken ?? undefined;
    } while (pageToken);
    return null;
  }

  // Mueve la carpeta al padre indicado y le pone el nombre pedido. Si ya
  // está en ese padre, solo renombra.
  async relocateFolder(folderId: string, parentId: string, name: string): Promise<void> {
    const drive = this.getDriveClient();
    const parent = this.sanitizeFolderId(parentId);
    const current = await drive.files.get({
      fileId: folderId,
      fields: 'parents',
      supportsAllDrives: true,
    });
    const parents = (current.data.parents || []).filter((p: string | null): p is string => !!p);
    const sameParent = parents.includes(parent);
    await drive.files.update({
      fileId: folderId,
      addParents: sameParent ? undefined : parent,
      removeParents: sameParent ? undefined : parents.join(','),
      requestBody: { name },
      supportsAllDrives: true,
    });
  }

  // Pasa los archivos y subcarpetas de una carpeta a otra. La carpeta de
  // origen se queda vacía (no se borra).
  async moveFolderContents(fromFolderId: string, toFolderId: string): Promise<void> {
    if (fromFolderId === toFolderId) return;
    const drive = this.getDriveClient();
    const from = this.sanitizeFolderId(fromFolderId);
    const to = this.sanitizeFolderId(toFolderId);
    let pageToken: string | undefined;
    do {
      const res = await drive.files.list({
        q: `'${from}' in parents and trashed = false`,
        fields: 'nextPageToken, files(id)',
        pageSize: 100,
        pageToken,
        supportsAllDrives: true,
        includeItemsFromAllDrives: true,
      });
      for (const file of res.data.files || []) {
        if (!file.id) continue;
        await drive.files.update({
          fileId: file.id,
          addParents: to,
          removeParents: from,
          supportsAllDrives: true,
        });
      }
      pageToken = res.data.nextPageToken ?? undefined;
    } while (pageToken);
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
    if (isLockedDriveFolderType(type)) {
      throw new BadRequestException(
        'Esta carpeta de Drive está fijada en el código y no se puede cambiar desde la aplicación.',
      );
    }
    const sanitizedId = this.sanitizeFolderId(driveFolderId);
    if (!sanitizedId)
      throw new BadRequestException('Ingresa el ID de la carpeta raíz.');
    // Se guarda el ID (lo que de verdad usan las llamadas a Drive) y, aparte,
    // el enlace/texto tal como lo pegó la persona, para volver a mostrárselo
    // igual la próxima vez en vez de un ID pelado reconstruido.
    const rawLink = driveFolderId?.trim() || null;

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
        data: { driveFolderId: sanitizedId, driveFolderLink: rawLink, driveFolderName },
      });
    }
    return this.prisma.folderConfig.create({
      data: {
        driveFolderId: sanitizedId,
        driveFolderLink: rawLink,
        driveFolderName,
        type,
        companyId,
      },
    });
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
      entidadesFormatoInvalido: [] as string[],
      guardiasActualizados: 0,
      documentos: 0,
      fichasPersonales: 0,
      asignacionesAbiertas: 0,
      asignacionesCerradas: 0,
      carpetasNoReconocidas: [] as string[],
      guardiasNoReconocidos: [] as string[],
      renombresIgnorados: [] as string[],
      // Puramente informativo: carpetas de guardia cuyo nombre no sigue el
      // estándar "Apellidos Nombres" (ver nombre-persona.util). Se
      // sincronizan igual — no se renombra nada en Drive.
      guardiasFormatoInvalido: [] as string[],
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

          // Puramente informativo (Fase 3.2): no bloquea el sync ni el
          // movimiento de guardias, solo avisa a RRHH si la carpeta no sigue
          // el formato "Provincia - Nombre de la entidad" recomendado.
          if (!validarFormatoEntidad(nombreEntidad).valido) {
            result.entidadesFormatoInvalido.push(nombreEntidad);
          }

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
      guardiasFormatoInvalido: string[];
      documentos: number;
      fichasPersonales: number;
      guardiasActualizados: number;
      errors: string[];
    },
  ) {
    try {
      const files = await this.listFilesInFolder(guardiaFolder.id);
      // Marcador de cuando la X solo ocultaba, sin tocar Drive. Las que se
      // quitan ahora van a la papelera y este listado ya no las ve.
      if (
        files.some(
          (f: { name?: string }) =>
            (f.name || '').toLowerCase() === NO_MOSTRAR_EN_LISTA_FILENAME,
        )
      ) {
        return;
      }
      const parsed = this.parseEmployeeFolderName(
        guardiaFolder.name,
        guardiaFolder.id,
      );
      const cedulaDeJson = parsed.cedulaConfiable
        ? ''
        : await this.leerCedulaDeJsonEnCarpeta(files);
      const cedulaLeida = parsed.cedulaConfiable
        ? parsed.cedula
        : cedulaDeJson;
      const cedulaConfiable = /^\d{10}$/.test(cedulaLeida);

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
      const nombreValido = validarNombrePersona(guardiaFolder.name).valido;

      if (
        existente &&
        cedulaConfiable &&
        existente.cedula.startsWith('ID-') &&
        cedulaLeida !== existente.cedula
      ) {
        const migrada = await this.reemplazarCedulaSintetica(
          companyId,
          existente.cedula,
          cedulaLeida,
        );
        if (migrada) existente.cedula = cedulaLeida;
      }

      if (existente && !cedulaConfiable && nombreValido) {
        existente.cedula = await this.corregirCedulaInventada(
          companyId,
          guardiaFolder.id,
          existente.cedula,
        );
      }

      if (!existente) {
        if (cedulaConfiable) {
          cedula = cedulaLeida;
          nombreGuardia = parsed.name;
        } else if (nombreValido) {
          // "Apellidos Nombres" vale en mayúsculas o minúsculas. Sin cédula
          // igual entra a la lista. La clave interna no se escribe en el
          // JSON ni se muestra: la cédula queda vacía hasta que RRHH la cargue.
          cedula = `ID-${guardiaFolder.id}`;
          nombreGuardia = parsed.name;
        } else {
          // Carpeta nueva que ni siquiera sigue el formato (guion, vacía…):
          // no se inventa una identidad.
          result.guardiasNoReconocidos.push(guardiaFolder.name);
          return;
        }
      } else if (cedulaConfiable && cedulaLeida === existente.cedula) {
        // Mismo folderId, misma cédula (el nombre pudo cambiar
        // cosméticamente) — actualización normal.
        cedula = cedulaLeida;
        nombreGuardia = parsed.name;
      } else if (
        !cedulaConfiable &&
        existente.cedula.startsWith('ID-') &&
        nombreValido
      ) {
        // Sigue sin cédula, pero el nombre (en cualquier combinación de
        // mayúsculas) ya es válido: se actualiza el nombre y no se avisa.
        cedula = existente.cedula;
        nombreGuardia = parsed.name;
      } else {
        // El folderId ya existía con OTRA cédula (o la nueva no se
        // pudo leer con confianza): se mantiene la identidad vieja tal
        // cual, sin tocar nombre ni cédula, y se avisa para revisión.
        cedula = existente.cedula;
        nombreGuardia = existente.employeeName;
        result.renombresIgnorados.push(
          cedulaConfiable
            ? `"${guardiaFolder.name}" — antes "${existente.employeeName} - ${existente.cedula}", la cédula detectada ahora sería "${cedulaLeida}"; se mantuvo la cédula original por seguridad`
            : `"${guardiaFolder.name}" no se pudo leer como "Apellidos Nombres" ni como "... - Cédula"; se mantuvo la identidad original "${existente.employeeName}" (${existente.cedula})`,
        );
      }

      // Advertencia de formato, independiente de la identidad: la carpeta ya
      // quedó sincronizada, esto solo le dice a RRHH cuáles conviene
      // renombrar en Drive para dejar todo en "Apellidos Nombres".
      if (!validarNombrePersona(guardiaFolder.name).valido) {
        result.guardiasFormatoInvalido.push(
          advertenciaNombreCarpeta(guardiaFolder.name),
        );
      }

      const fichaNombre = await this.guardiaFichaPersonalService.get(
        companyId,
        cedula,
      );
      nombreGuardia = this.nombreDesdeFicha(
        fichaNombre.camposPersonalizados,
        nombreGuardia,
      );

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
      const fichaFile = files.find(
        (f: { id?: string; name?: string }) =>
          f.name === FICHA_PERSONAL_FILENAME ||
          f.name === FICHA_PERSONAL_FILENAME_LEGACY,
      );
      for (const file of files) {
        if (NON_DOCUMENT_FILENAMES.includes(file.name)) continue;
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
          `No se pudo guardar ${FICHA_PERSONAL_FILENAME} de ${nombreGuardia}: ${fichaErr.message}`,
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
      result.errors.push(`Error en ${guardiaFolder.name}: ${empErr.message}`);
    }
  }

  // Personal Administrativo tiene su propia carpeta raíz (config
  // type='PERSONAL_ADMIN'), independiente de la de Cumplimiento/Custodios.
  // Dentro de ella hay una subcarpeta por empleado, hermanas entre sí,
  // nombradas "Apellidos Nombres" (el puesto y la cédula viven en datos.json).
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
  // Formatos VIEJOS que sigue leyendo: "Apellidos Nombres - Cédula - Puesto"
  // y "Apellidos Nombres - Cédula" (mismas 10 cifras
  // que `parseEmployeeFolderName` usa para Custodios/Cumplimiento) — la
  // cédula real es ahora la identidad de la fila en BD, igual que Guardias,
  // en vez del ID de carpeta de Drive. Si la carpeta no trae una cédula
  // válida, se cae a un id sintético estable basado en el folderId
  // (`cedulaConfiable: false`) para no perder el archivo, pero el llamador
  // debe avisar a RRHH en vez de tratarlo como una identidad real.
  private parsePersonalAdminFolderName(
    folderName: string,
    folderId: string,
  ): { name: string; puesto: string; cedula: string; cedulaConfiable: boolean } {
    const withPuesto = folderName.match(/^(.+?)\s*-\s*(\d{10})\s*-\s*(.+)$/);
    if (withPuesto) {
      return {
        name: withPuesto[1].trim(),
        cedula: withPuesto[2].trim(),
        puesto: withPuesto[3].trim(),
        cedulaConfiable: true,
      };
    }
    const withoutPuesto = folderName.match(/^(.+?)\s*-\s*(\d{10})$/);
    if (withoutPuesto) {
      return {
        name: withoutPuesto[1].trim(),
        cedula: withoutPuesto[2].trim(),
        puesto: '',
        cedulaConfiable: true,
      };
    }
    return {
      name: folderName.trim(),
      puesto: '',
      cedula: `ID-${folderId.slice(-10)}`,
      cedulaConfiable: false,
    };
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
      fichasCount: 0,
      errors: [] as string[],
    };

    const employeeFolders = await this.listSubFolders(rootFolderId);

    for (const empFolder of employeeFolders) {
      try {
        const parsed = this.parsePersonalAdminFolderName(
          empFolder.name,
          empFolder.id,
        );
        let name = normalizarNombrePersona(parsed.name);
        const files = await this.listFilesInFolder(empFolder.id);

        // El formato estándar ("Apellidos Nombres") ya no lleva la cédula en
        // el nombre, así que cuando el parser no la encuentra ahí se lee de
        // datos.json / candidato.json — igual que hace el sync de Guardias.
        const cedulaLeida = parsed.cedulaConfiable
          ? parsed.cedula
          : await this.leerCedulaDeJsonEnCarpeta(files);
        const cedulaConfiable = /^\d{10}$/.test(cedulaLeida);
        const nombreValido = validarNombrePersona(empFolder.name).valido;

        // Ancla de identidad por folderId (el mismo criterio que Guardias):
        // si la carpeta ya estaba vinculada a una cédula, un rename o un JSON
        // ilegible nunca crea una identidad nueva ni parte al empleado en dos.
        const existente = await this.prisma.employeeDriveFolder.findFirst({
          where: { companyId, folderId: empFolder.id },
        });

        if (
          existente &&
          cedulaConfiable &&
          existente.cedula.startsWith('ID-') &&
          cedulaLeida !== existente.cedula
        ) {
          const migrada = await this.reemplazarCedulaSintetica(
            companyId,
            existente.cedula,
            cedulaLeida,
          );
          if (migrada) existente.cedula = cedulaLeida;
        }

        if (existente && !cedulaConfiable && nombreValido) {
          existente.cedula = await this.corregirCedulaInventada(
            companyId,
            empFolder.id,
            existente.cedula,
          );
        }

        let cedula: string;
        if (cedulaConfiable) {
          cedula = cedulaLeida;
        } else if (existente) {
          cedula = existente.cedula;
        } else if (nombreValido) {
          // Carpeta nueva "Apellidos Nombres", todavía sin cédula ni
          // datos.json. Entra a la lista y el JSON se crea abajo solo con
          // el nombre. La cédula real reemplaza esta clave cuando aparezca.
          cedula = `ID-${empFolder.id}`;
        } else {
          result.errors.push(
            `La carpeta "${empFolder.name}" no sigue el formato "Apellidos Nombres" y no tiene cédula. Corrígele el nombre en Drive y vuelve a sincronizar.`,
          );
          continue;
        }

        // Advertencia informativa, nunca bloquea ni renombra nada en Drive.
        // Una carpeta nueva con el nombre bien puesto no avisa.
        if (!nombreValido) {
          result.errors.push(advertenciaNombreCarpeta(empFolder.name));
        }

        const fichaNombre = await this.administrativeStaffFichaService.get(
          companyId,
          cedula,
        );
        name = this.nombreDesdeFicha(
          fichaNombre.camposPersonalizados,
          name,
        );

        // El puesto dejó de vivir en el nombre de la carpeta: si el parser no
        // lo encuentra ahí (formato nuevo), se conserva el que ya estaba en BD
        // en vez de borrarlo. La fuente real es la ficha → datos.json.
        const puesto = parsed.puesto || existente?.puesto || null;

        await this.prisma.employeeDriveFolder.upsert({
          where: {
            companyId_cedula: { companyId, cedula },
          },
          create: {
            employeeName: name,
            cedula,
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

        const fichaFile = files.find(
          (f: { id?: string; name?: string }) =>
            f.name === FICHA_PERSONAL_FILENAME ||
            f.name === FICHA_PERSONAL_FILENAME_LEGACY,
        );
        for (const file of files) {
          if (NON_DOCUMENT_FILENAMES.includes(file.name)) continue;
          await this.prisma.employeeDocument.upsert({
            where: { driveFileId: file.id },
            create: {
              employeeName: name,
              cedula,
              fileName: file.name,
              fileUrl: `https://drive.google.com/file/d/${file.id}/view`,
              fileType: file.mimeType,
              driveFileId: file.id,
              folder: 'PERSONAL_ADMIN',
              companyId,
            },
            update: {
              employeeName: name,
              cedula,
              fileName: file.name,
              folder: 'PERSONAL_ADMIN',
              companyId,
            },
          });
          result.documentsCount++;
        }

        try {
          const fichaSynced = await this.syncFichaAdministrativo(
            companyId,
            cedula,
            name,
            empFolder.id,
            fichaFile?.id,
          );
          if (fichaSynced) result.fichasCount++;
        } catch (fichaErr: any) {
          result.errors.push(
            `No se pudo guardar ${FICHA_PERSONAL_FILENAME} de ${name}: ${fichaErr.message}`,
          );
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
      const required = dt.required;

      return {
        documentTypeId: dt.id,
        type: dt.name,
        required,
        status: matchResult ? 'present' : 'missing',
        documentId: matchResult?.id || null,
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
        documentId: doc.id,
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

  // El desempate ante puntaje IGUAL se resuelve por `id`/`fileName` (lo que
  // haya), no por posición en `files`: la API de Drive no garantiza orden
  // estable entre llamadas (sin `orderBy`, dos `files.list` de la misma
  // carpeta pueden volver en distinto orden aunque nada haya cambiado). Con
  // desempate por posición, un candidato con dos archivos que matchean el
  // mismo casillero con el mismo puntaje (duplicados — caso real en
  // Reclutamiento, ver `archivosAdicionales`) podía resolver a un archivo
  // DISTINTO en cada sincronización, dejando "huérfana" una aprobación ya
  // registrada en `DocumentReview` y devolviendo la completitud a 0% aunque
  // el servidor nunca perdió nada. Comparar por `id`/`fileName` hace que el
  // mismo archivo gane siempre, sin importar el orden de entrada.
  private findMatchingFile(files: any[], docTypeName: string): any {
    let best: any;
    let bestScore = 0;
    for (const f of files) {
      const score = this.scoreMatch(f.fileName ?? f.name, docTypeName);
      if (score <= 0) continue;
      if (
        score > bestScore ||
        (score === bestScore &&
          best &&
          String(f.id ?? f.fileName ?? f.name ?? '').localeCompare(
            String(best.id ?? best.fileName ?? best.name ?? ''),
          ) < 0)
      ) {
        bestScore = score;
        best = f;
      }
    }
    return best;
  }

  // El portal deja en candidato.json la lista `archivos` con el nombre real
  // que subió ("Cédula - cedula.pdf"). Si el rótulo de la vacante no calza
  // solo con el nombre de Drive, se usa esa lista para encontrarlo.
  private resolverArchivoDeRequisito(
    reqNombre: string,
    driveFiles: any[],
    jsonArchivos: { nombre?: string }[],
  ): { file: any | null; nombreEnJson: string | null } {
    const directo = this.findMatchingFile(driveFiles, reqNombre);
    const declarado = (jsonArchivos || []).find(
      (a) => a?.nombre && this.scoreMatch(a.nombre, reqNombre) > 0,
    );
    if (directo) {
      return { file: directo, nombreEnJson: declarado?.nombre || directo.name || null };
    }
    if (!declarado?.nombre) return { file: null, nombreEnJson: null };
    const esperado = this.removeAccents(this.normalizeStr(declarado.nombre));
    const porNombre =
      driveFiles.find(
        (f) => this.removeAccents(this.normalizeStr(f.name || '')) === esperado,
      ) ||
      driveFiles.find((f) =>
        this.removeAccents(this.normalizeStr(f.name || '')).includes(esperado),
      );
    return { file: porNombre || null, nombreEnJson: declarado.nombre };
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

  // Cualquier valor no reconocido cae en GUARDIA: es el comportamiento que
  // tenía contratar antes de que este campo existiera, así que una vacante
  // vieja (o un JSON de Drive editado a mano) sigue funcionando igual que
  // siempre en vez de fallar.
  private normalizeTipoContratacion(raw: any): string {
    return String(raw || '').toUpperCase() === 'ADMINISTRATIVO'
      ? 'ADMINISTRATIVO'
      : 'GUARDIA';
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

  private async listSubFolders(
    parentId: string,
  ): Promise<{ id: string; name: string }[]> {
    const drive = this.getDriveClient();
    const files: { id?: string | null; name?: string | null }[] = [];
    let pageToken: string | undefined;
    do {
      const res = await drive.files.list({
        q: `'${parentId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
        fields: 'nextPageToken, files(id, name)',
        pageSize: 100,
        pageToken,
        supportsAllDrives: true,
        includeItemsFromAllDrives: true,
      });
      files.push(...(res.data.files || []));
      pageToken = res.data.nextPageToken ?? undefined;
    } while (pageToken);
    // Drive siempre devuelve id/name para carpetas reales; se filtra por si
    // acaso para que el resto del servicio pueda trabajar con tipos no-nulos.
    return files.filter(
      (f): f is { id: string; name: string } => !!f.id && !!f.name,
    );
  }

  // Público desde que ReclutamientoIaService necesita listar la carpeta de un
  // postulante para ubicar su PDF único (mismo criterio que findMatchingDocument:
  // se expone en vez de duplicar la consulta en el otro servicio).
  //
  // Se ordena por `id` antes de devolver: la API de Drive no garantiza orden
  // estable entre llamadas cuando no se pide `orderBy` (dos `files.list` de
  // la misma carpeta, sin cambios de por medio, pueden volver en distinto
  // orden). Eso importaba en la práctica porque `findMatchingFile` desempata
  // por posición ("el primero que iguala el mejor puntaje") cuando dos
  // archivos matchean el mismo casillero con el mismo puntaje — un caso real
  // en Reclutamiento (duplicados, p. ej. una resubida o una separación con IA
  // corrida más de una vez, ver `archivosAdicionales` más abajo). Sin orden
  // determinístico, una resincronización podía resolver un casillero a un
  // archivo DISTINTO del que se aprobó la vez anterior — la aprobación seguía
  // existiendo en `DocumentReview`, pero quedaba huérfana de ese casillero y
  // la completitud volvía a 0% aunque el servidor nunca perdió nada. Ordenar
  // por `id` (estable e inmutable por archivo) hace que el mismo archivo gane
  // el desempate siempre, sin importar qué orden haya devuelto Drive.
  async listFilesInFolder(folderId: string) {
    const drive = this.getDriveClient();
    const res = await drive.files.list({
      q: `'${folderId}' in parents and trashed = false and mimeType != 'application/vnd.google-apps.folder'`,
      fields: 'files(id, name, mimeType)',
      pageSize: 100,
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
    });
    const files = res.data.files || [];
    return [...files].sort((a, b) =>
      String(a.id || '').localeCompare(String(b.id || '')),
    );
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

  // Metadatos de una carpeta (se usa sobre todo por `parents`, para ubicar la
  // vacante a la que pertenece la carpeta de un postulante).
  async getFolderMetadata(folderId: string) {
    const drive = this.getDriveClient();
    const res = await drive.files.get({
      fileId: folderId,
      fields: 'id, name, parents',
      supportsAllDrives: true,
    });
    return res.data;
  }

  // Sube un archivo nuevo a una carpeta desde un Buffer en memoria y devuelve
  // su id de Drive. La API espera un stream, no un Buffer, de ahí el
  // Readable.from.
  async uploadFileBuffer(
    folderId: string,
    fileName: string,
    mimeType: string,
    buffer: Buffer,
  ): Promise<string> {
    const drive = this.getDriveClient();
    const res = await drive.files.create({
      requestBody: { name: fileName, parents: [folderId], mimeType },
      media: { mimeType, body: Readable.from(buffer) },
      fields: 'id',
      supportsAllDrives: true,
    });
    const id = res.data?.id;
    if (!id) throw new Error(`Drive no devolvió un id al subir "${fileName}".`);
    return id;
  }

  // Crea o sobrescribe un .json por nombre dentro de una carpeta — mismo patrón
  // create-vs-update que ya usan saveCandidatoDatos y contratarCandidato sobre
  // candidato.json, extraído para que otros servicios no lo reimplementen.
  async upsertJsonFile(folderId: string, fileName: string, contenido: any) {
    const drive = this.getDriveClient();
    const body = JSON.stringify(contenido, null, 2);
    const existentes = await this.listFilesInFolder(folderId);
    const actual = existentes.find((f: any) => f.name === fileName);

    if (actual) {
      await drive.files.update({
        fileId: actual.id,
        media: { mimeType: 'application/json', body },
        supportsAllDrives: true,
      });
      return actual.id as string;
    }

    const res = await drive.files.create({
      requestBody: {
        name: fileName,
        parents: [folderId],
        mimeType: 'application/json',
      },
      media: { mimeType: 'application/json', body },
      fields: 'id',
      supportsAllDrives: true,
    });
    return res.data?.id as string;
  }

  // Descarga los bytes reales de un archivo de Drive (no solo metadata, a
  // diferencia de listFilesInFolder/listSubFolders). Único punto de este
  // servicio que trae contenido binario en vez de listados — lo usa
  // DocumentExtractionService (Fase B de cumplimiento por entidad) para pasarle
  // el PDF a pdf-parse. `supportsAllDrives: true` por consistencia con el resto
  // de llamadas de este archivo (compatibilidad con unidades compartidas).
  // Lee un .json por nombre dentro de una carpeta, si existe. Complementa a
  // upsertJsonFile (que solo escribe) — usado por ReclutamientoIaService para
  // recuperar una propuesta de análisis guardada sin tener que volver a
  // llamar a Vertex AI.
  async readJsonFile(folderId: string, fileName: string): Promise<any | null> {
    const existentes = await this.listFilesInFolder(folderId);
    const archivo = existentes.find((f: any) => f.name === fileName);
    if (!archivo) return null;
    const buffer = await this.downloadFileBuffer(archivo.id);
    try {
      return JSON.parse(buffer.toString('utf-8'));
    } catch {
      return null;
    }
  }

  // Borra un archivo por nombre dentro de una carpeta, si existe. Usado por
  // ReclutamientoIaService para limpiar la propuesta pendiente de análisis
  // (analisis-ia-pendiente.json) una vez que RRHH la confirma y deja de tener
  // sentido ofrecerla como "propuesta guardada". No falla si el archivo no
  // existe — es una limpieza best-effort, no una operación crítica.
  async deleteFileByName(folderId: string, fileName: string): Promise<void> {
    const existentes = await this.listFilesInFolder(folderId);
    const archivo = existentes.find((f: any) => f.name === fileName);
    if (!archivo) return;
    const drive = this.getDriveClient();
    await drive.files.delete({ fileId: archivo.id, supportsAllDrives: true });
  }

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

  // RRHH aprueba un archivo "adicional" (unmatchedFile) que no corresponde a
  // ningún tipo de documento requerido, dándole un nombre propio — mismo
  // patrón de renombrado en Drive que reassignDocumentType, pero sin asociar
  // un documentTypeId (queda aprobado "sin tipo", igual que
  // handleApproveWithoutType, solo que ahora con un nombre elegido por RRHH
  // en vez de mantener el nombre original del archivo subido).
  async approveAsAdditionalDocument(
    driveFileId: string,
    label: string,
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

    const extMatch = doc.fileName.match(/\.[^/.]+$/);
    const extension = extMatch ? extMatch[0] : '';
    const baseName = extension
      ? doc.fileName.slice(0, -extension.length)
      : doc.fileName;
    const newFileName = `${label.trim()} - ${baseName}${extension}`;

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

    return this.prisma.employeeDriveFolder.deleteMany({
      where: { companyId, cedula },
    });
  }

  // Quita de Listado de Guardias a alguien que ya está fuera y manda su
  // carpeta a la papelera del dueño en Drive (se puede restaurar desde ahí).
  // Si Drive no la suelta, el registro se queda: si no, el sync la recrearía.
  // El historial de movimientos se conserva.
  async quitarGuardiaFueraDeLista(cedula: string, companyId: number) {
    if (!companyId)
      throw new BadRequestException('Usuario sin empresa asociada');

    const activo = await this.movimientoPersonalService.isActivo(
      companyId,
      cedula,
    );
    if (activo) {
      throw new BadRequestException(
        'Solo se puede quitar de la lista a un guardia que ya está fuera.',
      );
    }

    const folder = await this.prisma.employeeDriveFolder.findUnique({
      where: { companyId_cedula: { companyId, cedula } },
    });

    if (folder?.folderId) {
      try {
        await this.enviarCarpetaAPapeleraDelDueno(folder.folderId);
      } catch (err: any) {
        if (err instanceof BadRequestException) throw err;
        if (!this.driveNoEncuentra(err)) {
          throw new BadRequestException(
            `No se pudo enviar la carpeta a la papelera de Drive, así que no se quitó de la lista: ${err.message}`,
          );
        }
      }
    }

    await this.deleteEmployeeByCedula(cedula, companyId);
    return { cedula };
  }

  private esCuentaDeServicio(email: string): boolean {
    return /gserviceaccount\.com$/i.test(email || '');
  }

  // Sube por los padres hasta hallar una persona. La raíz de Guardias está
  // compartida con la cuenta de servicio, pero el dueño de esa raíz es quien
  // abre Drive.
  private async buscarDuenoHumano(
    drive: any,
    parentIds: string[],
    profundidad = 0,
  ): Promise<string | null> {
    if (profundidad > 8) return null;
    for (const parentId of parentIds) {
      const parent = await drive.files.get({
        fileId: parentId,
        fields: 'owners(emailAddress), parents',
        supportsAllDrives: true,
      });
      const email = parent.data?.owners?.[0]?.emailAddress || '';
      if (email && !this.esCuentaDeServicio(email)) return email;
      const arriba = await this.buscarDuenoHumano(
        drive,
        parent.data?.parents || [],
        profundidad + 1,
      );
      if (arriba) return arriba;
    }
    return null;
  }

  private async enviarCarpetaAPapeleraDelDueno(folderId: string) {
    const drive = this.getDriveClient();
    let meta: any;
    try {
      meta = await drive.files.get({
        fileId: folderId,
        fields: 'id, trashed, driveId, owners(emailAddress), parents',
        supportsAllDrives: true,
      });
    } catch (err: any) {
      if (this.driveNoEncuentra(err)) return;
      throw err;
    }
    if (meta.data?.trashed) return;

    // En una unidad compartida la papelera es la de esa unidad.
    if (meta.data?.driveId) {
      await drive.files.update({
        fileId: folderId,
        requestBody: { trashed: true },
        supportsAllDrives: true,
      });
      return;
    }

    let ownerEmail: string = meta.data?.owners?.[0]?.emailAddress || '';
    if (!ownerEmail || this.esCuentaDeServicio(ownerEmail)) {
      const humano = await this.buscarDuenoHumano(
        drive,
        meta.data?.parents || [],
      );
      if (!humano) {
        throw new BadRequestException(
          'No se encontró al dueño de la carpeta para enviarla a su papelera.',
        );
      }
      if (this.esCuentaDeServicio(ownerEmail)) {
        await drive.permissions.create({
          fileId: folderId,
          transferOwnership: true,
          requestBody: { role: 'owner', type: 'user', emailAddress: humano },
        });
      }
      ownerEmail = humano;
    }

    try {
      const comoDueno = this.getDriveClientComoDueno(ownerEmail);
      await comoDueno.files.update({
        fileId: folderId,
        requestBody: { trashed: true },
        supportsAllDrives: true,
      });
    } catch (err: any) {
      const msg = String(err?.message || err || '');
      if (/unauthorized_client/i.test(msg)) {
        throw new BadRequestException(
          `No se pudo enviar la carpeta a la papelera de ${ownerEmail}. La cuenta de Drive no tiene delegación de dominio para actuar como esa persona.`,
        );
      }
      throw err;
    }
  }

  private driveNoEncuentra(err: any): boolean {
    const code = err?.code || err?.response?.status;
    const msg = String(err?.message || err || '');
    return code === 404 || /not found|file not found/i.test(msg);
  }

  // La primera vez que una carpeta "Apellidos Nombres" no trae cédula se
  // guarda con una clave interna ID-<folderId>. Cuando el formulario ya
  // tiene la cédula real, se reemplaza esa clave en la misma fila.
  private async reemplazarCedulaSintetica(
    companyId: number,
    cedulaActual: string,
    cedulaReal: string,
  ): Promise<boolean> {
    try {
      await reasignarCedulaPersona(
        this.prisma,
        companyId,
        cedulaActual,
        cedulaReal,
      );
      return true;
    } catch (err) {
      if (err instanceof BadRequestException) return false;
      throw err;
    }
  }

  // Si la cédula guardada son exactamente los dígitos del id de la carpeta,
  // no es una cédula: se vuelve a la clave interna y en la ficha queda vacía.
  private async corregirCedulaInventada(
    companyId: number,
    folderId: string,
    cedulaActual: string,
  ): Promise<string> {
    if (!cedulaEsDigitosDeCarpeta(cedulaActual, folderId)) return cedulaActual;
    const clave = `ID-${folderId}`;
    const migrada = await this.reemplazarCedulaSintetica(
      companyId,
      cedulaActual,
      clave,
    );
    return migrada ? clave : cedulaActual;
  }

  private nombreDesdeFicha(
    campos: { apellidos?: string; nombres?: string } | null | undefined,
    fallback: string,
  ): string {
    const apellidos = String(campos?.apellidos || '').trim();
    const nombres = String(campos?.nombres || '').trim();
    if (!apellidos || !nombres) return fallback;
    return formatNombrePersona(apellidos, nombres);
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

    return {
      cedula,
      folderId: folder.folderId,
      archivedTo: config.driveFolderName,
    };
  }

  // Asigna o mueve a un guardia de entidad: mueve su carpeta de Drive a
  // Público/Privado/<Entidad destino> (mismo mecanismo que archivarCarpetaGuardia
  // y contratarCandidato — solo cambia de padre, no toca documentos). Drive
  // sigue siendo la fuente de la verdad de la asignación (ver
  // syncEntidadesFolder): esto NO escribe en AsignacionGuardia directamente,
  // el llamador (drive.controller.ts) corre la sincronización justo después
  // para que la asignación quede reflejada de inmediato, sin que RRHH tenga
  // que apretar "Sincronizar Drive" a mano.
  async moverGuardiaAEntidad(
    companyId: number,
    cedula: string,
    entidadId: number,
    confirmCrearCarpeta = false,
  ): Promise<
    | { cedula: string; folderId: string; movidoA: string }
    | { requiereConfirmacion: true; entidadNombre: string; tipoLabel: string }
  > {
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

    let entidad = await this.prisma.entidad.findFirst({
      where: { id: entidadId, companyId },
    });
    if (!entidad) {
      throw new BadRequestException('Entidad no encontrada.');
    }

    if (!entidad.driveFolderId) {
      // Antes esto bloqueaba con un error pidiendo sincronizar Drive a mano.
      // Ahora: busca una carpeta parecida bajo el bucket Público/Privado que
      // corresponda; si la encuentra sin ambigüedad la vincula sola, si hay
      // varias candidatas avisa sin adivinar (mismo criterio que
      // entidadesColisionNombre en syncEntidadesFolder), y si no encuentra
      // ninguna pregunta antes de crearla (nunca la crea silenciosamente).
      const config = await this.prisma.folderConfig.findFirst({
        where: { companyId, type: 'CUMPLIMIENTO' },
      });
      if (!config) {
        throw new BadRequestException(
          'No hay carpeta de Guardias configurada. Configúrala primero desde "Configurar Drive" en Listado de Guardias.',
        );
      }

      const tipoLabel = entidad.tipo === 'PUBLICA' ? 'Público' : 'Privado';
      const bucketId = await this.resolverOCrearBucket(
        this.sanitizeFolderId(config.driveFolderId),
        tipoLabel,
      );

      const subFolders = await this.listSubFolders(bucketId);
      const candidatas = this.buscarCarpetaEntidadCandidata(
        subFolders,
        entidad.nombre,
      );

      if (candidatas.length > 1) {
        throw new BadRequestException(
          `"${entidad.nombre}" todavía no tiene carpeta vinculada y hay más de una carpeta parecida en ${tipoLabel}: ${candidatas
            .map((c) => `"${c.name}"`)
            .join(
              ', ',
            )}. Vincula la carpeta correcta editando la entidad, o renombra las carpetas en Drive para diferenciarlas.`,
        );
      }

      if (candidatas.length === 1) {
        entidad = await this.prisma.entidad.update({
          where: { id: entidad.id },
          data: { driveFolderId: candidatas[0].id },
        });
      } else if (confirmCrearCarpeta) {
        const drive = this.getDriveClient();
        let nuevaCarpetaId: string;
        try {
          const created = await drive.files.create({
            requestBody: {
              name: entidad.nombre,
              parents: [bucketId],
              mimeType: 'application/vnd.google-apps.folder',
            },
            fields: 'id',
            supportsAllDrives: true,
          });
          nuevaCarpetaId = created.data.id;
        } catch (err: any) {
          throw new BadRequestException(
            `No se pudo crear la carpeta de "${entidad.nombre}" en Drive: ${err.message}`,
          );
        }
        entidad = await this.prisma.entidad.update({
          where: { id: entidad.id },
          data: { driveFolderId: nuevaCarpetaId },
        });
      } else {
        return {
          requiereConfirmacion: true,
          entidadNombre: entidad.nombre,
          tipoLabel,
        };
      }
    }

    const cedulasFuera = new Set(
      await this.movimientoPersonalService.getCedulasFuera(companyId),
    );
    if (cedulasFuera.has(cedula)) {
      throw new BadRequestException(
        'Este guardia ya registró su salida completada; no se lo puede reasignar a una entidad.',
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
        // A esta altura entidad.driveFolderId siempre está seteado: o ya lo
        // tenía, o se acaba de resolver/crear/vincular arriba.
        addParents: this.sanitizeFolderId(entidad.driveFolderId as string),
        removeParents: previousParents,
        fields: 'id, parents',
        supportsAllDrives: true,
      });
    } catch (err) {
      throw new BadRequestException(
        `No se pudo mover la carpeta en Drive: ${err.message}`,
      );
    }

    return { cedula, folderId: folder.folderId, movidoA: entidad.nombre };
  }

  // La carpeta de Reclutamiento es fija en código (HARDCODED_DRIVE_FOLDERS),
  // independiente de Cumplimiento. Dentro hay una subcarpeta por Puesto.
  private async getReclutamientoFolderId(companyId: number): Promise<string> {
    const folderId = await this.resolveLockedFolderId(companyId, 'RECLUTAMIENTO');
    if (!folderId) {
      throw new BadRequestException(
        'No hay carpeta de Drive de Reclutamiento definida en código.',
      );
    }
    return this.sanitizeFolderId(folderId);
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
      tipoContratacion?: string;
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
        tipoContratacion: this.normalizeTipoContratacion(dto.tipoContratacion),
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
          tipoContratacion: position.tipoContratacion,
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
      tipoContratacion?: string;
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
    if (dto.tipoContratacion !== undefined)
      updateData.tipoContratacion = this.normalizeTipoContratacion(
        dto.tipoContratacion,
      );

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
          tipoContratacion: updated.tipoContratacion,
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
              // Igual que camposRequeridos/archivosRequeridos: el JSON de Drive
              // solo se lee al crear una vacante detectada ahí por primera vez.
              // Para una vacante que ya existe en BD, Postgres manda y esta
              // sync no lo pisa (ver el comentario de updateJobPosition).
              tipoContratacion: this.normalizeTipoContratacion(
                jsonData.tipoContratacion,
              ),
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

    // Estructura esperada: RECLUTAMIENTO/<Puesto>/<Apellidos Nombres>/archivos...
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
          const files = await this.listFilesInFolder(folder.id);
          const parsed = this.parseEmployeeFolderName(folder.name, folder.id);

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

          const apellidos = buscarDatoFormulario(datosFormulario, [
            'apellidos',
          ]);
          const nombres = buscarDatoFormulario(datosFormulario, [
            'nombres',
          ]);
          // Formato estándar "Apellidos Nombres" (ver nombre-persona.util).
          // Los fallbacks siguen ahí solo para postulaciones viejas cuyo JSON
          // guardó un único campo de nombre.
          const nombre =
            formatNombrePersona(apellidos, nombres) ||
            normalizarNombrePersona(
              buscarDatoFormulario(datosFormulario, [
                'nombre completo',
                'nombre',
              ]) ||
                candidatoJsonData?.nombreCompleto ||
                candidatoJsonData?.nombre ||
                parsed.name,
            );
          const cedula =
            this.extraerCedulaConfiableDeObjeto(candidatoJsonData) ||
            (parsed.cedulaConfiable ? parsed.cedula : '');
          const telefono =
            buscarDatoFormulario(datosFormulario, [
              'telefono',
              'celular',
            ]) ||
            candidatoJsonData?.telefono ||
            '';
          const email =
            buscarDatoFormulario(datosFormulario, ['email', 'correo']) ||
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
          const camposRequeridos = Array.isArray(matchedPosition?.camposRequeridos)
            ? matchedPosition.camposRequeridos
            : [];
          // El JSON del portal no siempre usa el mismo rótulo que la vacante
          // ("Celular" en la vacante, "Teléfono" en el archivo). Se copia el
          // valor al nombre que el expediente va a buscar.
          for (const campo of camposRequeridos) {
            const nombre = campo && typeof campo === 'object' ? campo.nombre : '';
            if (typeof nombre !== 'string' || !nombre.trim()) continue;
            if (String(datosFormulario[nombre] ?? '').trim()) continue;
            const valor = valorCampoPostulacion(datosFormulario, nombre);
            if (valor) datosFormulario[nombre] = valor;
          }
          const archivosDeclarados: { nombre?: string }[] = Array.isArray(
            candidatoJsonData?.archivos,
          )
            ? candidatoJsonData.archivos
            : [];
          // Solo los archivos marcados como obligatorios cuentan para el % de
          // Completitud — uno opcional que falte no debe bloquearlo (mismo
          // criterio que DocumentType.required en Cumplimiento por Entidad).
          // candidato.json no es un documento del postulante. Contarlo
          // inflaba el "4/5" de la tabla cuando el expediente mostraba 3.
          const archivosPostulante = files.filter(
            (f: any) => !String(f.name || '').toLowerCase().endsWith('.json'),
          );
          const slots: SlotExpediente[] = archivosRequeridos.map((reqDoc) => {
            const resuelto = this.resolverArchivoDeRequisito(
              reqDoc.nombre,
              archivosPostulante,
              archivosDeclarados,
            );
            return {
              nombre: reqDoc.nombre,
              obligatorio: reqDoc.obligatorio !== false,
              driveFileId: resuelto.file?.id ?? null,
              nombreEnJson: resuelto.nombreEnJson,
            };
          });
          const matchedFileIds = [
            ...new Set(
              slots
                .map((s) => s.driveFileId)
                .filter((id): id is string => !!id),
            ),
          ];
          const resumenInicial =
            slots.length > 0
              ? resumirExpediente(slots)
              : {
                  completitudPercent: archivosPostulante.length > 0 ? 100 : 0,
                  archivosSubidosCount: archivosPostulante.length,
                  archivosRequeridosCount: 0,
                  documentosRechazados: 0,
                  documentosPendientesRevision: 0,
                };

          candidateList.push({
            id: folder.id,
            nombre,
            cedula,
            puestoAplicado,
            // Para que el modal del candidato pueda anticipar a dónde va a
            // parar si RRHH lo contrata, antes de apretar el botón.
            tipoContratacion: this.normalizeTipoContratacion(
              matchedPosition?.tipoContratacion,
            ),
            // Cómo entregó la documentación el postulante. Lo escribe el portal
            // público de postulación (otro proyecto, ver
            // .agents/modules/reclutamiento.md); aquí solo se lee. 'individual'
            // por defecto: es lo que había antes de que el portal ofreciera las
            // dos opciones, y lo que corresponde a las carpetas antiguas.
            modoSubida:
              candidatoJsonData?.modoSubida === 'archivo_unico'
                ? 'archivo_unico'
                : 'individual',
            ...resumenInicial,
            slots,
            archivosRequeridos,
            camposRequeridos,
            archivosSubidosList: files.map((f: any) => ({
              id: f.id,
              name: f.name,
            })),
            // Archivos que el postulante subió pero que no matchearon ningún
            // archivoRequerido del puesto (p. ej. la cédula subida "como
            // adicional" en vez de en su casilla). RRHH puede reclasificarlos
            // con reassignReclutamientoFile. El/los .json (candidato.json) se
            // excluyen: son metadata del expediente, no un documento del
            // postulante. Un archivo también se excluye si su nombre ya
            // matchea (scoreMatch > 0) algún archivoRequerido aunque no haya
            // sido el elegido para ese casillero: es un duplicado del mismo
            // documento (p. ej. una separación con IA corrida más de una
            // vez), no algo nuevo que RRHH tenga que reclasificar.
            archivosAdicionales: archivosPostulante
              .filter(
                (f: any) =>
                  !matchedFileIds.includes(f.id) &&
                  !archivosRequeridos.some(
                    (r) => this.scoreMatch(f.name, r.nombre) > 0,
                  ),
              )
              .map((f: any) => ({ id: f.id, name: f.name })),
            folderUrl: `https://drive.google.com/drive/folders/${folder.id}`,
            datosFormulario,
            telefono,
            email,
            alertaCedula: null as string | null,
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

    let duenosPorCedula = new Map<string, string>();
    const cedulasReales = cedulas.filter((c) => /^\d{10}$/.test(c));
    if (cedulasReales.length > 0) {
      try {
        const duenos = await this.prisma.employeeDriveFolder.findMany({
          where: { companyId, cedula: { in: cedulasReales } },
          select: { cedula: true, employeeName: true },
        });
        duenosPorCedula = new Map(
          duenos.map((d) => [d.cedula, d.employeeName || '']),
        );
      } catch (err) {
        this.logger.warn(
          `Error cruzando cédulas con guardias: ${err.message}`,
        );
      }
    }

    for (const candidate of candidateList) {
      const reviewByFileId = reviewsByCedula.get(candidate.cedula);
      if (Array.isArray(candidate.slots) && candidate.slots.length > 0) {
        Object.assign(
          candidate,
          resumirExpediente(candidate.slots, reviewByFileId),
        );
      } else {
        let rechazados = 0;
        let pendientesRevision = 0;
        for (const fileId of candidate._matchedFileIds as string[]) {
          const status = reviewByFileId?.get(fileId);
          if (status === 'RECHAZADO') rechazados++;
          else if (!status || status === 'PENDIENTE') pendientesRevision++;
        }
        candidate.documentosRechazados = rechazados;
        candidate.documentosPendientesRevision = pendientesRevision;
      }
      delete candidate._matchedFileIds;

      const dueno = duenosPorCedula.get(candidate.cedula);
      if (dueno && !mismaPersona(dueno, candidate.nombre)) {
        candidate.alertaCedula = `La cédula ${candidate.cedula} ya está en el listado de guardias como "${dueno}".`;
      }
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

    let camposVacante: CampoPostulacion[] = [];
    try {
      const folderMeta = await drive.files.get({
        fileId: folderId,
        fields: 'parents',
        supportsAllDrives: true,
      });
      const parentIds: string[] = folderMeta.data?.parents || [];
      const vacante = parentIds.length
        ? await this.prisma.jobPosition.findFirst({
            where: { companyId, driveFolderId: { in: parentIds } },
          })
        : null;
      if (Array.isArray(vacante?.camposRequeridos)) {
        camposVacante = vacante.camposRequeridos.flatMap((campo) => {
          if (!campo || typeof campo !== 'object' || Array.isArray(campo)) return [];
          const nombre = (campo as { nombre?: unknown }).nombre;
          if (typeof nombre !== 'string' || !nombre.trim()) return [];
          const tipo = (campo as { tipo?: unknown }).tipo;
          const obligatorio = (campo as { obligatorio?: unknown }).obligatorio;
          return [{
            nombre,
            tipo: typeof tipo === 'string' ? tipo : undefined,
            obligatorio: typeof obligatorio === 'boolean' ? obligatorio : undefined,
          }];
        });
      }
    } catch (err: any) {
      this.logger.warn(
        `No se pudo leer la vacante para validar la ficha de ${folderId}: ${err.message}`,
      );
    }

    const errores = validarDatosPostulacion(
      updated.datosFormulario,
      camposVacante,
    );
    if (errores.length > 0) {
      throw new BadRequestException(errores.join(' '));
    }

    const cedulaNueva = Object.entries(updated.datosFormulario).find(([k]) =>
      k
        .normalize('NFD')
        .replace(/\p{Mn}/gu, '')
        .toLowerCase()
        .includes('cedula'),
    )?.[1];
    const cedulaLimpia = String(cedulaNueva ?? '').trim();
    if (/^\d{10}$/.test(cedulaLimpia)) {
      const dueno = await this.prisma.employeeDriveFolder.findFirst({
        where: { companyId, cedula: cedulaLimpia },
      });
      const nombrePostulante =
        formatNombrePersona(
          buscarDatoFormulario(updated.datosFormulario, ['apellidos']),
          buscarDatoFormulario(updated.datosFormulario, ['nombres']),
        ) || '';
      if (
        dueno &&
        nombrePostulante &&
        !mismaPersona(dueno.employeeName, nombrePostulante)
      ) {
        throw new BadRequestException(
          `La cédula ${cedulaLimpia} ya pertenece a "${dueno.employeeName}" en el listado de guardias.`,
        );
      }
    }

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

  // RRHH marca a un postulante de Reclutamiento como contratado. A dónde va su
  // carpeta lo decide la vacante a la que postuló (JobPosition.tipoContratacion):
  //
  //   GUARDIA        → raíz de Guardias (FolderConfig 'CUMPLIMIENTO'), dentro
  //                    del bucket "Sin Asignar" (ver syncEntidadesFolder):
  //                    todavía sin entidad, hasta que alguien mueva la carpeta
  //                    a Público/Privado/<Entidad> a mano.
  //   ADMINISTRATIVO → raíz de Personal Administrativo (FolderConfig
  //                    'PERSONAL_ADMIN'), como hija directa — ese bucket no
  //                    tiene sub-buckets (ver syncPersonalAdminFolder).
  //
  // Los dos destinos nombran igual: "Apellidos Nombres", sin guion, sin
  // cédula y sin puesto (ver nombre-persona.util). Contratar RENOMBRA la
  // carpeta del postulante a ese formato. Ni la cédula ni el puesto se
  // pierden — quedan escritos en candidato.json / datos.json, que viajan con
  // la carpeta y son lo que el sync lee para resolver la identidad.
  //
  // Si falta la carpeta destino configurada, se corta antes de tocar nada: la
  // carpeta del postulante se queda intacta en Reclutamiento en vez de quedar
  // a medio camino.
  //
  // Mueve, no copia ni duplica nada — mismo mecanismo que archivarCarpetaGuardia.
  async contratarCandidato(
    companyId: number,
    folderId: string,
    userId: number,
  ) {
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

    // candidato.json se lee ANTES de decidir nada: el puestoId que deja ahí el
    // portal de postulación es el respaldo para ubicar la vacante, la cédula
    // puede vivir aquí (formato "Apellidos Nombres" sin cédula en el
    // nombre), y más abajo este mismo objeto se reescribe con el estado de
    // contratación.
    const filesEnCarpeta = await this.listFilesInFolder(folderId);
    const jsonFile = filesEnCarpeta.find((f: any) =>
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

    const parsed = this.parseEmployeeFolderName(folder.name, folder.id);
    const cedula =
      this.extraerCedulaConfiableDeObjeto(candidatoJsonData) ||
      (parsed.cedulaConfiable ? parsed.cedula : '');
    if (!/^\d{10}$/.test(cedula)) {
      throw new BadRequestException(
        'No se pudo leer la cédula de esta carpeta. Debe estar en el formulario de postulación o, en carpetas antiguas, al final del nombre ("... - 10 dígitos"). Corrígelo antes de contratar.',
      );
    }
    const datosFormularioNombre: Record<string, any> =
      candidatoJsonData?.datosFormulario || candidatoJsonData || {};
    const apellidos = buscarDatoFormulario(datosFormularioNombre, [
      'apellidos',
    ]);
    const nombres = buscarDatoFormulario(datosFormularioNombre, ['nombres']);
    const nombre =
      formatNombrePersona(apellidos, nombres) ||
      normalizarNombrePersona(parsed.name);

    // La vacante manda. Se ubica por la carpeta padre del postulante (la
    // carpeta de la vacante), que es el vínculo más fiable; si eso no da
    // resultado (carpeta movida a mano en Drive) se cae al puestoId que el
    // portal deja en candidato.json. Sin vacante identificable se asume
    // GUARDIA — lo que contratar hacía siempre antes de que existiera este campo.
    const parentIds: string[] = folder.parents || [];
    let vacante = parentIds.length
      ? await this.prisma.jobPosition.findFirst({
          where: { companyId, driveFolderId: { in: parentIds } },
        })
      : null;
    const puestoIdJson = Number(candidatoJsonData?.puestoId);
    if (!vacante && Number.isInteger(puestoIdJson)) {
      vacante = await this.prisma.jobPosition.findFirst({
        where: { companyId, id: puestoIdJson },
      });
    }
    const tipoContratacion = this.normalizeTipoContratacion(
      vacante?.tipoContratacion,
    );

    const motivosBloqueo = await this.motivosBloqueoContratacion(
      companyId,
      cedula,
      (vacante as { archivosRequeridos?: unknown } | null)?.archivosRequeridos,
      filesEnCarpeta,
    );
    if (motivosBloqueo.length > 0) {
      throw new BadRequestException(
        `No se puede contratar mientras haya documentos obligatorios pendientes o rechazados: ${motivosBloqueo.join('; ')}.`,
      );
    }

    // Traspaso automático de "campos requeridos" (PersonalFieldDefinition,
    // ver 4.2) del formulario de postulación a la Ficha Personal recién
    // creada — así RRHH no tiene que retipear a mano lo que el candidato ya
    // llenó al postularse. Empareja por texto (fieldDef.label contra las
    // claves de datosFormulario, vía buscarDatoFormulario) — el mismo riesgo
    // que nombre/cédula/teléfono/email más arriba: si alguien renombra el
    // campo en la vacante o en la ficha, deja de matchear en silencio (no
    // hay ID compartido entre el formulario del portal y esta definición).
    // Solo rellena campos VACÍOS — nunca pisa un valor ya cargado a mano
    // (importante en el flujo de recontratación, ver `yaExiste`/`activo` más
    // abajo). Además del traspaso campo-por-campo (para lo que ya matchea
    // hoy), se guarda el datosFormulario COMPLETO bajo POSTULACION_STASH_KEY:
    // así, si RRHH crea un campo de configuración DESPUÉS de contratar, el
    // dato sigue disponible sin tener que "recontratar" a nadie (ver
    // resolverCamposConPostulacion, usado por AdministrativeStaffFichaService
    // y GuardiaFichaPersonalService al leer la ficha). Encapsulado en
    // try/catch propio: un fallo acá nunca debe impedir que la contratación
    // se complete.
    try {
      const datosFormulario: Record<string, any> =
        candidatoJsonData?.datosFormulario || candidatoJsonData || {};
      const scopeCampos =
        tipoContratacion === 'ADMINISTRATIVO' ? 'PERSONAL_ADMIN' : 'GUARDIA';
      const fieldDefs = await this.personalFieldDefinitionService.findAll(
        companyId,
        scopeCampos,
      );

      const esAdministrativo = scopeCampos === 'PERSONAL_ADMIN';
      const fichaActual = esAdministrativo
        ? await this.prisma.administrativeStaffFicha.findUnique({
            where: { companyId_cedula: { companyId, cedula } },
            select: { camposPersonalizados: true },
          })
        : await this.prisma.guardiaFichaPersonal.findUnique({
            where: { companyId_cedula: { companyId, cedula } },
            select: { camposPersonalizados: true },
          });
      const camposActuales: Record<string, any> = {
        ...((fichaActual?.camposPersonalizados as
          | Record<string, any>
          | undefined) || {}),
      };

      let huboCambios = false;
      for (const def of fieldDefs) {
        const yaTieneValor = String(camposActuales[def.key] ?? '').trim();
        if (yaTieneValor) continue; // nunca se pisa un valor ya cargado
        const valor = buscarDatoFormulario(datosFormulario, [def.label]);
        if (valor) {
          camposActuales[def.key] = valor;
          huboCambios = true;
        }
      }

      if (
        Object.keys(datosFormulario).length > 0 &&
        !camposActuales[POSTULACION_STASH_KEY]
      ) {
        camposActuales[POSTULACION_STASH_KEY] = datosFormulario;
        huboCambios = true;
      }

      if (huboCambios) {
        if (esAdministrativo) {
          await this.prisma.administrativeStaffFicha.upsert({
            where: { companyId_cedula: { companyId, cedula } },
            create: { companyId, cedula, camposPersonalizados: camposActuales },
            update: { camposPersonalizados: camposActuales },
          });
        } else {
          await this.prisma.guardiaFichaPersonal.upsert({
            where: { companyId_cedula: { companyId, cedula } },
            create: { companyId, cedula, camposPersonalizados: camposActuales },
            update: { camposPersonalizados: camposActuales },
          });
        }
      }
    } catch (err: any) {
      this.logger.error(
        `No se pudo traspasar campos personalizados del formulario para ${cedula}: ${err.message}`,
      );
    }

    let destinoParentId: string;
    let nuevoNombreCarpeta: string | null = null;
    let carpetaDestino: string;

    if (tipoContratacion === 'ADMINISTRATIVO') {
      // Lanza con su propio mensaje indicando en qué pantalla configurarla.
      const raizAdmin = await this.getPersonalAdminFolderId(companyId);

      // Personal Administrativo no guarda la cédula (la identidad de su fila en
      // BD se deriva del ID de carpeta, ver parsePersonalAdminFolderName), así
      // que el duplicado no se puede detectar por cédula como en Guardias: se
      // compara por nombre, que es lo único que ese bucket sí conserva.
      const nombreNormalizado = this.normalizeFolderName(nombre);
      const adminExistentes = await this.prisma.employeeDriveFolder.findMany({
        where: { companyId, folderType: 'PERSONAL_ADMIN' },
      });
      const duplicado = adminExistentes.find(
        (e) =>
          this.normalizeFolderName(e.employeeName || '') === nombreNormalizado,
      );
      if (duplicado) {
        throw new BadRequestException(
          `Ya existe un empleado administrativo llamado "${duplicado.employeeName}". Revísalo en Personal Administrativo antes de contratar; si son personas distintas, diferencia los nombres en Drive.`,
        );
      }

      // El puesto ya NO va en el nombre de la carpeta: se guarda en la ficha
      // (campo `puesto`), que syncFichaAdministrativo vuelca a datos.json. Por
      // eso una vacante sin puesto ya no bloquea la contratación.
      const puestoCarpeta = (vacante?.puesto || '').trim();
      if (puestoCarpeta) {
        try {
          await this.prisma.administrativeStaffFicha.upsert({
            where: { companyId_cedula: { companyId, cedula } },
            create: {
              companyId,
              cedula,
              camposPersonalizados: { puesto: puestoCarpeta },
            },
            update: {},
          });
        } catch (err: any) {
          this.logger.warn(
            `No se pudo guardar el puesto "${puestoCarpeta}" en la ficha de ${cedula}: ${err.message}`,
          );
        }
      }

      destinoParentId = raizAdmin;
      nuevoNombreCarpeta = nombre;
      carpetaDestino = 'Personal Administrativo';
    } else {
      // Mismo espíritu que evitó el caso de los "Juan Perez" duplicados: no se
      // crea un guardia nuevo si esa cédula ya tiene una carpeta vinculada Y
      // sigue activo. Si su último movimiento es una SALIDA completada (se
      // fue de la empresa), esto es una recontratación legítima: la fila de
      // EmployeeDriveFolder nunca se borra al salir (se ancla por cédula,
      // @@unique([companyId, cedula])), así que el próximo "Sincronizar Drive"
      // la actualiza sola con el folderId nuevo — no hay que bloquear.
      const yaExiste = await this.prisma.employeeDriveFolder.findFirst({
        where: { companyId, cedula },
      });
      if (yaExiste) {
        if (!mismaPersona(yaExiste.employeeName, nombre)) {
          throw new BadRequestException(
            `La cédula ${cedula} ya pertenece a "${yaExiste.employeeName}" en el listado de guardias, que no es "${nombre}". Corrige la cédula antes de contratar.`,
          );
        }
        const activo = await this.movimientoPersonalService.isActivo(
          companyId,
          cedula,
        );
        if (activo) {
          throw new BadRequestException(
            `Ya existe un guardia activo con la cédula ${cedula} (${yaExiste.employeeName}) en Listado de Guardias. Verifica ahí si es la misma persona antes de continuar.`,
          );
        }
      }

      const config = await this.prisma.folderConfig.findFirst({
        where: { companyId, type: 'CUMPLIMIENTO' },
      });
      if (!config) {
        throw new BadRequestException(
          'No hay carpeta de Guardias configurada. Configúrala primero desde "Configurar Drive" en Listado de Guardias.',
        );
      }

      destinoParentId = await this.resolverSinAsignarFolderId(
        this.sanitizeFolderId(config.driveFolderId),
      );
      carpetaDestino = 'Sin Asignar';
    }

    // Primero se mueve. Si Google rechaza el cambio de carpeta, el
    // candidato.json no queda marcado CONTRATADO dentro de Reclutamiento.
    // En ADMINISTRATIVO el renombrado va en la misma llamada que el
    // movimiento, para que la carpeta no llegue a existir bajo esa raíz con
    // el nombre viejo.
    const folderEnDestino = await this.moverCarpetaDePostulante(
      drive,
      folderId,
      parentIds.join(','),
      destinoParentId,
      nuevoNombreCarpeta,
      carpetaDestino,
    );

    try {
      await this.marcarContratadoEnCarpeta(
        drive,
        folderEnDestino,
        candidatoJsonData,
        cedula,
        tipoContratacion,
      );
    } catch (err: any) {
      throw new BadRequestException(
        `La carpeta ya está en ${carpetaDestino}, pero no se pudo guardar el estado de contratación: ${err.message}`,
      );
    }

    // Crea el registro de entrada en Movimientos de Personal. Único punto
    // del sistema que hace esto automáticamente (antes lo disparaba el
    // Kanban de Candidatos vía KanbanColumn.triggersHire — migrado acá el
    // 2026-09-16 por no ser un flujo real; el código de Kanban se eliminó
    // por completo el 2026-09-17, ver .agents/modules/movimientos-personal.md).
    // Envuelto en try/catch a propósito: un fallo acá nunca debe impedir que
    // la contratación se complete, que es la operación principal.
    try {
      await this.movimientoPersonalService.crearEntrada({
        cedula,
        nombreGuardia: nombre,
        companyId,
        userId,
        origen: 'RECLUTAMIENTO_CONTRATAR',
      });
    } catch (err: any) {
      this.logger.error(
        `No se pudo crear el movimiento de entrada para ${cedula}: ${err.message}`,
      );
    }

    return { cedula, nombre, carpetaDestino, tipoContratacion };
  }

  private esErrorPermisoDrive(err: any): boolean {
    const msg = String(err?.message || err);
    return /sufficient permissions|insufficientFilePermissions|insufficientParentPermissions/i.test(
      msg,
    );
  }

  private mensajeDrive(err: any): string {
    if (this.esErrorPermisoDrive(err)) {
      return 'la cuenta de Drive no tiene permiso para modificar este archivo';
    }
    return err?.message || 'error desconocido de Drive';
  }

  private async motivosBloqueoContratacion(
    companyId: number,
    cedula: string,
    archivosRequeridos: unknown,
    files: any[],
  ): Promise<string[]> {
    const reqs = (
      Array.isArray(archivosRequeridos) ? archivosRequeridos : []
    ).filter(
      (r) => r && r.obligatorio !== false && typeof r.nombre === 'string',
    );
    if (reqs.length === 0) return [];

    const postulante = files.filter(
      (f) => !String(f.name || '').toLowerCase().endsWith('.json'),
    );
    let reviews: { driveFileId: string | null; status: string }[] = [];
    try {
      reviews = await this.prisma.documentReview.findMany({
        where: { companyId, cedula },
        select: { driveFileId: true, status: true },
      });
    } catch (err: any) {
      this.logger.warn(
        `No se pudieron leer las revisiones de ${cedula}: ${err.message}`,
      );
    }

    const motivos: string[] = [];
    for (const req of reqs) {
      const match = this.findMatchingFile(postulante, req.nombre);
      if (!match) {
        motivos.push(`falta "${req.nombre}"`);
        continue;
      }
      const status = reviews.find((r) => r.driveFileId === match.id)?.status;
      if (status === 'RECHAZADO') motivos.push(`"${req.nombre}" está rechazado`);
      else if (status !== 'APROBADO') {
        motivos.push(`"${req.nombre}" todavía no está aprobado`);
      }
    }
    return motivos;
  }

  private async marcarContratadoEnCarpeta(
    drive: any,
    folderId: string,
    candidatoJsonData: any,
    cedula: string,
    tipoContratacion: string,
  ) {
    const files = await this.listFilesInFolder(folderId);
    const jsonFile = files.find((f: any) =>
      String(f.name || '').toLowerCase().endsWith('.json'),
    );
    const updated = {
      ...candidatoJsonData,
      estado: 'CONTRATADO',
      fechaContratacion: new Date().toISOString(),
      tipoContratacion,
      cedula,
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
  }

  private async copiarCarpetaDrive(
    origenId: string,
    destinoParentId: string,
    nombre: string,
  ): Promise<string> {
    const drive = this.getDriveClient();
    const created = await drive.files.create({
      requestBody: {
        name: nombre,
        parents: [destinoParentId],
        mimeType: 'application/vnd.google-apps.folder',
      },
      fields: 'id',
      supportsAllDrives: true,
    });
    const nuevoId = created.data.id as string;
    const files = await this.listFilesInFolder(origenId);
    for (const file of files) {
      await drive.files.copy({
        fileId: file.id,
        requestBody: { name: file.name, parents: [nuevoId] },
        supportsAllDrives: true,
      });
    }
    const subcarpetas = await this.listSubFolders(origenId);
    for (const sub of subcarpetas) {
      await this.copiarCarpetaDrive(sub.id, nuevoId, sub.name);
    }
    return nuevoId;
  }

  // Google no deja mover una carpeta creada por otra cuenta aunque el
  // service account pueda leerla. Si el movimiento directo falla por
  // permisos, se copia el contenido a una carpeta nueva (que sí es de esta
  // cuenta) y la original se manda a la papelera. Si tampoco se puede
  // tirar la original, se deshace la copia para no dejar dos expedientes.
  private async moverCarpetaDePostulante(
    drive: any,
    folderId: string,
    previousParents: string,
    destinoParentId: string,
    nuevoNombre: string | null,
    carpetaDestino: string,
  ): Promise<string> {
    try {
      await drive.files.update({
        fileId: folderId,
        addParents: destinoParentId,
        removeParents: previousParents,
        ...(nuevoNombre ? { requestBody: { name: nuevoNombre } } : {}),
        fields: 'id, parents, name',
        supportsAllDrives: true,
      });
      return folderId;
    } catch (err: any) {
      if (!this.esErrorPermisoDrive(err)) {
        throw new BadRequestException(
          `No se pudo mover la carpeta a ${carpetaDestino}: ${this.mensajeDrive(err)}`,
        );
      }
    }

    let copiaId: string | null = null;
    try {
      const actual = await drive.files.get({
        fileId: folderId,
        fields: 'name',
        supportsAllDrives: true,
      });
      copiaId = await this.copiarCarpetaDrive(
        folderId,
        destinoParentId,
        nuevoNombre || actual.data?.name || 'Postulante',
      );
      await drive.files.update({
        fileId: folderId,
        requestBody: { trashed: true },
        supportsAllDrives: true,
      });
      return copiaId;
    } catch {
      if (copiaId) {
        try {
          await drive.files.update({
            fileId: copiaId,
            requestBody: { trashed: true },
            supportsAllDrives: true,
          });
        } catch (cleanupErr: any) {
          this.logger.warn(
            `No se pudo retirar la copia ${copiaId}: ${cleanupErr.message}`,
          );
        }
      }
      throw new BadRequestException(
        `No se pudo mover la carpeta a ${carpetaDestino}. La cuenta de Drive del sistema puede verla, pero Google no permite cambiar de lugar una carpeta que esa cuenta no creó. Hay que compartir la carpeta del postulante, con permiso de editor, con drive-sync@agentes-504115.iam.gserviceaccount.com.`,
      );
    }
  }

  // Resuelve (o crea si es la primera vez) un bucket de primer nivel bajo la
  // raíz de Guardias — usado tanto para "Sin Asignar" (ver
  // resolverSinAsignarFolderId) como para "Público"/"Privado" cuando
  // moverGuardiaAEntidad necesita vincular una entidad sin carpeta todavía y
  // ni siquiera ese bucket existe.
  private async resolverOCrearBucket(
    raiz: string,
    nombreBucket: string,
  ): Promise<string> {
    const drive = this.getDriveClient();
    try {
      const subFolders = await this.listSubFolders(raiz);
      const normalizedTarget = this.normalizeFolderName(nombreBucket);
      const existente = subFolders.find(
        (f: any) => this.normalizeFolderName(f.name) === normalizedTarget,
      );
      if (existente) return existente.id;

      const created = await drive.files.create({
        requestBody: {
          name: nombreBucket,
          parents: [raiz],
          mimeType: 'application/vnd.google-apps.folder',
        },
        fields: 'id',
        supportsAllDrives: true,
      });
      return created.data.id;
    } catch (err: any) {
      throw new BadRequestException(
        `No se pudo preparar la carpeta "${nombreBucket}" en Drive: ${err.message}`,
      );
    }
  }

  // Resuelve (o crea si es la primera vez) el bucket "Sin Asignar" bajo la raíz
  // de Guardias — el tercer bucket de primer nivel junto a Público/Privado
  // (ver syncEntidadesFolder).
  private async resolverSinAsignarFolderId(
    raizGuardias: string,
  ): Promise<string> {
    return this.resolverOCrearBucket(raizGuardias, 'Sin Asignar');
  }

  // Busca, dentro de las subcarpetas de un bucket Público/Privado, cuál
  // podría ser la carpeta de una Entidad sin `driveFolderId` todavía (ver
  // moverGuardiaAEntidad). Prueba en orden de preferencia: coincidencia
  // exacta (normalizada) → uno contiene al otro (normalizado) → comparten
  // al menos una palabra significativa (4+ letras, normalizada). Se detiene
  // en el primer nivel que produzca alguna coincidencia — nunca mezcla
  // niveles, así una coincidencia exacta gana aunque también haya "similares"
  // por palabra. Devuelve la lista de candidatas encontradas en ese nivel:
  // el llamador decide qué hacer con 0, 1 o 2+ resultados.
  private buscarCarpetaEntidadCandidata(
    subFolders: { id: string; name: string }[],
    nombreEntidad: string,
  ): { id: string; name: string }[] {
    const normalizedNombre = this.normalizeFolderName(nombreEntidad);

    const exactas = subFolders.filter(
      (f) => this.normalizeFolderName(f.name) === normalizedNombre,
    );
    if (exactas.length > 0) return exactas;

    const contienen = subFolders.filter((f) => {
      const n = this.normalizeFolderName(f.name);
      return n.includes(normalizedNombre) || normalizedNombre.includes(n);
    });
    if (contienen.length > 0) return contienen;

    const palabrasEntidad = normalizedNombre
      .split(/[^a-z0-9]+/)
      .filter((w) => w.length >= 4);
    if (palabrasEntidad.length === 0) return [];

    return subFolders.filter((f) => {
      const palabrasFolder = this.normalizeFolderName(f.name)
        .split(/[^a-z0-9]+/)
        .filter((w) => w.length >= 4);
      return palabrasFolder.some((w) => palabrasEntidad.includes(w));
    });
  }

  // Crea o sobrescribe Datos_Personales.json dentro de la carpeta del
  // guardia. La ficha en Drive es un espejo de solo lectura: la fuente de la
  // verdad es GuardiaFichaPersonal (editable desde la app). Nunca se lee de
  // vuelta desde Drive. Un fallo aquí (ej. la carpeta solo está compartida
  // como "Lector") no debe tumbar el resto del sync — el llamador ya
  // envuelve esto en try/catch.
  private async syncFichaPersonal(
    companyId: number,
    cedula: string,
    nombreCarpeta: string,
    folderId: string,
    existingFileId: string | undefined,
  ): Promise<boolean> {
    // Vía el service (no prisma directo) para que los 9 campos "fijos" de
    // abajo salgan ya resueltos: valor cargado a mano > columna legada >
    // dato rescatado de la postulación (ver GuardiaFichaPersonalService.get,
    // resolverCamposConPostulacion).
    const ficha = await this.guardiaFichaPersonalService.get(
      companyId,
      cedula,
    );
    const campos = ficha.camposPersonalizados || {};
    const apellidos = String(campos.apellidos || '').trim();
    const nombres = String(campos.nombres || '').trim();

    const payload = {
      // La clave interna ID-<folderId> no es una cédula. Si todavía no hay
      // una de 10 dígitos, el archivo queda con el campo vacío.
      cedula: /^\d{10}$/.test(cedula) ? cedula : '',
      apellidos: apellidos || null,
      nombres: nombres || null,
      nombreCompleto:
        apellidos && nombres
          ? formatNombrePersona(apellidos, nombres)
          : nombreCarpeta,
      // Refleja el mismo cálculo que "Activo: Sí/No" en la Ficha Personal de
      // la app (última SALIDA completada = inactivo) — así RRHH puede ver el
      // estado del guardia con solo abrir este archivo en Drive.
      activo: ficha.activo,
      telefono: campos.telefono || null,
      email: campos.email || null,
      puesto: campos.puesto_formal || null,
      direccion: campos.direccion || null,
      fechaNacimiento: campos.fecha_nacimiento || null,
      contactoEmergenciaNombre: campos.contacto_emergencia_nombre || null,
      contactoEmergenciaTelefono: campos.contacto_emergencia_telefono || null,
      horario: campos.horario || null,
      salarioAcordado:
        campos.salario_acordado != null && campos.salario_acordado !== ''
          ? Number(campos.salario_acordado)
          : null,
      camposPersonalizados: campos,
      actualizadoEn: new Date().toISOString(),
    };

    const drive = this.getDriveClient();
    const jsonPayload = JSON.stringify(payload, null, 2);

    if (existingFileId) {
      await drive.files.update({
        fileId: existingFileId,
        // `name` se manda siempre en el update (no solo al crear) para que
        // un archivo legado "Datos_Personales.json" quede renombrado a
        // FICHA_PERSONAL_FILENAME la primera vez que se vuelva a sincronizar.
        requestBody: { name: FICHA_PERSONAL_FILENAME },
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

  // Análoga a syncFichaPersonal pero para Personal Administrativo: misma
  // mecánica de archivo espejo de solo lectura (datos.json), usando
  // AdministrativeStaffFicha en vez de GuardiaFichaPersonal — sin los campos
  // exclusivos de Guardias (puesto formal, horario) que no aplican aquí.
  private async syncFichaAdministrativo(
    companyId: number,
    cedula: string,
    nombreCarpeta: string,
    folderId: string,
    existingFileId: string | undefined,
  ): Promise<boolean> {
    // Vía el service (no prisma directo) para que los 9 campos "fijos" de
    // abajo salgan ya resueltos: valor cargado a mano > columna legada >
    // dato rescatado de la postulación (ver AdministrativeStaffFichaService.get,
    // resolverCamposConPostulacion).
    const ficha = await this.administrativeStaffFichaService.get(
      companyId,
      cedula,
    );
    const campos = ficha.camposPersonalizados || {};
    const apellidos = String(campos.apellidos || '').trim();
    const nombres = String(campos.nombres || '').trim();

    const payload = {
      // Una carpeta recién creada todavía no tiene cédula: el JSON guarda
      // el nombre y deja la cédula vacía, no la clave interna ID-...
      cedula: /^\d{10}$/.test(cedula) ? cedula : '',
      apellidos: apellidos || null,
      nombres: nombres || null,
      nombreCompleto:
        apellidos && nombres
          ? formatNombrePersona(apellidos, nombres)
          : nombreCarpeta,
      email: campos.email || null,
      activo: campos.activo != null ? campos.activo === 'true' : ficha.activo,
      // El puesto ya no va en el nombre de la carpeta (ver
      // nombre-persona.util), así que este JSON es donde queda registrado.
      puesto: campos.puesto || null,
      departamento: campos.departamento || null,
      tipoContrato: campos.tipo_contrato || null,
      telefono: campos.telefono || null,
      direccion: campos.direccion || null,
      fechaIngreso: campos.fecha_ingreso || null,
      contactoEmergenciaNombre: campos.contacto_emergencia_nombre || null,
      contactoEmergenciaTelefono: campos.contacto_emergencia_telefono || null,
      salarioAcordado:
        campos.salario_acordado != null && campos.salario_acordado !== ''
          ? Number(campos.salario_acordado)
          : null,
      camposPersonalizados: campos,
      actualizadoEn: new Date().toISOString(),
    };

    const drive = this.getDriveClient();
    const jsonPayload = JSON.stringify(payload, null, 2);

    if (existingFileId) {
      await drive.files.update({
        fileId: existingFileId,
        requestBody: { name: FICHA_PERSONAL_FILENAME },
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

  // Identidad de una carpeta de guardia:
  //  1. "… - 1234567890" (10 dígitos al final) — formato viejo, sigue válido.
  //  2. "Apellidos Nombres" (sin cédula en el nombre) — formato estándar;
  //     la cédula se lee de candidato.json / datos.json (ver
  //     extraerCedulaConfiableDeObjeto). cedulaConfiable=false acá solo
  //     significa "no venía en el nombre".
  //  3. Solo 10 dígitos.
  // `cedulaConfiable: false` + id sintético es el fallback cuando no hay
  // cédula en el nombre; el llamador decide si mira JSON o rechaza.
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

  private cedulaDeValor(raw: unknown): string {
    const texto = String(raw ?? '').trim();
    // "ID-<folderId>" no es una cédula. Si se le quitan las letras pueden
    // quedar justo 10 dígitos del id de Drive y el sync los guardaba como
    // si fueran la cédula de la persona.
    if (/^(ID|TEMP)-/i.test(texto)) return '';
    const digits = texto.replace(/\D/g, '');
    return /^\d{10}$/.test(digits) ? digits : '';
  }

  private claveEsCedula(key: string): boolean {
    const normalizada = key
      .normalize('NFD')
      .replace(/\p{Mn}/gu, '')
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '');
    return (
      normalizada === 'cedula' ||
      normalizada.includes('cedula') ||
      normalizada === 'ci' ||
      normalizada === 'identificacion'
    );
  }

  private extraerCedulaConfiableDeObjeto(data: any): string {
    if (!data || typeof data !== 'object') return '';
    const fuentes = [
      data.datosFormulario && typeof data.datosFormulario === 'object'
        ? data.datosFormulario
        : null,
      data,
    ];
    for (const fuente of fuentes) {
      if (!fuente || typeof fuente !== 'object') continue;
      for (const key of Object.keys(fuente)) {
        if (!this.claveEsCedula(key)) continue;
        const cedula = this.cedulaDeValor(fuente[key]);
        if (cedula) return cedula;
      }
    }
    return '';
  }

  private async leerCedulaDeJsonEnCarpeta(
    files: { id?: string; name?: string }[],
  ): Promise<string> {
    const porNombre = (n: string) => (n || '').toLowerCase();
    const ignorados = new Set([
      ANALISIS_IA_FILENAME.toLowerCase(),
      ANALISIS_IA_PENDIENTE_FILENAME.toLowerCase(),
      REVISION_ARCHIVOS_IA_FILENAME.toLowerCase(),
    ]);
    const rank = (name: string) => {
      const n = porNombre(name);
      if (n === 'candidato.json') return 0;
      if (
        n === FICHA_PERSONAL_FILENAME.toLowerCase() ||
        n === FICHA_PERSONAL_FILENAME_LEGACY.toLowerCase()
      ) {
        return 1;
      }
      return 2;
    };
    const jsons = files
      .filter((f) => {
        const n = porNombre(f.name || '');
        return n.endsWith('.json') && !ignorados.has(n) && !!f.id;
      })
      .sort((a, b) => rank(a.name || '') - rank(b.name || ''));

    const drive = jsons.length > 0 ? this.getDriveClient() : null;
    for (const jsonFile of jsons) {
      try {
        const fileRes = await drive.files.get(
          { fileId: jsonFile.id, alt: 'media', supportsAllDrives: true },
          { responseType: 'text' },
        );
        const data =
          (typeof fileRes.data === 'string'
            ? JSON.parse(fileRes.data)
            : fileRes.data) || {};
        const cedula = this.extraerCedulaConfiableDeObjeto(data);
        if (cedula) return cedula;
      } catch (err: any) {
        this.logger.warn(
          `No se pudo leer cédula de ${jsonFile.name}: ${err.message}`,
        );
      }
    }
    return '';
  }
}
