import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { GmailMailService } from '../mail/gmail-mail.service';
import { VentasMotivosService } from './ventas-motivos.service';
import { hoyEcuador, parseDiaContrato } from './agreement-status.util';
import { resultadoDeEtapa } from './stage-outcome.util';
import { VentasConversionesService } from './ventas-conversiones.service';
import { parseSiguientePaso } from './siguiente-paso.util';
import {
  ETIQUETA_SUBSERVICIO,
  ensureDefaultServices,
} from './ventas-servicios.util';
import {
  ChangeOpportunityStageDto,
  CreateOpportunityDto,
  UpdateOpportunityDto,
} from './dto/opportunity.dto';

// Oportunidad = una negociación de un servicio de un cliente, con su propio
// embudo, monto cotizado y motivo de pérdida. La etapa del CLIENTE
// (`SalesClient.status`) queda como espejo de la oportunidad principal para los
// lectores que todavía miran al cliente (dashboard, "Mis referidos"); este
// servicio es el único que escribe ese espejo. El seguimiento (siguiente paso) se
// queda en el cliente.

const MAX_TITULO = 150;
const MAX_NOTAS = 2000;

const incluir = {
  salesClient: { select: { id: true, name: true, email: true, phone: true } },
  services: { include: { service: { select: { id: true, name: true } } } },
} satisfies Prisma.SalesOpportunityInclude;

type OportunidadConRelaciones = Prisma.SalesOpportunityGetPayload<{
  include: typeof incluir;
}>;

export interface EtapaInfo {
  key: string;
  label: string;
  color: string;
  isFinal: boolean;
  order: number;
}

// La oportunidad "principal" de un cliente: la abierta con movimiento más
// reciente; si no hay abiertas, la última que se cerró. Es la que se refleja en
// la etapa del cliente.
export function elegirPrincipal<
  T extends { id: number; closedAt: Date | null; updatedAt: Date },
>(opps: T[]): T | null {
  const abiertas = opps.filter((o) => o.closedAt === null);
  const lista = abiertas.length > 0 ? abiertas : opps;
  if (lista.length === 0) return null;
  return [...lista].sort((a, b) => {
    const clave = (o: T) => (o.closedAt ?? o.updatedAt).getTime();
    return clave(b) - clave(a) || b.id - a.id;
  })[0];
}

export interface NuevaOportunidadInicial {
  companyId: number;
  salesClientId: number;
  status: string | null;
  createdBy: number;
  assignedUserId?: number | null;
  source?: string | null;
  referredByUserId?: number | null;
  leadId?: number | null;
  // HISTORICO: cliente que ya contrataba antes de usar el sistema (se registra ya Aceptada).
  originType:
    | 'LEAD'
    | 'MANUAL'
    | 'REFERIDO'
    | 'CLIENTE_EXISTENTE'
    | 'MIGRADA'
    | 'HISTORICO';
  receivedAt?: Date;
  serviceIds?: number[];
  title?: string | null;
  notes?: string | null;
  quotedAmount?: number | null;
  quotedAt?: Date | null;
  // Solo para una oportunidad que nace ya cerrada (originType HISTORICO).
  outcome?: 'GANADA' | 'PERDIDA' | null;
  closedAt?: Date | null;
}

@Injectable()
export class VentasOportunidadesService {
  private readonly logger = new Logger(VentasOportunidadesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
    private readonly gmailMailService: GmailMailService,
    private readonly motivos: VentasMotivosService,
    private readonly conversiones: VentasConversionesService,
  ) {}

  private requireCompany(companyId: number | null): number {
    if (!companyId) throw new BadRequestException('Se requiere una empresa');
    return companyId;
  }

  // ---------------------------------------------------------------------
  // Apoyo (lo usan clientes, leads y esta misma clase)
  // ---------------------------------------------------------------------

