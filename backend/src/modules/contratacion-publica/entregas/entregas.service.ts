import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import * as path from 'path';
import { PrismaService } from '../../../prisma/prisma.service';
import { DriveService } from '../../personal/services/drive.service';
import {
  convertirOfficeAPdf,
  extensionOffice,
} from '../../../common/utils/office-to-pdf.util';
import {
  leerLibroExcel,
  type LibroVista,
} from '../../../common/utils/excel-hojas.util';
import { CPEntidadesService } from '../entidades/entidades.service';
import {
  DRIVE_FOLDER_TYPE_ENTREGAS,
  nombreCarpeta,
} from '../entidades/entidad-folder.util';
import { NotificationsService } from '../../notifications/notifications.service';
import { GmailMailService } from '../../mail/gmail-mail.service';
import { PermissionsService } from '../../permissions/permissions.service';
import {
  CreateEntregaDto,
  CreateSolicitudDto,
  EntregarDto,
  RechazarEntregaDto,
  UpdateEntregaDto,
} from './dto/entregas.dto';
import {
  diasEntre,
  estaVencida,
  extraerIdArchivoDrive,
  fechaDesdeTexto,
  formatoFecha,
  hoyEcuador,
  nombreMes,
  trasladarFechaAMes,
} from './entregas.util';

/**
 * Remitente propio de los correos de Contratación Pública. NO se usa
 * `NotificationConfig` de la empresa: esa configuración es de RRHH (recordatorios
 * de cumplimiento a guardias) y hacía que estos avisos salieran como
 * "Recursos Humanos". Mismo patrón que Referidos y la recuperación de
 * contraseña: la casilla de Sistemas, que ya tiene delegación de dominio.
 * Cambiar estas constantes no afecta a RRHH.
 */
export const CORREO_REMITENTE_CP = 'sistemas@gemeseg.com';
export const NOMBRE_REMITENTE_CP = 'Contratación Pública GEMESEG';

/** Igual al límite de subida del controlador (15 MB). */
const TAMANO_MAXIMO_ARCHIVO = 15 * 1024 * 1024;

const EXTENSIONES_PERMITIDAS = [
  '.pdf',
  '.doc',
  '.docx',
  '.xls',
  '.xlsx',
  '.jpg',
  '.jpeg',
  '.png',
  '.zip',
];

export interface Actor {
  userId: number;
  companyId: number;
  /** Tiene permiso de escritura en Contratación Pública (el personal de CP). */
  puedeEscribir: boolean;
}

@Injectable()
export class EntregasService {
  private readonly logger = new Logger(EntregasService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly driveService: DriveService,
    private readonly entidades: CPEntidadesService,
    private readonly notifications: NotificationsService,
    private readonly mail: GmailMailService,
    private readonly permissions: PermissionsService,
  ) {}

  // ---------------------------------------------------------------- consulta

  async listarSolicitudes(entidadId: number, actor: Actor) {
    const entidad = await this.getEntidad(entidadId, actor.companyId);
    const solicitudes = await this.prisma.cPSolicitudMensual.findMany({
      where: {
        entidadId,
        companyId: actor.companyId,
        ...(actor.puedeEscribir ? {} : { estado: 'ENVIADA' }),
      },
      include: {
        entregas: {
          select: {
            estado: true,
            fechaLimite: true,
            responsables: { select: { userId: true } },
          },
        },
      },
      orderBy: [{ anio: 'desc' }, { mes: 'desc' }],
    });

    const hoy = hoyEcuador();
    const filas = solicitudes
      .map((s) => {
        const visibles = actor.puedeEscribir
          ? s.entregas
          : s.entregas.filter((e) =>
              e.responsables.some((r) => r.userId === actor.userId),
            );
        return {
          id: s.id,
          anio: s.anio,
          mes: s.mes,
          estado: s.estado,
          total: visibles.length,
          pendientes: visibles.filter((e) => e.estado === 'PENDIENTE').length,
          entregadas: visibles.filter((e) => e.estado === 'ENTREGADO').length,
          aprobadas: visibles.filter((e) => e.estado === 'APROBADO').length,
          rechazadas: visibles.filter((e) => e.estado === 'RECHAZADO').length,
          vencidas: visibles.filter((e) =>
            estaVencida(e.estado, e.fechaLimite, hoy),
          ).length,
        };
      })
      .filter((s) => actor.puedeEscribir || s.total > 0);

    return {
      entidad: {
        id: entidad.id,
        nombre: entidad.nombre,
        driveFolderId: entidad.driveFolderId,
      },
      solicitudes: filas,
    };
  }

  async obtenerSolicitud(id: number, actor: Actor) {
    const s = await this.cargarSolicitud(id, actor.companyId);
    if (!actor.puedeEscribir && s.estado !== 'ENVIADA') {
      throw new NotFoundException('Solicitud no encontrada');
    }
    const hoy = hoyEcuador();
    const entregas = s.entregas
      .filter(
        (e) =>
          actor.puedeEscribir ||
          e.responsables.some((r) => r.userId === actor.userId),
      )
      .map((e) => {
        const esMia = e.responsables.some((r) => r.userId === actor.userId);
        return {
          id: e.id,
          nombre: e.nombre,
          descripcion: e.descripcion,
          departmentId: e.departmentId,
          departmentName: e.department?.name ?? null,
          fechaLimite: e.fechaLimite.toISOString().slice(0, 10),
          estado: e.estado,
          vencida: estaVencida(e.estado, e.fechaLimite, hoy),
          origen: e.origen,
          url: e.url,
          motivoRechazo: e.motivoRechazo,
          entregadoPorNombre: e.entregadoPorNombre,
          entregadoAt: e.entregadoAt,
          revisadoPorNombre: e.revisadoPorNombre,
          revisadoAt: e.revisadoAt,
          responsables: e.responsables.map((r) => ({
            id: r.user.id,
            nombre: r.user.fullName,
          })),
          esMia,
          puedeEntregar:
            s.estado === 'ENVIADA' &&
            (esMia || actor.puedeEscribir) &&
            e.estado !== 'APROBADO',
        };
      });
    return {
      id: s.id,
      entidadId: s.entidadId,
      entidadNombre: s.entidad.nombre,
      anio: s.anio,
      mes: s.mes,
      estado: s.estado,
      enviadaAt: s.enviadaAt,
      entregas,
    };
  }

