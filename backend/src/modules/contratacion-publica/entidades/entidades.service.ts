import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { DriveService } from '../../personal/services/drive.service';
import { CreateEntidadDto } from './dto/create-entidad.dto';
import { UpdateEntidadDto } from './dto/update-entidad.dto';
import {
  DRIVE_FOLDER_TYPE_ENTREGAS,
  claveNombre,
  nombreCarpeta,
} from './entidad-folder.util';
import { normalizarCamposExtra } from './entidad-campos.util';

export interface SyncEntidadesDriveResult {
  /** false = todavía no hay carpeta raíz elegida. */
  configurada: boolean;
  /** Si Drive no se pudo leer o falta configurar: mensaje para mostrar (no es una excepción). */
  warning?: string;
  sincronizadoAt: string;
  /** Carpetas de Drive que no son ninguna entidad: la persona decide si crea la entidad. */
  carpetasSinEntidad: { carpetaId: string; nombre: string }[];
  /** Entidades (no archivadas) sin carpeta en Drive: la persona decide si se crea. */
  entidadesSinCarpeta: { entidadId: number; nombre: string }[];
  /** El nombre de la carpeta en Drive ya no coincide con el de la entidad: lo decide la persona. */
  renombradas: { entidadId: number; nombreSistema: string; nombreDrive: string }[];
  /** La carpeta de la entidad ya no está en la carpeta raíz: lo decide la persona. */
  ausentes: { entidadId: number; nombre: string }[];
  /** Cosas que no se pudieron resolver solas (carpetas con el mismo nombre, etc.). */
  avisos: string[];
}

@Injectable()
export class CPEntidadesService {
  private readonly logger = new Logger(CPEntidadesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly driveService: DriveService,
  ) {}

  /** Las archivadas solo salen si se piden (checkbox "Mostrar archivadas"). */
  async findAll(companyId: number, incluirArchivadas = false) {
    return this.prisma.cPEntidadPublica.findMany({
      where: incluirArchivadas ? { companyId } : { companyId, archivada: false },
      orderBy: { nombre: 'asc' },
    });
  }

  async findOne(id: number, companyId: number) {
    const entidad = await this.prisma.cPEntidadPublica.findFirst({
      where: { id, companyId },
    });
    if (!entidad) throw new NotFoundException('Entidad pública no encontrada');
    return entidad;
  }

  async create(dto: CreateEntidadDto, companyId: number) {
    await this.assertNombreLibre(dto.nombre, companyId);
    const { camposExtra, ...resto } = dto;
    const extra = await this.valoresDeCampos(camposExtra, companyId, null);
    const entidad = await this.prisma.cPEntidadPublica.create({
      data: { ...resto, camposExtra: extra, companyId },
    });
    const advertenciaDrive = await this.asegurarCarpeta(entidad, companyId);
    const actual = await this.findOne(entidad.id, companyId);
    return { ...actual, advertenciaDrive };
  }

  async update(id: number, dto: UpdateEntidadDto, companyId: number) {
    const antes = await this.findOne(id, companyId);
    if (dto.nombre !== undefined) {
      await this.assertNombreLibre(dto.nombre, companyId, id);
    }
    const { camposExtra, ...resto } = dto;
    const data: Record<string, unknown> = { ...resto };
    if (camposExtra !== undefined) {
      data.camposExtra = await this.valoresDeCampos(
        camposExtra,
        companyId,
        antes.camposExtra as Record<string, unknown> | null,
      );
    }
    await this.prisma.cPEntidadPublica.update({ where: { id }, data });

    // Si cambió el nombre, la carpeta de Drive sigue a la entidad (misma
    // carpeta, otro nombre): nada de carpetas duplicadas ni huérfanas.
    let advertenciaDrive: string | null = null;
    const nombreCambio =
      dto.nombre !== undefined &&
      claveNombre(dto.nombre) !== claveNombre(antes.nombre);
    const actual = await this.findOne(id, companyId);
    // Una entidad sin carpeta NO la recibe al editarla: la sincronización con
    // Drive le ofrece "Crear carpeta" y la persona decide.
    if (nombreCambio && antes.driveFolderId) {
      advertenciaDrive = await this.renombrarCarpeta(actual, companyId);
    }
    return { ...(await this.findOne(id, companyId)), advertenciaDrive };
  }