  async etapasDeEmpresa(companyId: number): Promise<Map<string, EtapaInfo>> {
    const etapas = await this.prisma.salesClientStage.findMany({
      where: { companyId },
      orderBy: { order: 'asc' },
    });
    return new Map(
      etapas.map((e) => [
        e.key,
        {
          key: e.key,
          label: e.label,
          color: e.color,
          isFinal: e.isFinal,
          order: e.order,
        },
      ]),
    );
  }

  // Claves de sub-servicio guardadas en el cliente (`servicio_requerido__sub`,
  // separadas por coma) -> ids del catálogo de servicios de la empresa.
  async idsServiciosDesdeExtra(
    companyId: number,
    extra: unknown,
  ): Promise<number[]> {
    const e = (extra ?? {}) as Record<string, string>;
    const claves = (e['servicio_requerido__sub'] || '')
      .split(',')
      .map((k) => k.trim())
      .filter(Boolean);
    if (claves.length === 0) return [];
    await ensureDefaultServices(this.prisma, companyId);
    const servicios = await this.prisma.salesService.findMany({
      where: { companyId },
      select: { id: true, name: true },
    });
    const idPorNombre = new Map(servicios.map((s) => [s.name, s.id]));
    return claves
      .map((k) => idPorNombre.get(ETIQUETA_SUBSERVICIO[k] ?? ''))
      .filter((id): id is number => typeof id === 'number');
  }

  // Crea la primera oportunidad de un cliente (o la de un lead convertido).
  async crearInicial(
    tx: Prisma.TransactionClient,
    p: NuevaOportunidadInicial,
  ) {
    const ids = [...new Set(p.serviceIds ?? [])];
    return tx.salesOpportunity.create({
      data: {
        companyId: p.companyId,
        salesClientId: p.salesClientId,
        title: p.title ?? null,
        status: p.status,
        receivedAt: p.receivedAt ?? new Date(),
        assignedUserId: p.assignedUserId ?? null,
        source: p.source ?? null,
        referredByUserId: p.referredByUserId ?? null,
        leadId: p.leadId ?? null,
        originType: p.originType,
        notes: p.notes ?? null,
        quotedAmount: p.quotedAmount ?? null,
        quotedAt: p.quotedAt ?? null,
        outcome: p.outcome ?? null,
        closedAt: p.closedAt ?? null,
        createdBy: p.createdBy,
        services: { create: ids.map((serviceId) => ({ serviceId })) },
      },
    });
  }

  // Refleja en el cliente la etapa de su oportunidad principal. Si esa
  // oportunidad está cerrada ya no hay nada que seguir, así que también se borra
  // el siguiente paso (misma regla que antes tenían las etapas finales).
  async espejarCliente(
    tx: Prisma.TransactionClient,
    salesClientId: number,
    extra: Prisma.SalesClientUncheckedUpdateInput = {},
  ) {
    const opps = await tx.salesOpportunity.findMany({
      where: { salesClientId },
      select: { id: true, status: true, closedAt: true, updatedAt: true },
    });
    const principal = elegirPrincipal(opps);
    if (!principal) return null;
    const data: Prisma.SalesClientUncheckedUpdateInput = {
      status: principal.status,
      ...extra,
    };
    if (principal.closedAt) {
      data.nextActionText = null;
      data.nextActionDate = null;
    }
    await tx.salesClient.update({ where: { id: salesClientId }, data });
    return principal;
  }

  private validarMonto(v: number | null | undefined): number | null | undefined {
    if (v === undefined || v === null) return v;
    if (!Number.isFinite(v) || v < 0) {
      throw new BadRequestException('El monto no es válido.');
    }
    return v;
  }

  private parseDia(raw: string | null | undefined, nombre: string): Date | null | undefined {
    if (raw === undefined) return undefined;
    if (raw === null || !raw.trim()) return null;
    const d = parseDiaContrato(raw);
    if (!d) throw new BadRequestException(`${nombre} no es una fecha válida.`);
    return d;
  }