  // --------------------------------------------------------------- solicitud

  async crearSolicitud(
    entidadId: number,
    dto: CreateSolicitudDto,
    actor: Actor,
  ) {
    const entidad = await this.getEntidad(entidadId, actor.companyId);
    const existente = await this.prisma.cPSolicitudMensual.findUnique({
      where: {
        entidadId_anio_mes: { entidadId, anio: dto.anio, mes: dto.mes },
      },
    });
    if (existente) {
      throw new ConflictException(
        `Ya existe una solicitud de ${nombreMes(dto.mes)} de ${dto.anio} para ${entidad.nombre}.`,
      );
    }

    let origen: Awaited<
      ReturnType<EntregasService['buscarSolicitudAnterior']>
    > = null;
    if (dto.copiarMesAnterior) {
      origen = await this.buscarSolicitudAnterior(entidadId, dto.anio, dto.mes);
      if (!origen) {
        throw new BadRequestException(
          'Esta entidad no tiene una solicitud anterior para copiar. Crea la solicitud en blanco.',
        );
      }
    }

    const creada = await this.prisma.$transaction(async (tx) => {
      const sol = await tx.cPSolicitudMensual.create({
        data: {
          entidadId,
          anio: dto.anio,
          mes: dto.mes,
          companyId: actor.companyId,
          createdBy: actor.userId,
        },
      });
      for (const e of origen?.entregas ?? []) {
        // Se copian solo las personas que siguen activas en la empresa.
        const responsables = e.responsables
          .filter(
            (r) => r.user.isActive && r.user.companyId === actor.companyId,
          )
          .map((r) => ({ userId: r.userId }));
        await tx.cPEntregaDocumento.create({
          data: {
            solicitudId: sol.id,
            nombre: e.nombre,
            descripcion: e.descripcion,
            departmentId: e.departmentId,
            orden: e.orden,
            fechaLimite: trasladarFechaAMes(e.fechaLimite, dto.anio, dto.mes),
            responsables: { create: responsables },
          },
        });
      }
      return sol;
    });
    return this.obtenerSolicitud(creada.id, actor);
  }

  async eliminarSolicitud(id: number, actor: Actor) {
    await this.cargarSolicitud(id, actor.companyId);
    await this.prisma.cPSolicitudMensual.delete({ where: { id } });
    return { ok: true };
  }

  async enviarSolicitud(id: number, actor: Actor) {
    const s = await this.cargarSolicitud(id, actor.companyId);
    if (s.estado !== 'BORRADOR') {
      throw new BadRequestException('Esta solicitud ya fue enviada.');
    }
    if (s.entregas.length === 0) {
      throw new BadRequestException(
        'Agrega al menos un documento antes de enviar la solicitud.',
      );
    }
    const sinResponsable = s.entregas.filter(
      (e) => e.responsables.length === 0,
    );
    if (sinResponsable.length > 0) {
      throw new BadRequestException(
        `Falta asignar responsables a: ${sinResponsable.map((e) => `"${e.nombre}"`).join(', ')}.`,
      );
    }

    await this.prisma.cPSolicitudMensual.update({
      where: { id },
      data: { estado: 'ENVIADA', enviadaAt: new Date() },
    });

    // Un solo aviso por persona, con todos sus documentos de esta solicitud.
    const porPersona = new Map<number, typeof s.entregas>();
    for (const e of s.entregas) {
      for (const r of e.responsables) {
        porPersona.set(r.userId, [...(porPersona.get(r.userId) ?? []), e]);
      }
    }
    const periodo = `${nombreMes(s.mes)} de ${s.anio}`;
    for (const [userId, docs] of porPersona) {
      const proxima = docs
        .map((d) => d.fechaLimite)
        .sort((a, b) => a.getTime() - b.getTime())[0];
      await this.avisar([userId], actor.companyId, {
        titulo: 'Documentos por entregar',
        mensaje:
          `Tienes ${docs.length} documento(s) por entregar a Contratación Pública para ${s.entidad.nombre} (${periodo}). ` +
          `El más próximo vence el ${formatoFecha(proxima)}.`,
        link: this.link(s.entidadId, s.id),
        correo: true,
      });
    }
    return this.obtenerSolicitud(id, actor);
  }

  // --------------------------------------------------------------- documento

  async agregarEntrega(
    solicitudId: number,
    dto: CreateEntregaDto,
    actor: Actor,
  ) {
    const s = await this.cargarSolicitud(solicitudId, actor.companyId);
    const responsableIds = await this.validarResponsables(
      dto.responsableIds,
      actor.companyId,
    );
    if (dto.departmentId) await this.validarDepartamento(dto.departmentId);

    const creada = await this.prisma.cPEntregaDocumento.create({
      data: {
        solicitudId,
        nombre: dto.nombre.trim(),
        descripcion: dto.descripcion?.trim() || null,
        departmentId: dto.departmentId ?? null,
        fechaLimite: fechaDesdeTexto(dto.fechaLimite),
        orden: s.entregas.length,
        responsables: { create: responsableIds.map((userId) => ({ userId })) },
      },
    });
    if (s.estado === 'ENVIADA') {
      await this.avisar(responsableIds, actor.companyId, {
        titulo: 'Nuevo documento por entregar',
        mensaje: `Se te asignó "${creada.nombre}" para ${s.entidad.nombre} (${nombreMes(s.mes)} de ${s.anio}). Vence el ${formatoFecha(creada.fechaLimite)}.`,
        link: this.link(s.entidadId, s.id),
        correo: true,
      });
    }
    return this.obtenerSolicitud(solicitudId, actor);
  }