  /** Valida y deja listos los valores de los campos configurables. */
  private async valoresDeCampos(
    enviados: Record<string, unknown> | undefined,
    companyId: number,
    existentes: Record<string, unknown> | null,
  ) {
    const campos = await this.prisma.cPEntidadCampo.findMany({
      where: { companyId },
    });
    return normalizarCamposExtra(enviados, campos, existentes, true);
  }

  // No existe "eliminar entidad" a propósito (decisión 2026-10-05): borrarla dejaba
  // su carpeta en Drive, que la sincronización volvía a ofrecer como "carpeta sin
  // entidad". Solo se archiva, y la entidad archivada conserva el ancla a su carpeta.

  /** Oculta la entidad de la lista sin borrar nada (ni sus datos ni su carpeta). */
  async archivar(id: number, companyId: number) {
    await this.findOne(id, companyId);
    return this.prisma.cPEntidadPublica.update({
      where: { id },
      data: { archivada: true },
    });
  }

  async reactivar(id: number, companyId: number) {
    await this.findOne(id, companyId);
    return this.prisma.cPEntidadPublica.update({
      where: { id },
      data: { archivada: false },
    });
  }

  // -------------------------------------------------------------- Drive: ayudas

  /**
   * Devuelve la subcarpeta de la entidad en Drive, creándola (o enlazando la
   * que ya existe con ese nombre) si todavía no la tiene. Lo usan las entregas
   * al subir un archivo.
   */
  async carpetaDeEntidad(id: number, companyId: number): Promise<string> {
    const entidad = await this.findOne(id, companyId);
    if (entidad.driveFolderId) return entidad.driveFolderId;
    const raiz = await this.driveService.getConfig(
      companyId,
      DRIVE_FOLDER_TYPE_ENTREGAS,
    );
    if (!raiz?.driveFolderId) {
      throw new BadRequestException(
        'Aún no se configuró la carpeta de Google Drive de Contratación Pública. Configúrala en Entidades Públicas (ícono de carpeta), o pega un enlace.',
      );
    }
    return this.crearOEnlazarCarpeta(entidad, raiz.driveFolderId);
  }

  /** Crea/enlaza la carpeta sin interrumpir: devuelve un mensaje si no se pudo. */
  private async asegurarCarpeta(
    entidad: { id: number; nombre: string; driveFolderId: string | null },
    companyId: number,
  ): Promise<string | null> {
    if (entidad.driveFolderId) return null;
    try {
      const raiz = await this.driveService.getConfig(
        companyId,
        DRIVE_FOLDER_TYPE_ENTREGAS,
      );
      // Sin carpeta raíz no hay nada que crear; la lista ya avisa que falta.
      if (!raiz?.driveFolderId) return null;
      await this.crearOEnlazarCarpeta(entidad, raiz.driveFolderId);
      return null;
    } catch (err) {
      this.logger.error(
        `No se pudo crear la carpeta de Drive de la entidad ${entidad.id}: ${(err as Error).message}`,
      );
      return 'La entidad se guardó, pero no se pudo crear su carpeta en Google Drive. Se reintentará al sincronizar.';
    }
  }