  private async validarServicios(companyId: number, ids: number[] | undefined) {
    const lista = [...new Set(ids ?? [])];
    if (lista.length === 0) return lista;
    const encontrados = await this.prisma.salesService.count({
      where: { id: { in: lista }, companyId },
    });
    if (encontrados !== lista.length) {
      throw new BadRequestException('Alguno de los servicios no existe.');
    }
    return lista;
  }

  private texto(raw: string | undefined, max: number, nombre: string) {
    const t = (raw ?? '').trim();
    if (t.length > max) {
      throw new BadRequestException(`${nombre} no puede pasar de ${max} caracteres.`);
    }
    return t || null;
  }

  private formatear(o: OportunidadConRelaciones, etapas: Map<string, EtapaInfo>) {
    const { services, quotedAmount, ...resto } = o;
    return {
      ...resto,
      quotedAmount: quotedAmount === null ? null : Number(quotedAmount),
      services: services.map((s) => s.service),
      stage: o.status ? (etapas.get(o.status) ?? null) : null,
      abierta: o.closedAt === null,
    };
  }

  // ---------------------------------------------------------------------
  // Consultas
  // ---------------------------------------------------------------------

  async list(
    companyId: number | null,
    f: {
      etapa?: string;
      responsableId?: number;
      clienteId?: number;
      servicioId?: number;
      estado?: string; // abiertas | ganadas | perdidas | cerradas
      q?: string;
    } = {},
  ) {
    const cid = this.requireCompany(companyId);
    const where: Prisma.SalesOpportunityWhereInput = { companyId: cid };
    if (f.etapa) where.status = f.etapa;
    if (f.responsableId) where.assignedUserId = f.responsableId;
    if (f.clienteId) where.salesClientId = f.clienteId;
    if (f.servicioId) where.services = { some: { serviceId: f.servicioId } };
    if (f.estado === 'abiertas') where.closedAt = null;
    else if (f.estado === 'cerradas') where.closedAt = { not: null };
    else if (f.estado === 'ganadas') where.outcome = 'GANADA';
    else if (f.estado === 'perdidas') where.outcome = 'PERDIDA';
    const q = (f.q ?? '').trim();
    if (q) {
      where.OR = [
        { title: { contains: q, mode: 'insensitive' } },
        { salesClient: { name: { contains: q, mode: 'insensitive' } } },
        { services: { some: { service: { name: { contains: q, mode: 'insensitive' } } } } },
      ];
    }
    const [filas, etapas, usuarios] = await Promise.all([
      this.prisma.salesOpportunity.findMany({
        where,
        include: incluir,
        orderBy: [{ receivedAt: 'desc' }, { id: 'desc' }],
      }),
      this.etapasDeEmpresa(cid),
      this.prisma.user.findMany({
        where: { companyId: cid },
        select: { id: true, fullName: true },
      }),
    ]);
    const nombre = new Map(usuarios.map((u) => [u.id, u.fullName]));
    return filas.map((o) => ({
      ...this.formatear(o, etapas),
      assignedUserName: o.assignedUserId ? (nombre.get(o.assignedUserId) ?? null) : null,
    }));
  }

  async get(companyId: number | null, id: number) {
    const cid = this.requireCompany(companyId);
    const o = await this.prisma.salesOpportunity.findFirst({
      where: { id, companyId: cid },
      include: {
        ...incluir,
        stageChanges: { orderBy: { createdAt: 'desc' } },
      },
    });
    if (!o) throw new NotFoundException('Oportunidad no encontrada');
    const etapas = await this.etapasDeEmpresa(cid);
    const entradas = await this.prisma.salesReasonEntry.findMany({
      where: { companyId: cid, opportunityId: id },
      orderBy: { createdAt: 'desc' },
    });
    const { stageChanges, ...base } = o;
    return {
      ...this.formatear(base as OportunidadConRelaciones, etapas),
      stageChanges,
      motivos: entradas,
    };
  }