  async actualizarEntrega(id: number, dto: UpdateEntregaDto, actor: Actor) {
    const e = await this.cargarEntrega(id, actor.companyId);
    const s = e.solicitud;

    const antes = e.responsables.map((r) => r.userId);
    const despues = dto.responsableIds
      ? await this.validarResponsables(dto.responsableIds, actor.companyId)
      : antes;
    const agregados = despues.filter((u) => !antes.includes(u));
    const quitados = antes.filter((u) => !despues.includes(u));
    if (dto.departmentId) await this.validarDepartamento(dto.departmentId);

    const nuevaFecha = dto.fechaLimite
      ? fechaDesdeTexto(dto.fechaLimite)
      : null;
    const cambioFecha =
      !!nuevaFecha && nuevaFecha.getTime() !== e.fechaLimite.getTime();

    await this.prisma.$transaction(async (tx) => {
      await tx.cPEntregaDocumento.update({
        where: { id },
        data: {
          ...(dto.nombre !== undefined ? { nombre: dto.nombre.trim() } : {}),
          ...(dto.descripcion !== undefined
            ? { descripcion: dto.descripcion.trim() || null }
            : {}),
          ...(dto.departmentId !== undefined
            ? { departmentId: dto.departmentId }
            : {}),
          ...(nuevaFecha ? { fechaLimite: nuevaFecha } : {}),
          // Con otra fecha, el recordatorio de la fecha anterior ya no cuenta.
          ...(cambioFecha ? { ultimoRecordatorioAt: null } : {}),
        },
      });
      if (quitados.length > 0) {
        await tx.cPEntregaResponsable.deleteMany({
          where: { entregaId: id, userId: { in: quitados } },
        });
      }
      if (agregados.length > 0) {
        await tx.cPEntregaResponsable.createMany({
          data: agregados.map((userId) => ({ entregaId: id, userId })),
          skipDuplicates: true,
        });
      }
    });

    if (s.estado === 'ENVIADA') {
      const nombre = dto.nombre?.trim() || e.nombre;
      const fecha = nuevaFecha ?? e.fechaLimite;
      const ctx = `${s.entidad.nombre} (${nombreMes(s.mes)} de ${s.anio})`;
      await this.avisar(agregados, actor.companyId, {
        titulo: 'Nuevo documento por entregar',
        mensaje: `Se te asignó "${nombre}" para ${ctx}. Vence el ${formatoFecha(fecha)}.`,
        link: this.link(s.entidadId, s.id),
        correo: true,
      });
      if (cambioFecha) {
        await this.avisar(
          despues.filter((u) => !agregados.includes(u)),
          actor.companyId,
          {
            titulo: 'Cambió una fecha de entrega',
            mensaje: `"${nombre}" para ${ctx} ahora vence el ${formatoFecha(fecha)}.`,
            link: this.link(s.entidadId, s.id),
            correo: true,
          },
        );
      }
    }
    return this.obtenerSolicitud(s.id, actor);
  }

  async eliminarEntrega(id: number, actor: Actor) {
    const e = await this.cargarEntrega(id, actor.companyId);
    await this.prisma.cPEntregaDocumento.delete({ where: { id } });
    return this.obtenerSolicitud(e.solicitudId, actor);
  }

  /**
   * "Recordar al responsable": el personal de CP vuelve a avisar, a mano, de un
   * documento que sigue pendiente o rechazado. Sale por campana y por correo a
   * quienes lo deben. No toca `ultimoRecordatorioAt`: el recordatorio diario
   * automático sigue su propio calendario.
   */
  async recordarEntrega(id: number, actor: Actor) {
    const e = await this.cargarEntrega(id, actor.companyId);
    if (e.solicitud.estado !== 'ENVIADA') {
      throw new BadRequestException(
        'La solicitud todavía es un borrador: envíala primero y los responsables recibirán el aviso.',
      );
    }
    if (e.estado !== 'PENDIENTE' && e.estado !== 'RECHAZADO') {
      throw new BadRequestException(
        'Este documento ya fue entregado: no hace falta recordarlo.',
      );
    }
    const destinatarios = e.responsables.map((r) => r.userId);
    if (destinatarios.length === 0) {
      throw new BadRequestException('Este documento no tiene responsables a quienes avisar.');
    }

    const dias = diasEntre(hoyEcuador(), e.fechaLimite);
    const cuando =
      dias < 0
        ? `venció el ${formatoFecha(e.fechaLimite)}`
        : dias === 0
          ? 'vence HOY'
          : `vence el ${formatoFecha(e.fechaLimite)}`;
    const rechazado =
      e.estado === 'RECHAZADO' ? ' Fue rechazado: hay que entregarlo de nuevo.' : '';
    await this.avisar(destinatarios, actor.companyId, {
      titulo: 'Recordatorio de documento',
      mensaje: `Recuerda entregar "${e.nombre}" para ${e.solicitud.entidad.nombre} (${nombreMes(e.solicitud.mes)} de ${e.solicitud.anio}): ${cuando}.${rechazado}`,
      link: this.link(e.solicitud.entidadId, e.solicitudId),
      correo: true,
    });
    return { avisados: destinatarios.length };
  }

  // ----------------------------------------------------------------- entrega