  private async renombrarCarpeta(
    entidad: { id: number; nombre: string; driveFolderId: string | null },
    companyId: number,
  ): Promise<string | null> {
    if (!entidad.driveFolderId) return null;
    try {
      const raiz = await this.driveService.getConfig(
        companyId,
        DRIVE_FOLDER_TYPE_ENTREGAS,
      );
      if (!raiz?.driveFolderId) return null;
      await this.driveService.relocateFolder(
        entidad.driveFolderId,
        raiz.driveFolderId,
        nombreCarpeta(entidad.nombre),
      );
      return null;
    } catch (err) {
      this.logger.error(
        `No se pudo renombrar la carpeta de Drive de la entidad ${entidad.id}: ${(err as Error).message}`,
      );
      return 'La entidad se guardó, pero no se pudo cambiar el nombre de su carpeta en Google Drive. Al sincronizar verás un aviso para decidir.';
    }
  }

  private async crearOEnlazarCarpeta(
    entidad: { id: number; nombre: string },
    raizId: string,
  ): Promise<string> {
    const nombre = nombreCarpeta(entidad.nombre);
    const existente = await this.driveService.findChildFolderByName(
      raizId,
      nombre,
    );
    const folderId =
      existente?.id ?? (await this.driveService.createSubfolder(raizId, nombre));
    await this.prisma.cPEntidadPublica.update({
      where: { id: entidad.id },
      data: { driveFolderId: folderId },
    });
    return folderId;
  }

  private async assertNombreLibre(
    nombre: string,
    companyId: number,
    exceptoId?: number,
  ) {
    const clave = claveNombre(nombre);
    const todas = await this.prisma.cPEntidadPublica.findMany({
      where: { companyId },
      select: { id: true, nombre: true },
    });
    if (todas.some((e) => e.id !== exceptoId && claveNombre(e.nombre) === clave)) {
      throw new BadRequestException(
        'Ya existe una entidad con ese nombre. Cada entidad tiene su propia carpeta en Drive, así que el nombre no se puede repetir.',
      );
    }
  }

  // ------------------------------------------------------------- Drive: sync