  // ---------------------------------------------------------------------
  // Escrituras
  // ---------------------------------------------------------------------

  async create(companyId: number | null, userId: number, dto: CreateOpportunityDto) {
    const cid = this.requireCompany(companyId);
    const cliente = await this.prisma.salesClient.findFirst({
      where: { id: dto.salesClientId, companyId: cid },
      select: { id: true, assignedUserId: true, extra: true },
    });
    if (!cliente) throw new NotFoundException('Cuenta no encontrada');
    const inicial = await this.prisma.salesClientStage.findFirst({
      where: { companyId: cid, isInitial: true },
    });
    const serviceIds = await this.validarServicios(cid, dto.serviceIds);
    const quotedAmount = this.validarMonto(dto.quotedAmount);
    const quotedAt = this.parseDia(dto.quotedAt, 'La fecha de cotización');
    const existentes = await this.prisma.salesOpportunity.count({
      where: { salesClientId: cliente.id },
    });
    const fuente = ((cliente.extra ?? {}) as Record<string, string>)['fuente'] ?? null;

    const creada = await this.prisma.$transaction(async (tx) => {
      const o = await this.crearInicial(tx, {
        companyId: cid,
        salesClientId: cliente.id,
        status: inicial?.key ?? null,
        createdBy: userId,
        assignedUserId: dto.assignedUserId === undefined ? (cliente.assignedUserId ?? userId) : dto.assignedUserId,
        source: fuente,
        originType: existentes > 0 ? 'CLIENTE_EXISTENTE' : 'MANUAL',
        serviceIds,
        title: this.texto(dto.title, MAX_TITULO, 'El título'),
        notes: this.texto(dto.notes, MAX_NOTAS, 'Las notas'),
        quotedAmount: quotedAmount ?? null,
        quotedAt: quotedAt ?? null,
      });
      await this.espejarCliente(tx, cliente.id);
      return o;
    });
    return this.get(cid, creada.id);
  }

  async update(companyId: number | null, id: number, dto: UpdateOpportunityDto) {
    const cid = this.requireCompany(companyId);
    const actual = await this.prisma.salesOpportunity.findFirst({
      where: { id, companyId: cid },
      select: { id: true },
    });
    if (!actual) throw new NotFoundException('Oportunidad no encontrada');
    const data: Prisma.SalesOpportunityUpdateInput = {};
    if (dto.title !== undefined) data.title = this.texto(dto.title, MAX_TITULO, 'El título');
    if (dto.notes !== undefined) data.notes = this.texto(dto.notes, MAX_NOTAS, 'Las notas');
    if (dto.quotedAmount !== undefined) data.quotedAmount = this.validarMonto(dto.quotedAmount);
    if (dto.quotedAt !== undefined) data.quotedAt = this.parseDia(dto.quotedAt, 'La fecha de cotización');
    if (dto.assignedUserId !== undefined) data.assignedUserId = dto.assignedUserId;
    const serviceIds =
      dto.serviceIds !== undefined ? await this.validarServicios(cid, dto.serviceIds) : null;
    await this.prisma.$transaction(async (tx) => {
      await tx.salesOpportunity.update({ where: { id }, data });
      if (serviceIds) {
        await tx.salesOpportunityService.deleteMany({ where: { opportunityId: id } });
        if (serviceIds.length > 0) {
          await tx.salesOpportunityService.createMany({
            data: serviceIds.map((serviceId) => ({ opportunityId: id, serviceId })),
          });
        }
      }
    });
    return this.get(cid, id);
  }