  /** Sube el archivo a Drive y devuelve su enlace; la entrega se registra aparte con `entregar`. */
  async subirArchivo(
    id: number,
    file: Express.Multer.File,
    actor: Actor,
  ): Promise<{ url: string }> {
    const e = await this.cargarEntrega(id, actor.companyId);
    this.assertPuedeEntregar(e, actor);

    const ext = path.extname(file.originalname).toLowerCase();
    if (!EXTENSIONES_PERMITIDAS.includes(ext)) {
      throw new BadRequestException(
        `Ese tipo de archivo no se puede subir (${ext || 'sin extensión'}). Permitidos: ${EXTENSIONES_PERMITIDAS.join(', ')}.`,
      );
    }

    try {
      // Carpeta de la entidad: la enlazada por id (no se busca por nombre, así
      // un cambio de nombre no crea otra). Si falta la carpeta raíz, avisa con
      // un mensaje claro en vez de fallar con el error genérico de Drive.
      const entidadFolder = await this.entidades.carpetaDeEntidad(
        e.solicitud.entidadId,
        actor.companyId,
      );
      const mesFolder = await this.asegurarSubcarpeta(
        entidadFolder,
        `${e.solicitud.anio}-${String(e.solicitud.mes).padStart(2, '0')}`,
      );
      const nombreArchivo = `${nombreCarpeta(e.nombre)} - ${file.originalname}`;
      const { url } = await this.driveService.uploadFile(
        mesFolder,
        file.buffer,
        nombreArchivo,
        file.mimetype,
      );
      return { url };
    } catch (err) {
      // Mensajes ya pensados para la persona (p. ej. falta la carpeta raíz).
      if (err instanceof BadRequestException) throw err;
      this.logger.error(
        `No se pudo subir la entrega ${id} a Drive: ${(err as Error).message}`,
      );
      throw new ServiceUnavailableException(
        'No se pudo guardar el archivo en Google Drive. Intenta de nuevo, o pega un enlace.',
      );
    }
  }

  async entregar(id: number, dto: EntregarDto, actor: Actor) {
    const e = await this.cargarEntrega(id, actor.companyId);
    this.assertPuedeEntregar(e, actor);
    const url = dto.url.trim();
    if (!/^https?:\/\/\S+$/i.test(url)) {
      throw new BadRequestException(
        'El enlace no es válido. Debe empezar con http:// o https://.',
      );
    }

    // "Reemplazar el anterior": se borra ANTES de registrar. Si Drive falla, no se
    // registra nada y la persona puede reintentar (o elegir conservar ambos).
    if (dto.reemplazarAnterior) {
      await this.borrarArchivoAnterior(e, url, actor.companyId);
    }

    const persona = await this.prisma.user.findUnique({
      where: { id: actor.userId },
      select: { fullName: true },
    });
    await this.prisma.$transaction([
      this.prisma.cPEntregaDocumento.update({
        where: { id },
        data: {
          estado: 'ENTREGADO',
          origen: dto.origen,
          url,
          motivoRechazo: null,
          entregadoPorId: actor.userId,
          entregadoPorNombre: persona?.fullName ?? null,
          entregadoAt: new Date(),
          revisadoPorId: null,
          revisadoPorNombre: null,
          revisadoAt: null,
        },
      }),
      this.prisma.cPEntregaHistorial.create({
        data: {
          entregaId: id,
          accion: 'ENTREGADO',
          origen: dto.origen,
          usuarioId: actor.userId,
          usuarioNombre: persona?.fullName ?? null,
        },
      }),
    ]);
    const s = e.solicitud;
    // A todo el personal de Contratación Pública que revisa (no solo a quien
    // creó la solicitud, que podía estar ausente) y solo por campana.
    const equipo = await this.equipoQueRevisa(actor.companyId);
    const destinatarios = [...new Set([s.createdBy, ...equipo])].filter(
      (u) => u !== actor.userId,
    );
    await this.avisar(destinatarios, actor.companyId, {
      titulo: 'Documento entregado',
      mensaje: `${persona?.fullName ?? 'Alguien'} entregó "${e.nombre}" para ${s.entidad.nombre} (${nombreMes(s.mes)} de ${s.anio}). Falta revisarlo.`,
      link: this.link(s.entidadId, s.id),
      correo: false,
    });
    return this.obtenerSolicitud(s.id, actor);
  }

  /**
   * Borra de Drive el archivo que se había entregado antes (la persona eligió
   * "reemplazar" al entregar de nuevo), para no dejar dos copias del mismo documento.
   *
   * La URL guardada la mandó el navegador al entregar, así que solo se borra si el
   * archivo cuelga de la carpeta del mes de ESTA entidad y no está en la papelera
   * (misma comprobación que la vista previa). Tampoco se borra si es el mismo
   * archivo que se está entregando ahora, ni si otra entrega usa el mismo enlace.
   * Un archivo que ya no existe en Drive no es un error: no hay nada que borrar.
   */
  private async borrarArchivoAnterior(
    e: Awaited<ReturnType<EntregasService['cargarEntrega']>>,
    nuevaUrl: string,
    companyId: number,
  ): Promise<void> {
    if (e.origen !== 'ARCHIVO' || !e.url) return;
    const fileId = extraerIdArchivoDrive(e.url);
    if (!fileId || fileId === extraerIdArchivoDrive(nuevaUrl)) return;

    const compartido = await this.prisma.cPEntregaDocumento.count({
      where: { url: e.url, id: { not: e.id } },
    });
    if (compartido > 0) return;

    try {
      const entidad = await this.getEntidad(e.solicitud.entidadId, companyId);
      if (!entidad.driveFolderId) return;
      const periodo = `${e.solicitud.anio}-${String(e.solicitud.mes).padStart(2, '0')}`;
      const mes = await this.driveService.findChildFolderByName(
        entidad.driveFolderId,
        periodo,
      );
      if (!mes) return;
      const meta = await this.driveService.getFileMetadata(fileId);
      if (meta.trashed || !meta.parents.includes(mes.id)) return;
      await this.driveService.deleteFileById(fileId);
    } catch (err) {
      if (err instanceof HttpException) throw err;
      const status =
        (err as { code?: number; response?: { status?: number } })?.code ??
        (err as { response?: { status?: number } })?.response?.status;
      if (status === 404) return;
      this.logger.error(
        `No se pudo borrar el archivo anterior de la entrega ${e.id} en Drive: ${(err as Error).message}`,
      );
      throw new ServiceUnavailableException(
        'No se pudo borrar el archivo anterior de Google Drive, así que la entrega no se registró. Intenta de nuevo, o elige conservar ambos.',
      );
    }
  }