  /**
   * Compara la lista de entidades con las subcarpetas de la carpeta raíz de
   * Contratación Pública y devuelve las diferencias. NO crea ni borra nada,
   * ni en la base ni en Drive: la persona decide en cada aviso (crear la
   * entidad, crear la carpeta, renombrar...). Lo único que hace solo es
   * enlazar una entidad sin carpeta con la carpeta que ya se llama igual,
   * porque no crea nada nuevo. Las entidades archivadas no generan avisos.
   * Un fallo de Drive no lanza: se devuelve como `warning`.
   */
  async sincronizarConDrive(companyId: number): Promise<SyncEntidadesDriveResult> {
    const resultado: SyncEntidadesDriveResult = {
      configurada: false,
      sincronizadoAt: new Date().toISOString(),
      carpetasSinEntidad: [],
      entidadesSinCarpeta: [],
      renombradas: [],
      ausentes: [],
      avisos: [],
    };

    let raizId: string;
    try {
      const raiz = await this.driveService.getConfig(
        companyId,
        DRIVE_FOLDER_TYPE_ENTREGAS,
      );
      if (!raiz?.driveFolderId) {
        resultado.warning =
          'Falta elegir la carpeta de Google Drive de Contratación Pública.';
        return resultado;
      }
      raizId = raiz.driveFolderId;
      resultado.configurada = true;
    } catch (err) {
      this.logger.error(`Sync CP: no se pudo leer la configuración: ${(err as Error).message}`);
      resultado.warning = 'No se pudo leer la configuración de la carpeta de Drive.';
      return resultado;
    }

    let carpetas: { id: string; name: string }[];
    try {
      carpetas = await this.driveService.listSubFolders(raizId);
    } catch (err) {
      this.logger.error(`Sync CP: no se pudo leer la carpeta de Drive: ${(err as Error).message}`);
      resultado.warning =
        'No se pudo leer la carpeta de Google Drive. Revisa que siga compartida con la cuenta del sistema y vuelve a intentar.';
      return resultado;
    }

    const entidades = await this.prisma.cPEntidadPublica.findMany({
      where: { companyId },
    });
    const idsEnDrive = new Set(carpetas.map((c) => c.id));
    const ancladas = new Map(
      entidades.filter((e) => e.driveFolderId).map((e) => [e.driveFolderId as string, e]),
    );
    // Nombres ya ocupados (para no proponer dos entidades con el mismo nombre).
    const clavesUsadas = new Set(entidades.map((e) => claveNombre(e.nombre)));
    const sinCarpeta = entidades.filter((e) => !e.driveFolderId);

    for (const carpeta of carpetas) {
      const duena = ancladas.get(carpeta.id);
      if (duena) {
        if (!duena.archivada && claveNombre(duena.nombre) !== claveNombre(carpeta.name)) {
          resultado.renombradas.push({
            entidadId: duena.id,
            nombreSistema: duena.nombre,
            nombreDrive: carpeta.name,
          });
        }
        continue;
      }

      // Entidad existente sin carpeta, con el mismo nombre: se enlaza.
      const clave = claveNombre(carpeta.name);
      const candidatas = sinCarpeta.filter((e) => claveNombre(e.nombre) === clave);
      if (candidatas.length === 1) {
        const e = candidatas[0];
        await this.prisma.cPEntidadPublica.update({
          where: { id: e.id },
          data: { driveFolderId: carpeta.id },
        });
        sinCarpeta.splice(sinCarpeta.indexOf(e), 1);
        continue;
      }
      if (candidatas.length > 1) {
        resultado.avisos.push(
          `Hay ${candidatas.length} entidades llamadas "${carpeta.name}"; no se pudo enlazar su carpeta. Deja un solo nombre.`,
        );
        continue;
      }

      // Carpeta sin entidad: se ofrece crearla (no se crea sola).
      if (clavesUsadas.has(clave)) {
        resultado.avisos.push(
          `La carpeta "${carpeta.name}" está repetida en Drive; solo se tomó en cuenta una.`,
        );
        continue;
      }
      clavesUsadas.add(clave);
      resultado.carpetasSinEntidad.push({
        carpetaId: carpeta.id,
        nombre: carpeta.name.trim(),
      });
    }

    // Entidades con carpeta anclada que ya no está en la carpeta raíz.
    for (const e of entidades) {
      if (!e.archivada && e.driveFolderId && !idsEnDrive.has(e.driveFolderId)) {
        resultado.ausentes.push({ entidadId: e.id, nombre: e.nombre });
      }
    }

    // Entidades que siguen sin carpeta: se ofrece crearla (no se crea sola).
    for (const e of sinCarpeta) {
      if (!e.archivada) {
        resultado.entidadesSinCarpeta.push({ entidadId: e.id, nombre: e.nombre });
      }
    }

    return resultado;
  }

  /** Aviso "carpeta sin entidad" → "Crear entidad": la entidad toma el nombre de la carpeta y queda enlazada a ella. */
  async crearEntidadDesdeCarpeta(folderId: string, companyId: number) {
    const raiz = await this.driveService.getConfig(
      companyId,
      DRIVE_FOLDER_TYPE_ENTREGAS,
    );
    if (!raiz?.driveFolderId) {
      throw new BadRequestException(
        'Falta elegir la carpeta de Google Drive de Contratación Pública.',
      );
    }
    let carpetas: { id: string; name: string }[];
    try {
      carpetas = await this.driveService.listSubFolders(raiz.driveFolderId);
    } catch (err) {
      this.logger.error(`No se pudo leer la carpeta de Drive: ${(err as Error).message}`);
      throw new BadRequestException(
        'No se pudo leer la carpeta de Google Drive. Intenta de nuevo.',
      );
    }
    // El id lo manda el navegador: solo vale si de verdad es una subcarpeta de la raíz.
    const carpeta = carpetas.find((c) => c.id === folderId);
    if (!carpeta) {
      throw new BadRequestException(
        'Esa carpeta ya no está en Drive. Sincroniza de nuevo para ver el estado actual.',
      );
    }
    const yaEnlazada = await this.prisma.cPEntidadPublica.findFirst({
      where: { companyId, driveFolderId: folderId },
    });
    if (yaEnlazada) {
      throw new BadRequestException('Esa carpeta ya pertenece a una entidad.');
    }
    const nombre = carpeta.name.trim();
    await this.assertNombreLibre(nombre, companyId);
    return this.prisma.cPEntidadPublica.create({
      data: { nombre, companyId, driveFolderId: folderId },
    });
  }

