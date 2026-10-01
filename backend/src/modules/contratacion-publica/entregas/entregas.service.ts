import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import * as path from 'path';
import { PrismaService } from '../../../prisma/prisma.service';
import { DriveService } from '../../personal/services/drive.service';
import { NotificationsService } from '../../notifications/notifications.service';
import { GmailMailService } from '../../mail/gmail-mail.service';
import {
  CreateEntregaDto,
  CreateSolicitudDto,
  EntregarDto,
  RechazarEntregaDto,
  UpdateEntregaDto,
} from './dto/entregas.dto';
import {
  estaVencida,
  fechaDesdeTexto,
  formatoFecha,
  hoyEcuador,
  nombreMes,
  trasladarFechaAMes,
} from './entregas.util';

/** Tipo de carpeta de Drive (FolderConfig.type) donde se guardan las entregas. */
export const DRIVE_FOLDER_TYPE_ENTREGAS = 'CP_ENTREGAS';

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
    private readonly notifications: NotificationsService,
    private readonly mail: GmailMailService,
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
      entidad: { id: entidad.id, nombre: entidad.nombre },
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

    const raiz = await this.driveService.getConfig(
      actor.companyId,
      DRIVE_FOLDER_TYPE_ENTREGAS,
    );
    if (!raiz?.driveFolderId) {
      throw new BadRequestException(
        'Aún no se configuró la carpeta de Google Drive para las entregas. Pídele a Contratación Pública que la configure, o pega un enlace.',
      );
    }

    try {
      const entidadFolder = await this.asegurarSubcarpeta(
        raiz.driveFolderId,
        this.nombreCarpeta(e.solicitud.entidad.nombre),
      );
      const mesFolder = await this.asegurarSubcarpeta(
        entidadFolder,
        `${e.solicitud.anio}-${String(e.solicitud.mes).padStart(2, '0')}`,
      );
      const nombreArchivo = `${this.nombreCarpeta(e.nombre)} - ${file.originalname}`;
      const { url } = await this.driveService.uploadFile(
        mesFolder,
        file.buffer,
        nombreArchivo,
        file.mimetype,
      );
      return { url };
    } catch (err) {
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

    const persona = await this.prisma.user.findUnique({
      where: { id: actor.userId },
      select: { fullName: true },
    });
    await this.prisma.cPEntregaDocumento.update({
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
    });
    const s = e.solicitud;
    await this.avisar([s.createdBy], actor.companyId, {
      titulo: 'Documento entregado',
      mensaje: `${persona?.fullName ?? 'Alguien'} entregó "${e.nombre}" para ${s.entidad.nombre} (${nombreMes(s.mes)} de ${s.anio}). Falta revisarlo.`,
      link: this.link(s.entidadId, s.id),
      correo: false,
    });
    return this.obtenerSolicitud(s.id, actor);
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
      const config = await this.prisma.notificationConfig.findUnique({
        where: { companyId },
      });
      if (!config?.senderEmail) {
        this.logger.warn(
          'No hay correo de envío configurado: se avisó solo dentro del sistema.',
        );
        return;
      }
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
            from: config.senderEmail,
            fromName: config.senderName,
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

  private link(entidadId: number, solicitudId: number): string {
    return `/contratacion-publica/entidades/${entidadId}?solicitud=${solicitudId}`;
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
    await this.prisma.cPEntregaDocumento.update({
      where: { id },
      data: {
        ...data,
        revisadoPorId: actor.userId,
        revisadoPorNombre: persona?.fullName ?? null,
        revisadoAt: new Date(),
        // Tras un rechazo vuelve a recordarse desde cero.
        ...(data.estado === 'RECHAZADO' ? { ultimoRecordatorioAt: null } : {}),
      },
    });
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

  /** Nombre apto para una carpeta o archivo de Drive. */
  private nombreCarpeta(texto: string): string {
    return (
      texto
        .replace(/[\\/:*?"<>|]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 120) || 'Sin nombre'
    );
  }
}