  async aprobar(id: number, actor: Actor) {
    const e = await this.cargarEntrega(id, actor.companyId);
    if (e.estado !== 'ENTREGADO') {
      throw new BadRequestException(
        'Solo se puede aprobar un documento que ya fue entregado.',
      );
    }
    const revisor = await this.marcarRevision(id, actor, {
      estado: 'APROBADO',
      motivoRechazo: null,
    });
    await this.avisar(
      e.responsables.map((r) => r.userId),
      actor.companyId,
      {
        titulo: 'Documento aprobado',
        mensaje: `"${e.nombre}" para ${e.solicitud.entidad.nombre} fue aprobado${revisor ? ` por ${revisor}` : ''}.`,
        link: this.link(e.solicitud.entidadId, e.solicitud.id),
        correo: false,
      },
    );
    return this.obtenerSolicitud(e.solicitud.id, actor);
  }

  async rechazar(id: number, dto: RechazarEntregaDto, actor: Actor) {
    const e = await this.cargarEntrega(id, actor.companyId);
    if (e.estado !== 'ENTREGADO' && e.estado !== 'APROBADO') {
      throw new BadRequestException(
        'Solo se puede rechazar un documento que ya fue entregado.',
      );
    }
    const motivo = dto.motivo.trim();
    await this.marcarRevision(id, actor, {
      estado: 'RECHAZADO',
      motivoRechazo: motivo,
    });
    await this.avisar(
      e.responsables.map((r) => r.userId),
      actor.companyId,
      {
        titulo: 'Documento rechazado',
        mensaje: `"${e.nombre}" para ${e.solicitud.entidad.nombre} fue rechazado. Motivo: ${motivo}. Entrégalo de nuevo antes del ${formatoFecha(e.fechaLimite)}.`,
        link: this.link(e.solicitud.entidadId, e.solicitud.id),
        correo: true,
      },
    );
    return this.obtenerSolicitud(e.solicitud.id, actor);
  }

  // ------------------------------------------- historial, vista previa, bandejas