  /** Aviso "entidad sin carpeta" → "Crear carpeta". */
  async crearCarpeta(id: number, companyId: number) {
    const entidad = await this.findOne(id, companyId);
    if (entidad.driveFolderId) return entidad;
    try {
      await this.carpetaDeEntidad(id, companyId);
    } catch (err) {
      if (err instanceof BadRequestException) throw err;
      this.logger.error(
        `No se pudo crear la carpeta de la entidad ${id}: ${(err as Error).message}`,
      );
      throw new BadRequestException(
        'No se pudo crear la carpeta en Google Drive. Intenta de nuevo.',
      );
    }
    return this.findOne(id, companyId);
  }

  /** "Actualizar nombre": la entidad toma el nombre que tiene su carpeta en Drive. */
  async usarNombreDeDrive(id: number, companyId: number) {
    const entidad = await this.findOne(id, companyId);
    if (!entidad.driveFolderId) {
      throw new BadRequestException('Esta entidad no tiene carpeta en Drive.');
    }
    let nombreDrive: string;
    try {
      const meta = await this.driveService.getFolderMetadata(entidad.driveFolderId);
      nombreDrive = (meta.name || '').trim();
    } catch (err) {
      this.logger.error(`No se pudo leer la carpeta de la entidad ${id}: ${(err as Error).message}`);
      throw new BadRequestException(
        'No se pudo leer la carpeta en Google Drive. Sincroniza de nuevo para ver su estado.',
      );
    }
    if (!nombreDrive) {
      throw new BadRequestException('La carpeta de Drive no tiene nombre.');
    }
    await this.assertNombreLibre(nombreDrive, companyId, id);
    return this.prisma.cPEntidadPublica.update({
      where: { id },
      data: { nombre: nombreDrive },
    });
  }

  /** "Mantener el del sistema": la carpeta de Drive vuelve a llamarse como la entidad. */
  async usarNombreDelSistema(id: number, companyId: number) {
    const entidad = await this.findOne(id, companyId);
    if (!entidad.driveFolderId) {
      throw new BadRequestException('Esta entidad no tiene carpeta en Drive.');
    }
    const aviso = await this.renombrarCarpeta(entidad, companyId);
    if (aviso) {
      throw new BadRequestException(
        'No se pudo cambiar el nombre de la carpeta en Google Drive. Intenta de nuevo.',
      );
    }
    return entidad;
  }

  /** "Volver a crearla": la carpeta de la entidad ya no existe, se crea una nueva. */
  async recrearCarpeta(id: number, companyId: number) {
    const entidad = await this.findOne(id, companyId);
    const raiz = await this.driveService.getConfig(
      companyId,
      DRIVE_FOLDER_TYPE_ENTREGAS,
    );
    if (!raiz?.driveFolderId) {
      throw new BadRequestException(
        'Falta elegir la carpeta de Google Drive de Contratación Pública.',
      );
    }
    try {
      // Se suelta el ancla vieja y se busca/crea por nombre.
      await this.prisma.cPEntidadPublica.update({
        where: { id },
        data: { driveFolderId: null },
      });
      await this.crearOEnlazarCarpeta(entidad, raiz.driveFolderId);
    } catch (err) {
      await this.prisma.cPEntidadPublica.update({
        where: { id },
        data: { driveFolderId: entidad.driveFolderId },
      });
      this.logger.error(`No se pudo recrear la carpeta de la entidad ${id}: ${(err as Error).message}`);
      throw new BadRequestException(
        'No se pudo crear la carpeta en Google Drive. Intenta de nuevo.',
      );
    }
    return this.findOne(id, companyId);
  }
}