  async remove(companyId: number | null, id: number) {
    const cid = this.requireCompany(companyId);
    const o = await this.prisma.salesOpportunity.findFirst({
      where: { id, companyId: cid },
      select: { id: true, salesClientId: true },
    });
    if (!o) throw new NotFoundException('Oportunidad no encontrada');
    await this.prisma.$transaction(async (tx) => {
      await tx.salesReasonEntry.deleteMany({
        where: { companyId: cid, opportunityId: id },
      });
      await tx.salesOpportunity.delete({ where: { id } });
      await this.espejarCliente(tx, o.salesClientId);
    });
    return { success: true };
  }

  async cambiarEtapa(
    companyId: number | null,
    id: number,
    dto: ChangeOpportunityStageDto,
    userId: number,
  ) {
    const cid = this.requireCompany(companyId);
    const opp = await this.prisma.salesOpportunity.findFirst({
      where: { id, companyId: cid },
      include: { salesClient: { select: { id: true, name: true } } },
    });
    if (!opp) throw new NotFoundException('Oportunidad no encontrada');
    if (opp.status === dto.toStatus) {
      throw new BadRequestException('La oportunidad ya está en esa etapa');
    }
    const destino = await this.prisma.salesClientStage.findFirst({
      where: { companyId: cid, key: dto.toStatus },
    });
    if (!destino) {
      throw new BadRequestException(`La etapa "${dto.toStatus}" no existe en esta empresa`);
    }

    const { outcome, cerrada } = resultadoDeEtapa(destino.key, destino.isFinal);
    const quotedAmount = this.validarMonto(dto.quotedAmount);
    const quotedAtDto = this.parseDia(dto.quotedAt, 'La fecha de cotización');
    // En una etapa final ya no hay nada que seguir: se ignora el siguiente paso.
    const siguiente = cerrada ? {} : parseSiguientePaso(dto);

    const data: Prisma.SalesOpportunityUpdateInput = {
      status: destino.key,
      outcome,
      closedAt: cerrada ? new Date() : null,
    };
    if (quotedAmount !== undefined) data.quotedAmount = quotedAmount;
    if (quotedAtDto !== undefined) data.quotedAt = quotedAtDto;
    // Al pasar a Cotizado sin fecha, se toma hoy (día de Ecuador): de ahí sale
    // el "tiempo hasta cotizar" del dashboard y del agente.
    if (destino.key === 'COTIZADO' && !opp.quotedAt && quotedAtDto === undefined) {
      data.quotedAt = parseDiaContrato(hoyEcuador());
    }

    await this.prisma.$transaction(async (tx) => {
      if (outcome === 'PERDIDA') {
        await this.motivos.registrar(tx, cid, userId, 'OPP_PERDIDA', dto.motivo, {
          opportunityId: id,
          salesClientId: opp.salesClientId,
          detail: { desde: opp.status, hacia: destino.key },
        });
      }
      await tx.salesOpportunity.update({ where: { id }, data });
      await tx.salesOpportunityStageChange.create({
        data: {
          opportunityId: id,
          salesClientId: opp.salesClientId,
          companyId: cid,
          fromStatus: opp.status,
          toStatus: destino.key,
          notes: dto.notes?.trim() || null,
          changedBy: userId,
        },
      });
      const principal = await this.espejarCliente(tx, opp.salesClientId);
      // Si esta es la oportunidad que el cliente refleja, también se aplica el
      // siguiente paso y se deja el cambio en la línea de tiempo del cliente.
      if (principal && principal.id === id) {
        if (Object.keys(siguiente).length > 0) {
          await tx.salesClient.update({ where: { id: opp.salesClientId }, data: siguiente });
        }
        await tx.salesClientStageChange.create({
          data: {
            salesClientId: opp.salesClientId,
            fromStatus: opp.status,
            toStatus: destino.key,
            notes: dto.notes?.trim() || null,
            changedBy: userId,
            companyId: cid,
          },
        });
      }
    });

    if (opp.referredByUserId) {
      await this.notificarReferidor(
        opp.salesClientId,
        opp.salesClient.name,
        opp.referredByUserId,
        cid,
        destino.label,
      );
    }
    // Si el lead vino de un anuncio de Google, se deja registrado que cotizó o
    // contrató para avisárselo a Google. Nunca falla el cambio de etapa.
    const montoFinal = quotedAmount !== undefined ? quotedAmount : opp.quotedAmount;
    await this.conversiones.registrarPorEtapa({
      companyId: cid,
      opportunityId: id,
      leadId: opp.leadId,
      destinoKey: destino.key,
      outcome,
      quotedAmount: montoFinal === null || montoFinal === undefined ? null : Number(montoFinal),
    });
    return this.get(cid, id);
  }