  /** Línea de tiempo del documento. La ve el personal de CP y los responsables de ese documento. */
  async historial(id: number, actor: Actor) {
    const e = await this.cargarEntrega(id, actor.companyId);
    this.assertPuedeVer(e, actor);
    const filas = await this.prisma.cPEntregaHistorial.findMany({
      where: { entregaId: id },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    return filas.map((h) => ({
      id: h.id,
      accion: h.accion,
      motivo: h.motivo,
      origen: h.origen,
      usuarioNombre: h.usuarioNombre,
      createdAt: h.createdAt,
    }));
  }

  /**
   * El archivo entregado, listo para mostrarlo en pantalla. Pasa por el
   * servidor porque los archivos subidos son de la cuenta de servicio de Drive
   * y el visor de Drive pediría iniciar sesión. Solo sirve archivos que el
   * sistema mismo subió (`origen = ARCHIVO`) y que de verdad están en la
   * carpeta del mes de esa entidad: el enlace lo manda el navegador, así que
   * sin esa comprobación este endpoint leería cualquier archivo de Drive.
   */
  async obtenerArchivo(
    id: number,
    actor: Actor,
    paraVistaPrevia = false,
    forzarPdf = false,
  ): Promise<{ buffer: Buffer; mimeType: string; nombre: string }> {
    // Tiempo de cada paso, en una sola línea de registro: "Preparando vista previa..."
    // tarda según el paso (Drive, descarga o LibreOffice) y así se ve cuál es.
    const inicio = Date.now();
    let marca = inicio;
    const tiempos: string[] = [];
    const lap = (paso: string) => {
      const ahora = Date.now();
      tiempos.push(`${paso} ${ahora - marca} ms`);
      marca = ahora;
    };
    const terminar = <T>(resultado: T): T => {
      if (paraVistaPrevia) {
        this.logger.log(
          `Vista previa de la entrega ${id}: ${tiempos.join(' · ')} · total ${Date.now() - inicio} ms`,
        );
      }
      return resultado;
    };

    const e = await this.cargarEntrega(id, actor.companyId);
    this.assertPuedeVer(e, actor);
    const noDisponible = new NotFoundException(
      'Este documento no tiene un archivo que se pueda mostrar aquí. Usa "Abrir enlace".',
    );
    const fileId =
      e.origen === 'ARCHIVO' && e.url ? extraerIdArchivoDrive(e.url) : null;
    if (!fileId) throw noDisponible;

    try {
      const entidad = await this.getEntidad(e.solicitud.entidadId, actor.companyId);
      if (!entidad.driveFolderId) throw noDisponible;
      lap('base de datos');
      const periodo = `${e.solicitud.anio}-${String(e.solicitud.mes).padStart(2, '0')}`;
      // Las dos comprobaciones a Drive no dependen una de otra: van a la vez.
      const [mes, meta] = await Promise.all([
        this.carpetaDelMes(entidad.driveFolderId, periodo),
        this.driveService.getFileMetadata(fileId),
      ]);
      lap('Drive (carpeta y datos del archivo)');
      if (!mes || meta.trashed || !meta.parents.includes(mes.id)) throw noDisponible;
      if (meta.size !== null && meta.size > TAMANO_MAXIMO_ARCHIVO) {
        throw new BadRequestException('El archivo es demasiado grande para mostrarlo aquí.');
      }
      const nombre = meta.name || `documento-${id}`;
      const ext = extensionOffice(nombre);
      const comoCuadricula = paraVistaPrevia && ext === '.xlsx' && !forzarPdf;

      // Si el PDF de este archivo ya se convirtió antes, no hace falta ni descargarlo.
      if (paraVistaPrevia && ext && !comoCuadricula) {
        const guardado = this.pdfsConvertidos.get(fileId);
        if (guardado) {
          lap('PDF en memoria');
          return terminar({
            buffer: guardado,
            mimeType: 'application/pdf',
            nombre: nombre.slice(0, -ext.length) + '.pdf',
          });
        }
      }

      const buffer = await this.driveService.downloadFileBuffer(fileId);
      lap('descarga de Drive');
      // Un .xlsx se muestra como cuadrícula de hojas (como la vista de Drive), no
      // como PDF: al imprimirlo, una hoja ancha se parte en páginas. Si no se puede
      // leer (dañado, con contraseña) o se pide el PDF, sigue la conversión de siempre.
      if (comoCuadricula) {
        const libro = await this.leerLibroParaVista(buffer, id);
        if (libro) {
          lap('lectura de hojas');
          return terminar({
            buffer: Buffer.from(JSON.stringify(libro), 'utf-8'),
            mimeType: 'application/json',
            nombre,
          });
        }
      }
      if (paraVistaPrevia && ext) {
        const pdf = await this.convertirParaVistaPrevia(buffer, ext, id, fileId);
        lap('conversión a PDF');
        return terminar({
          buffer: pdf,
          mimeType: 'application/pdf',
          nombre: nombre.slice(0, -ext.length) + '.pdf',
        });
      }
      return terminar({
        buffer,
        mimeType: meta.mimeType || 'application/octet-stream',
        nombre,
      });
    } catch (err) {
      if (err instanceof HttpException) throw err;
      this.logger.error(
        `No se pudo leer el archivo de la entrega ${id} desde Drive: ${(err as Error).message}`,
      );
      throw new ServiceUnavailableException(
        'No se pudo abrir el archivo desde Google Drive. Intenta de nuevo.',
      );
    }
  }

  // Carpeta del mes de una entidad: su id no cambia, pero buscarla es una consulta a
  // Drive en cada vista previa. Se recuerda 5 minutos (solo si existe; en memoria,
  // se pierde al reciclarse la instancia). Solo la vista previa la usa: el borrado
  // de archivos sigue buscándola de nuevo.
  private readonly carpetasDelMes = new Map<string, { id: string; hasta: number }>();
  private static readonly CACHE_CARPETA_MS = 5 * 60 * 1000;

  private async carpetaDelMes(entidadFolderId: string, periodo: string) {
    const clave = `${entidadFolderId}|${periodo}`;
    const guardada = this.carpetasDelMes.get(clave);
    if (guardada && guardada.hasta > Date.now()) return { id: guardada.id };
    const mes = await this.driveService.findChildFolderByName(entidadFolderId, periodo);
    if (mes) {
      this.carpetasDelMes.set(clave, {
        id: mes.id,
        hasta: Date.now() + EntregasService.CACHE_CARPETA_MS,
      });
    }
    return mes;
  }

  /** El libro de Excel como datos para dibujarlo, o null si no se puede leer (entonces se usa el PDF). */
  private async leerLibroParaVista(buffer: Buffer, entregaId: number): Promise<LibroVista | null> {
    try {
      return await leerLibroExcel(buffer);
    } catch (err) {
      this.logger.warn(
        `No se pudo leer como cuadrícula el Excel de la entrega ${entregaId}; se muestra como PDF: ${(err as Error).message}`,
      );
      return null;
    }
  }

  // PDFs ya convertidos de esta instancia, para que ir y volver entre documentos
  // con "Anterior/Siguiente" no vuelva a esperar a LibreOffice (varios segundos).
  // En memoria y acotado: se pierde al reciclarse la instancia, y no escribe nada
  // en Drive. La clave es el id del archivo de Drive (re-entregar sube otro archivo).
  private readonly pdfsConvertidos = new Map<string, Buffer>();
  private static readonly CACHE_PDF_MAX_BYTES = 40 * 1024 * 1024;

  private recordarPdf(clave: string, pdf: Buffer) {
    if (pdf.length > EntregasService.CACHE_PDF_MAX_BYTES) return;
    this.pdfsConvertidos.set(clave, pdf);
    let total = 0;
    for (const p of this.pdfsConvertidos.values()) total += p.length;
    // Se descartan los más antiguos (orden de inserción del Map) hasta entrar en el tope.
    for (const k of this.pdfsConvertidos.keys()) {
      if (total <= EntregasService.CACHE_PDF_MAX_BYTES) break;
      total -= this.pdfsConvertidos.get(k)?.length ?? 0;
      this.pdfsConvertidos.delete(k);
    }
  }

  /** Word/Excel → PDF solo para mostrarlo; la descarga sigue entregando el original. */
  private async convertirParaVistaPrevia(
    buffer: Buffer,
    extension: string,
    entregaId: number,
    fileId: string,
  ): Promise<Buffer> {
    const guardado = this.pdfsConvertidos.get(fileId);
    if (guardado) return guardado;
    try {
      const pdf = await convertirOfficeAPdf(buffer, extension);
      this.recordarPdf(fileId, pdf);
      return pdf;
    } catch (err) {
      this.logger.error(
        `No se pudo convertir a PDF el archivo de la entrega ${entregaId}: ${(err as Error).message}`,
      );
      throw new ServiceUnavailableException(
        'No se pudo preparar la vista previa de este archivo. Puedes descargarlo para verlo.',
      );
    }
  }

  /** Bandeja de quien entrega: sus documentos pendientes o rechazados, de todas las entidades. */
  async misDocumentos(actor: Actor) {
    const hoy = hoyEcuador();
    const filas = await this.prisma.cPEntregaDocumento.findMany({
      where: {
        estado: { in: ['PENDIENTE', 'RECHAZADO'] },
        solicitud: { companyId: actor.companyId, estado: 'ENVIADA' },
        responsables: { some: { userId: actor.userId } },
      },
      include: {
        solicitud: {
          select: {
            id: true,
            anio: true,
            mes: true,
            entidad: { select: { id: true, nombre: true } },
          },
        },
      },
    });
    const orden = (f: (typeof filas)[number]) =>
      f.estado === 'RECHAZADO' ? 0 : estaVencida(f.estado, f.fechaLimite, hoy) ? 1 : 2;
    return filas
      .sort(
        (a, b) =>
          orden(a) - orden(b) ||
          a.fechaLimite.getTime() - b.fechaLimite.getTime() ||
          a.id - b.id,
      )
      .map((f) => ({
        id: f.id,
        nombre: f.nombre,
        descripcion: f.descripcion,
        estado: f.estado,
        fechaLimite: f.fechaLimite.toISOString().slice(0, 10),
        vencida: estaVencida(f.estado, f.fechaLimite, hoy),
        motivoRechazo: f.motivoRechazo,
        // Para que "Entregar de nuevo" sepa si hay un archivo anterior en Drive
        // y pregunte si se reemplaza o se conservan ambos.
        origen: f.origen,
        solicitudId: f.solicitud.id,
        anio: f.solicitud.anio,
        mes: f.solicitud.mes,
        entidadId: f.solicitud.entidad.id,
        entidadNombre: f.solicitud.entidad.nombre,
      }));
  }

  /** Bandeja de Contratación Pública: lo entregado y sin revisar, de todas las entidades (lo más antiguo primero). */
  async porRevisar(actor: Actor) {
    const hoy = hoyEcuador();
    const filas = await this.prisma.cPEntregaDocumento.findMany({
      where: {
        estado: 'ENTREGADO',
        solicitud: { companyId: actor.companyId, estado: 'ENVIADA' },
      },
      orderBy: [{ entregadoAt: 'asc' }, { id: 'asc' }],
      include: {
        department: { select: { name: true } },
        solicitud: {
          select: {
            id: true,
            anio: true,
            mes: true,
            entidad: { select: { id: true, nombre: true } },
          },
        },
      },
    });
    return filas.map((f) => ({
      id: f.id,
      nombre: f.nombre,
      descripcion: f.descripcion,
      departmentName: f.department?.name ?? null,
      estado: f.estado,
      fechaLimite: f.fechaLimite.toISOString().slice(0, 10),
      vencida: estaVencida(f.estado, f.fechaLimite, hoy),
      origen: f.origen,
      url: f.url,
      motivoRechazo: f.motivoRechazo,
      entregadoPorNombre: f.entregadoPorNombre,
      entregadoAt: f.entregadoAt,
      revisadoPorNombre: f.revisadoPorNombre,
      revisadoAt: f.revisadoAt,
      solicitudId: f.solicitud.id,
      anio: f.solicitud.anio,
      mes: f.solicitud.mes,
      entidadId: f.solicitud.entidad.id,
      entidadNombre: f.solicitud.entidad.nombre,
    }));
  }

  // ------------------------------------------------------------------ carpeta

  async obtenerCarpeta(companyId: number) {
    const config = await this.driveService.getConfig(
      companyId,
      DRIVE_FOLDER_TYPE_ENTREGAS,
    );
    if (!config) return null;
    return {
      driveFolderId: config.driveFolderId,
      driveFolderName: config.driveFolderName,
      driveFolderLink: config.driveFolderLink,
    };
  }

  async guardarCarpeta(companyId: number, driveFolderId: string) {
    const guardada = await this.driveService.saveConfig(
      companyId,
      driveFolderId,
      DRIVE_FOLDER_TYPE_ENTREGAS,
    );
    return {
      driveFolderId: guardada.driveFolderId,
      driveFolderName: guardada.driveFolderName,
      driveFolderLink: guardada.driveFolderLink,
    };
  }

  // ------------------------------------------------------------------- ayudas

  /** Avisa dentro del sistema y, si se pide, también por correo. Nunca interrumpe la acción principal. */
  async avisar(
    userIds: number[],
    companyId: number,
    aviso: { titulo: string; mensaje: string; link: string; correo: boolean },
  ) {
    const ids = [...new Set(userIds)];
    if (ids.length === 0) return;
    for (const userId of ids) {
      try {
        await this.notifications.create({
          userId,
          companyId,
          title: aviso.titulo,
          message: aviso.mensaje,
          link: aviso.link,
        });
      } catch (err) {
        this.logger.warn(
          `No se pudo crear la notificación para el usuario ${userId}: ${(err as Error).message}`,
        );
      }
    }
    if (aviso.correo)
      await this.enviarCorreos(
        ids,
        companyId,
        aviso.titulo,
        aviso.mensaje,
        aviso.link,
      );
  }

  private async enviarCorreos(
    userIds: number[],
    companyId: number,
    asunto: string,
    mensaje: string,
    link: string,
  ) {
    try {
      const usuarios = await this.prisma.user.findMany({
        where: { id: { in: userIds }, companyId, isActive: true },
        select: { email: true, fullName: true },
      });
      const base = (process.env.FRONTEND_URL || '').replace(/\/$/, '');
      for (const u of usuarios) {
        try {
          await this.mail.sendMail({
            to: u.email,
            subject: `${asunto} — Contratación Pública`,
            bodyText: `Hola ${u.fullName},\n\n${mensaje}\n\nPuedes verlo aquí: ${base}${link}\n\nEste es un aviso automático del sistema de Gemeseg.`,
            from: CORREO_REMITENTE_CP,
            fromName: NOMBRE_REMITENTE_CP,
          });
        } catch (err) {
          this.logger.warn(
            `No se pudo enviar el correo a ${u.email}: ${(err as Error).message}`,
          );
        }
      }
    } catch (err) {
      this.logger.warn(
        `No se pudieron enviar los correos: ${(err as Error).message}`,
      );
    }
  }

  /** Personal de CP con permiso de escribir; si no se puede consultar, no se avisa a nadie más (no se interrumpe la entrega). */
  private async equipoQueRevisa(companyId: number): Promise<number[]> {
    try {
      return await this.permissions.getCompanyUserIdsWithWriteAccess(
        companyId,
        'CONTRATACION_PUBLICA',
      );
    } catch (err) {
      this.logger.warn(
        `No se pudo consultar al equipo de Contratación Pública: ${(err as Error).message}`,
      );
      return [];
    }
  }

  private link(entidadId: number, solicitudId: number): string {
    return `/contratacion-publica/entidades/${entidadId}?solicitud=${solicitudId}`;
  }

  /** Ver el historial o el archivo: personal de CP, o quien es responsable de ese documento. */
  private assertPuedeVer(
    e: Awaited<ReturnType<EntregasService['cargarEntrega']>>,
    actor: Actor,
  ) {
    const esResponsable = e.responsables.some((r) => r.userId === actor.userId);
    if (!esResponsable && !actor.puedeEscribir) {
      throw new ForbiddenException('Este documento no te fue asignado.');
    }
  }

  private assertPuedeEntregar(
    e: Awaited<ReturnType<EntregasService['cargarEntrega']>>,
    actor: Actor,
  ) {
    const esResponsable = e.responsables.some((r) => r.userId === actor.userId);
    if (!esResponsable && !actor.puedeEscribir) {
      throw new ForbiddenException('Este documento no te fue asignado.');
    }
    if (e.solicitud.estado !== 'ENVIADA') {
      throw new BadRequestException('Esta solicitud todavía no fue enviada.');
    }
    if (e.estado === 'APROBADO') {
      throw new BadRequestException('Este documento ya fue aprobado.');
    }
  }

  private async marcarRevision(
    id: number,
    actor: Actor,
    data: { estado: 'APROBADO' | 'RECHAZADO'; motivoRechazo: string | null },
  ): Promise<string | null> {
    const persona = await this.prisma.user.findUnique({
      where: { id: actor.userId },
      select: { fullName: true },
    });
    await this.prisma.$transaction([
      this.prisma.cPEntregaDocumento.update({
        where: { id },
        data: {
          ...data,
          revisadoPorId: actor.userId,
          revisadoPorNombre: persona?.fullName ?? null,
          revisadoAt: new Date(),
          // Tras un rechazo vuelve a recordarse desde cero.
          ...(data.estado === 'RECHAZADO' ? { ultimoRecordatorioAt: null } : {}),
        },
      }),
      this.prisma.cPEntregaHistorial.create({
        data: {
          entregaId: id,
          accion: data.estado,
          motivo: data.motivoRechazo,
          usuarioId: actor.userId,
          usuarioNombre: persona?.fullName ?? null,
        },
      }),
    ]);
    return persona?.fullName ?? null;
  }

  private async getEntidad(entidadId: number, companyId: number) {
    const entidad = await this.prisma.cPEntidadPublica.findFirst({
      where: { id: entidadId, companyId },
    });
    if (!entidad) throw new NotFoundException('Entidad pública no encontrada');
    return entidad;
  }

  private async cargarSolicitud(id: number, companyId: number) {
    const s = await this.prisma.cPSolicitudMensual.findFirst({
      where: { id, companyId },
      include: {
        entidad: { select: { id: true, nombre: true } },
        entregas: {
          orderBy: [{ orden: 'asc' }, { id: 'asc' }],
          include: {
            department: { select: { id: true, name: true } },
            responsables: {
              include: { user: { select: { id: true, fullName: true } } },
            },
          },
        },
      },
    });
    if (!s) throw new NotFoundException('Solicitud no encontrada');
    return s;
  }

  private async cargarEntrega(id: number, companyId: number) {
    const e = await this.prisma.cPEntregaDocumento.findFirst({
      where: { id, solicitud: { companyId } },
      include: {
        solicitud: {
          include: { entidad: { select: { id: true, nombre: true } } },
        },
        responsables: true,
      },
    });
    if (!e) throw new NotFoundException('Documento no encontrado');
    return e;
  }

  private async buscarSolicitudAnterior(
    entidadId: number,
    anio: number,
    mes: number,
  ) {
    return this.prisma.cPSolicitudMensual.findFirst({
      where: {
        entidadId,
        OR: [{ anio: { lt: anio } }, { anio, mes: { lt: mes } }],
      },
      orderBy: [{ anio: 'desc' }, { mes: 'desc' }],
      include: {
        entregas: {
          orderBy: [{ orden: 'asc' }, { id: 'asc' }],
          include: {
            responsables: {
              include: {
                user: { select: { isActive: true, companyId: true } },
              },
            },
          },
        },
      },
    });
  }

  private async validarResponsables(
    ids: number[],
    companyId: number,
  ): Promise<number[]> {
    const unicos = [...new Set(ids)];
    if (unicos.length === 0) return [];
    const validos = await this.prisma.user.findMany({
      where: { id: { in: unicos }, companyId, isActive: true },
      select: { id: true },
    });
    if (validos.length !== unicos.length) {
      throw new BadRequestException(
        'Alguna de las personas elegidas ya no está disponible. Revisa la lista.',
      );
    }
    return unicos;
  }

  private async validarDepartamento(id: number) {
    const dep = await this.prisma.department.findUnique({ where: { id } });
    if (!dep) throw new BadRequestException('El área elegida ya no existe.');
  }

  private async asegurarSubcarpeta(
    parentId: string,
    nombre: string,
  ): Promise<string> {
    const existente = await this.driveService.findChildFolderByName(
      parentId,
      nombre,
    );
    return existente?.id ?? this.driveService.createSubfolder(parentId, nombre);
  }
}
