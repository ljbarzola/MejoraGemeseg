import { BadRequestException, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { TicketSoporteEstado, TicketSoporteTipo } from '@prisma/client';
import { NotificationsService } from '../notifications/notifications.service';
import { ALL_SECTIONS, PermissionsService } from '../permissions/permissions.service';
import { NOVEDAD_APP_DDL } from './novedad-app.schema';

const TIPO_TICKET_LABEL: Record<string, string> = {
  ERROR: 'Error',
  MEJORA: 'Mejora',
  PERMISO: 'Permiso',
  OTRO: 'Otro',
};

@Injectable()
export class SistemasService implements OnModuleInit {
  private readonly logger = new Logger(SistemasService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
    private readonly permissionsService: PermissionsService,
  ) {}

  // El despliegue no corre migraciones: se asegura aquí la tabla de novedades
  // (ver novedad-app.schema.ts). Si falla, el servicio arranca igual — solo
  // se pierden las novedades, no los tickets.
  async onModuleInit() {
    try {
      for (const sql of NOVEDAD_APP_DDL) {
        await this.prisma.$executeRawUnsafe(sql);
      }
    } catch (err) {
      this.logger.warn(
        `No se pudo asegurar la tabla NovedadApp: ${(err as Error).message}`,
      );
    }
  }

  // Avisa a quien reportó, SOLO dentro de la app (campana de notificaciones):
  // nunca por correo. Un fallo acá nunca debe deshacer ni bloquear el cambio
  // que ya se guardó.
  private async notificarReportante(
    ticket: { id: number; companyId: number | null; createdById: number },
    title: string,
    message: string,
  ) {
    try {
      // La notificación exige empresa. Un ticket de super admin no la tiene:
      // se usa la del usuario y, si tampoco, no hay a quién colgársela.
      let companyId = ticket.companyId;
      if (companyId === null) {
        const user = await this.prisma.user.findUnique({
          where: { id: ticket.createdById },
          select: { companyId: true },
        });
        companyId = user?.companyId ?? null;
      }
      if (companyId === null) return;

      await this.notificationsService.create({
        userId: ticket.createdById,
        companyId,
        title,
        message,
        // /sistemas/soporte es solo para Sistemas; el reportante puede no
        // tener esa sección, así que se lo lleva al inicio.
        link: '/dashboard',
      });
    } catch (err: any) {
      this.logger.error(
        `No se pudo crear la notificación del ticket #${ticket.id}: ${err.message}`,
        err.stack,
      );
    }
  }

  // Avisa al equipo de Sistemas (quien tiene SISTEMAS con "Escribir" marcado
  // explícitamente en Permisos usuarios, de cualquier empresa) de que alguien
  // reportó algo. Solo campana, nunca correo. No se avisa a quien reporta (ya recibe el suyo). Un
  // fallo acá nunca debe deshacer ni bloquear el ticket ya guardado.
  private async notificarEquipoSistemas(ticket: {
    id: number;
    tipo: TicketSoporteTipo;
    titulo: string;
    createdById: number;
    createdBy: { fullName: string };
  }) {
    try {
      const equipo = await this.permissionsService.getUsersWithExplicitSectionWrite(
        'SISTEMAS',
        ticket.createdById,
      );
      const tipo = TIPO_TICKET_LABEL[ticket.tipo] ?? 'Reporte';
      let avisados = 0;
      for (const persona of equipo) {
        try {
          await this.notificationsService.create({
            userId: persona.id,
            companyId: persona.companyId,
            title: 'Nuevo reporte para Sistemas',
            message: `${ticket.createdBy.fullName} reportó (${tipo}): "${ticket.titulo}"`,
            // Quien recibe esto tiene Sistemas, así que sí puede abrir Soporte.
            link: '/sistemas/soporte',
          });
          avisados++;
        } catch (err: any) {
          this.logger.error(
            `No se pudo avisar al usuario ${persona.id} del ticket #${ticket.id}: ${err.message}`,
          );
        }
      }
      this.logger.log(
        `Ticket #${ticket.id}: avisados ${avisados} de ${equipo.length} del equipo de Sistemas`,
      );
    } catch (err: any) {
      this.logger.error(
        `No se pudo avisar al equipo de Sistemas del ticket #${ticket.id}: ${err.message}`,
        err.stack,
      );
    }
  }

  async createTicket(
    companyId: number | null,
    createdById: number,
    data: {
      tipo: TicketSoporteTipo;
      titulo: string;
      descripcion: string;
      capturaUrl?: string;
      attachments?: { url: string; nombre?: string }[];
    },
  ) {
    const ticket = await this.prisma.ticketSoporte.create({
      data: {
        companyId,
        createdById,
        tipo: data.tipo,
        titulo: data.titulo.trim(),
        descripcion: data.descripcion.trim(),
        capturaUrl: data.capturaUrl?.trim() || null,
        attachments: data.attachments?.length
          ? { create: data.attachments.map((a) => ({ url: a.url, nombre: a.nombre || null })) }
          : undefined,
      },
      include: {
        createdBy: { select: { id: true, fullName: true, email: true } },
        company: { select: { id: true, name: true } },
        attachments: true,
      },
    });
    this.logger.log(`Ticket #${ticket.id} creado por usuario ${createdById}`);
    await this.notificarReportante(
      ticket,
      'Recibimos tu reporte',
      `Tu reporte "${ticket.titulo}" llegó a Sistemas. Te avisaremos cuando esté en revisión y cuando quede resuelto.`,
    );
    await this.notificarEquipoSistemas(ticket);
    return ticket;
  }

  async findAll() {
    return this.prisma.ticketSoporte.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        createdBy: { select: { id: true, fullName: true, email: true } },
        company: { select: { id: true, name: true } },
        attachments: true,
      },
    });
  }

  async updateEstado(id: number, estado: TicketSoporteEstado) {
    const ticket = await this.prisma.ticketSoporte.findUnique({ where: { id } });
    if (!ticket) {
      throw new Error(`Ticket #${id} no encontrado`);
    }
    const updated = await this.prisma.ticketSoporte.update({
      where: { id },
      data: {
        estado,
        resueltoAt: estado === 'RESUELTO' ? new Date() : null,
      },
    });

    // Solo si el estado realmente cambió, y solo para los dos que le importan
    // a quien reportó (volver a "Abierto" no se avisa).
    if (estado !== ticket.estado) {
      if (estado === 'EN_REVISION') {
        await this.notificarReportante(
          ticket,
          'Tu reporte está en revisión',
          `Sistemas ya está revisando tu reporte "${ticket.titulo}".`,
        );
      } else if (estado === 'RESUELTO') {
        await this.notificarReportante(
          ticket,
          'Tu reporte fue resuelto',
          `Tu reporte "${ticket.titulo}" ya fue resuelto. Si el problema sigue, envía un reporte nuevo.`,
        );
      }
    }
    return updated;
  }

  async getStats(companyId: number) {
    const [abiertos, enRevision, resueltos, totalMes, porTipoRows, resueltosRows] =
      await Promise.all([
        this.prisma.ticketSoporte.count({ where: { companyId, estado: 'ABIERTO' } }),
        this.prisma.ticketSoporte.count({ where: { companyId, estado: 'EN_REVISION' } }),
        this.prisma.ticketSoporte.count({ where: { companyId, estado: 'RESUELTO' } }),
        this.prisma.ticketSoporte.count({
          where: {
            companyId,
            createdAt: { gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1) },
          },
        }),
        this.prisma.ticketSoporte.groupBy({
          by: ['tipo'],
          where: { companyId },
          _count: { _all: true },
        }),
        // Solo estado RESUELTO: un ticket reabierto pierde resueltoAt y vuelve
        // a entrar al promedio cuando se resuelva de nuevo.
        this.prisma.ticketSoporte.findMany({
          where: { companyId, estado: 'RESUELTO', resueltoAt: { not: null } },
          select: { createdAt: true, resueltoAt: true },
        }),
      ]);

    const porTipo: Record<TicketSoporteTipo, number> = { ERROR: 0, MEJORA: 0, PERMISO: 0, OTRO: 0 };
    for (const r of porTipoRows) porTipo[r.tipo] = r._count._all;

    const horas = (t: { createdAt: Date; resueltoAt: Date | null }) =>
      Math.max(0, (t.resueltoAt!.getTime() - t.createdAt.getTime()) / 3_600_000);
    const promedio = (xs: number[]) =>
      xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : null;

    return {
      abiertos,
      enRevision,
      resueltos,
      totalMes,
      porTipo,
      tiempoPromedioResolucionHoras: promedio(resueltosRows.map(horas)),
      ticketsConResolucion: resueltosRows.length,
    };
  }

  // ==================== NOVEDADES DE LA APP ====================

  /** Secciones que se pueden marcar como afectadas por una novedad. */
  getSeccionesNovedad() {
    return ALL_SECTIONS.map((s) => ({ key: s.key, label: s.label }));
  }

  /** Quiénes recibirían una novedad y quiénes no (con el motivo). */
  async contarDestinatarios(secciones: string[], publicadorId: number) {
    const { destinatarios, excluidos } =
      await this.permissionsService.evaluarAccesoSecciones(secciones, publicadorId);
    const porEmpresaYNombre = <T extends { empresa: string | null; nombre: string }>(a: T, b: T) =>
      (a.empresa || '').localeCompare(b.empresa || '', 'es') ||
      a.nombre.localeCompare(b.nombre, 'es');
    const personas = destinatarios
      .map((u) => ({ id: u.id, nombre: u.fullName, email: u.email, empresa: u.companyName }))
      .sort(porEmpresaYNombre);
    const noRecibiran = excluidos
      .map((u) => ({ id: u.id, nombre: u.fullName, email: u.email, empresa: u.companyName, motivo: u.motivo }))
      .sort(porEmpresaYNombre);
    return { destinatarios: personas.length, personas, noRecibiran };
  }

  async listarNovedades() {
    return this.prisma.novedadApp.findMany({ orderBy: { createdAt: 'desc' }, take: 200 });
  }

  // Igual que los avisos de tickets: SOLO campana, nunca correo, y un fallo
  // al avisar a una persona no cancela la publicación ni a las demás.
  async publicarNovedad(
    publicadorId: number,
    data: { titulo: string; descripcion: string; secciones: string[] },
  ) {
    const validas = [...new Set(data.secciones)].filter((s) =>
      ALL_SECTIONS.some((a) => a.key === s),
    );
    if (validas.length === 0) {
      throw new BadRequestException('Elige al menos un módulo afectado.');
    }

    const publicador = await this.prisma.user.findUnique({
      where: { id: publicadorId },
      select: { fullName: true },
    });
    const titulo = data.titulo.trim();
    const descripcion = data.descripcion.trim();
    const destinatarios = await this.permissionsService.getUsersWithSectionAccess(
      validas,
      publicadorId,
    );

    const novedad = await this.prisma.novedadApp.create({
      data: {
        titulo,
        descripcion,
        secciones: validas,
        createdById: publicadorId,
        createdByNombre: publicador?.fullName || 'Sistemas',
        destinatarios: destinatarios.length,
      },
    });

    let fallidos = 0;
    for (const d of destinatarios) {
      try {
        await this.notificationsService.create({
          userId: d.id,
          companyId: d.companyId,
          title: `Novedad: ${titulo}`,
          message: descripcion,
          link: '/dashboard',
        });
      } catch (err: any) {
        fallidos++;
        this.logger.error(
          `No se pudo notificar la novedad #${novedad.id} al usuario ${d.id}: ${err.message}`,
        );
      }
    }
    this.logger.log(
      `Novedad #${novedad.id} publicada: ${destinatarios.length - fallidos}/${destinatarios.length} avisos`,
    );
    return novedad;
  }
}