  // Compatibilidad: la ruta vieja PATCH /ventas/clientes/:id/stage cambia la
  // etapa de la oportunidad principal del cliente (o le crea una si no tenía).
  async cambiarEtapaDeCliente(
    clientId: number,
    dto: ChangeOpportunityStageDto,
    companyId: number,
    userId: number,
  ) {
    const cliente = await this.prisma.salesClient.findFirst({
      where: { id: clientId, companyId },
      select: { id: true, status: true, createdBy: true, assignedUserId: true, referredByUserId: true, extra: true },
    });
    if (!cliente) throw new NotFoundException('Cuenta no encontrada');
    const opps = await this.prisma.salesOpportunity.findMany({
      where: { salesClientId: clientId },
      select: { id: true, closedAt: true, updatedAt: true },
    });
    let principal = elegirPrincipal(opps);
    if (!principal) {
      const creada = await this.prisma.$transaction((tx) =>
        this.crearInicial(tx, {
          companyId,
          salesClientId: clientId,
          status: cliente.status,
          createdBy: cliente.createdBy,
          assignedUserId: cliente.assignedUserId,
          referredByUserId: cliente.referredByUserId,
          originType: 'MIGRADA',
        }),
      );
      principal = { id: creada.id, closedAt: null, updatedAt: creada.updatedAt };
    }
    await this.cambiarEtapa(companyId, principal.id, dto, userId);
    return this.prisma.salesClient.findUnique({ where: { id: clientId } });
  }

  // Se ejecuta después de confirmado el cambio de etapa. Un fallo acá (correo
  // caído, config incompleta) nunca debe deshacer ni bloquear el cambio que ya
  // se guardó — solo se registra en el servidor. Ningún texto menciona dinero,
  // comisión ni porcentaje.
  async notificarReferidor(
    clientId: number,
    clientNombre: string,
    referredByUserId: number,
    companyId: number,
    etapaLabel: string,
  ) {
    const mensaje = `Tu referido "${clientNombre}" pasó a la etapa "${etapaLabel}".`;

    try {
      await this.notificationsService.create({
        userId: referredByUserId,
        companyId,
        title: 'Actualización de tu referido',
        message: mensaje,
        link: '/dashboard?abrirReferidos=1',
      });
    } catch (err: any) {
      this.logger.error(
        `No se pudo crear la notificación in-app del cliente #${clientId}: ${err.message}`,
        err.stack,
      );
    }

    try {
      const referrer = await this.prisma.user.findUnique({
        where: { id: referredByUserId },
        select: { email: true },
      });
      if (!referrer?.email) return;

      // Este aviso lo manda Sistemas, no el remitente que RRHH configuró para
      // sus propios recordatorios — mismo remitente fijo que la recuperación de
      // contraseña (ver AuthService.REMITENTE_CONTRASENA).
      await this.gmailMailService.sendMail({
        to: referrer.email,
        subject: 'Actualización de tu referido',
        bodyText: `${mensaje}\n\nPuedes ver el estado de tus referidos ingresando a la app, en "Mis Referidos".`,
        from: 'sistemas@gemeseg.com',
        fromName: 'Sistemas',
      });
    } catch (err: any) {
      this.logger.error(
        `No se pudo enviar el correo de notificación del cliente #${clientId}: ${err.message}`,
      );
    }
  }
}
