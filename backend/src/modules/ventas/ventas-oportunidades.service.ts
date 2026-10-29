import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { VentasMotivosService } from './ventas-motivos.service';
import { hoyEcuador, parseDiaContrato } from './agreement-status.util';
import { resultadoDeEtapa } from './stage-outcome.util';
import { validarCambioDeEtapa } from './etapas-sentido.util';
import { KINDS_MOTIVO_PERDIDA, MOTIVO_SIN_INFORMACION, ultimoMotivoPorOportunidad } from './motivo-perdida.util';
import { VentasConversionesService } from './ventas-conversiones.service';
import { VentasAcuerdosService } from './ventas-acuerdos.service';
import { parseSiguientePaso } from './siguiente-paso.util';
import { errorDeLlegada, llegadaParaCrear, llegadaParaEditar } from './fecha-llegada.util';
import {
  columnasDeUbicacion,
  limpiarUbicacion,
  ubicacionDeFila,
  type UbicacionOportunidad,
} from './ubicacion.util';
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
  salesClient: { select: { id: true, name: true, email: true, phone: true, extra: true } },
  services: { include: { service: { select: { id: true, name: true } } } },
} satisfies Prisma.SalesOpportunityInclude;

type OportunidadConRelaciones = Prisma.SalesOpportunityGetPayload<{
  include: typeof incluir;
}>;

// Opciones del campo «Servicio requerido» de la ficha (con sus hijos), para poner nombre al servicio guardado.
type OpcionServicioFicha = { key: string; label: string; children?: { key: string; label: string }[] };

// Texto de lo que la ficha del cliente guardó como servicio («Agentes de Seguridad, Seguridad VIP» o, si solo
// eligió la categoría, «Monitoreo»), o null si no hay nada. Es lo que se muestra en una oportunidad que no
// tiene servicios propios, para que el dato guardado en la ficha no se pierda de vista ahora que el
// Directorio ya no lo muestra.
export function servicioGuardadoEnFicha(
  extra: unknown,
  opciones: OpcionServicioFicha[],
): string | null {
  const e = (extra ?? {}) as Record<string, unknown>;
  const principal = typeof e['servicio_requerido'] === 'string' ? (e['servicio_requerido'] as string).trim() : '';
  const subClaves = (typeof e['servicio_requerido__sub'] === 'string' ? (e['servicio_requerido__sub'] as string) : '')
    .split(',')
    .map((k) => k.trim())
    .filter(Boolean);
  const opcion = opciones.find((o) => o.key === principal);
  const subs = subClaves.map(
    (k) => opcion?.children?.find((h) => h.key === k)?.label ?? ETIQUETA_SUBSERVICIO[k] ?? k,
  );
  if (subs.length > 0) return subs.join(', ');
  if (!principal) return null;
  return opcion?.label ?? principal;
}

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
    | 'HISTORICO'
    | 'RENOVACION';
  // Solo RENOVACION: contrato de servicio que esta oportunidad renueva (Fase 4).
  renewsAgreementId?: number | null;
  receivedAt?: Date;
  serviceIds?: number[];
  title?: string | null;
  notes?: string | null;
  quotedAmount?: number | null;
  quotedAt?: Date | null;
  // Ubicación opcional ya validada (limpiarUbicacion); null o sin enviar = sin ubicación.
  ubicacion?: UbicacionOportunidad | null;
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
    private readonly motivos: VentasMotivosService,
    private readonly conversiones: VentasConversionesService,
    private readonly acuerdos: VentasAcuerdosService,
  ) {}

  // Opciones del campo «Servicio requerido» de la empresa (para nombrar el servicio guardado en una ficha).
  private async opcionesServicioFicha(companyId: number): Promise<OpcionServicioFicha[]> {
    const campo = await this.prisma.salesClientField.findFirst({
      where: { companyId, key: 'servicio_requerido' },
      select: { options: true },
    });
    return Array.isArray(campo?.options) ? (campo.options as unknown as OpcionServicioFicha[]) : [];
  }

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
    // Solo los activos: un servicio desactivado no vuelve a asociarse a nada nuevo.
    const servicios = await this.prisma.salesService.findMany({
      where: { companyId, isActive: true },
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
        renewsAgreementId: p.renewsAgreementId ?? null,
        notes: p.notes ?? null,
        quotedAmount: p.quotedAmount ?? null,
        quotedAt: p.quotedAt ?? null,
        ...columnasDeUbicacion(p.ubicacion ?? null),
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

  // Fase 4: cierra las oportunidades de renovación ABIERTAS de un contrato cuando el contrato se
  // renueva a mano con «Renovar» (GANADA) o se cancela (PERDIDA), para que no queden oportunidades
  // sueltas. No pide motivo: el contrato cancelado ya tiene el suyo. Devuelve cuántas cerró.
  async cerrarRenovacionesAbiertas(
    companyId: number,
    agreementId: number,
    userId: number,
    outcome: 'GANADA' | 'PERDIDA',
    nota: string,
  ): Promise<number> {
    const abiertas = await this.prisma.salesOpportunity.findMany({
      where: { companyId, renewsAgreementId: agreementId, closedAt: null },
      select: { id: true, status: true, salesClientId: true },
    });
    if (abiertas.length === 0) return 0;
    const key = outcome === 'GANADA' ? 'ACEPTADO' : 'RECHAZADO';
    const etapa = await this.prisma.salesClientStage.findFirst({
      where: { companyId, key },
    });
    if (!etapa) return 0;
    for (const o of abiertas) {
      await this.prisma.$transaction(async (tx) => {
        await tx.salesOpportunity.update({
          where: { id: o.id },
          data: { status: key, outcome, closedAt: new Date() },
        });
        await tx.salesOpportunityStageChange.create({
          data: {
            opportunityId: o.id,
            salesClientId: o.salesClientId,
            companyId,
            fromStatus: o.status,
            toStatus: key,
            notes: nota,
            changedBy: userId,
          },
        });
        const principal = await this.espejarCliente(tx, o.salesClientId);
        if (principal && principal.id === o.id) {
          await tx.salesClientStageChange.create({
            data: {
              salesClientId: o.salesClientId,
              fromStatus: o.status,
              toStatus: key,
              notes: nota,
              changedBy: userId,
              companyId,
            },
          });
        }
      });
    }
    return abiertas.length;
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

  // Los servicios salen del catálogo de Ventas → Configuración → Servicios, y es la ÚNICA fuente: un servicio
  // desactivado no se puede asociar a nada nuevo (oportunidad, posible cliente que se convierte, referido,
  // contrato). Lo que ya lo tenía lo conserva: `yaAsignados` son los que la oportunidad ya traía.
  async validarServicios(companyId: number, ids: number[] | undefined, yaAsignados: number[] = []) {
    const lista = [...new Set(ids ?? [])];
    if (lista.length === 0) return lista;
    const encontrados = await this.prisma.salesService.findMany({
      where: { id: { in: lista }, companyId },
      select: { id: true, isActive: true },
    });
    if (encontrados.length !== lista.length) {
      throw new BadRequestException('Alguno de los servicios no existe.');
    }
    if (encontrados.some((s) => !s.isActive && !yaAsignados.includes(s.id))) {
      throw new BadRequestException('Alguno de los servicios está desactivado. Actívalo primero o quítalo.');
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

  private formatear(
    o: OportunidadConRelaciones,
    etapas: Map<string, EtapaInfo>,
    opcionesServicio: OpcionServicioFicha[] = [],
  ) {
    const {
      services,
      quotedAmount,
      locationName,
      locationAddress,
      locationLat,
      locationLng,
      locationCity,
      locationProvince,
      locationOsmId,
      salesClient: { extra: extraCliente, ...cliente },
      ...resto
    } = o;
    return {
      ...resto,
      salesClient: cliente,
      // Sin servicios propios, lo que la ficha del cliente tiene guardado (la oportunidad es donde se ve).
      servicioDeFicha:
        services.length === 0 ? servicioGuardadoEnFicha(extraCliente, opcionesServicio) : null,
      // Ubicación opcional (mapa): un solo objeto, o null si no tiene punto.
      ubicacion: ubicacionDeFila({
        locationName,
        locationAddress,
        locationLat,
        locationLng,
        locationCity,
        locationProvince,
        locationOsmId,
      }),
      quotedAmount: quotedAmount === null ? null : Number(quotedAmount),
      services: services.map((s) => s.service),
      stage: o.status ? (etapas.get(o.status) ?? null) : null,
      abierta: o.closedAt === null,
    };
  }

  // Oportunidades que alguna vez se reabrieron (pasaron de una etapa cerrada a una abierta): sale del historial de
  // cambios de etapa, sin columna nueva. La pantalla las marca con «!».
  private async reaperturas(
    cid: number,
    ids: number[],
    etapas: Map<string, EtapaInfo>,
  ): Promise<Map<number, { desde: string; desdeEtiqueta: string; fecha: Date; veces: number }>> {
    const out = new Map<number, { desde: string; desdeEtiqueta: string; fecha: Date; veces: number }>();
    const finales = [...etapas.values()].filter((e) => e.isFinal).map((e) => e.key);
    if (ids.length === 0 || finales.length === 0) return out;
    const cambios = await this.prisma.salesOpportunityStageChange.findMany({
      where: { companyId: cid, opportunityId: { in: ids }, fromStatus: { in: finales }, toStatus: { notIn: finales } },
      orderBy: { createdAt: 'desc' },
      select: { opportunityId: true, fromStatus: true, createdAt: true },
    });
    for (const c of cambios) {
      const previo = out.get(c.opportunityId);
      if (previo) {
        previo.veces += 1;
        continue;
      }
      const desde = c.fromStatus as string;
      out.set(c.opportunityId, {
        desde,
        desdeEtiqueta: etapas.get(desde)?.label ?? desde,
        fecha: c.createdAt,
        veces: 1,
      });
    }
    return out;
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
    const [filas, etapas, opcionesServicio, usuarios] = await Promise.all([
      this.prisma.salesOpportunity.findMany({
        where,
        include: incluir,
        orderBy: [{ receivedAt: 'desc' }, { id: 'desc' }],
      }),
      this.etapasDeEmpresa(cid),
      this.opcionesServicioFicha(cid),
      this.prisma.user.findMany({
        where: { companyId: cid },
        select: { id: true, fullName: true },
      }),
    ]);
    const nombre = new Map(usuarios.map((u) => [u.id, u.fullName]));
    // Motivo de las perdidas, para mostrarlo bajo la etapa «Perdida» de la tabla.
    const idsPerdidas = filas.filter((o) => o.outcome === 'PERDIDA').map((o) => o.id);
    const motivos = idsPerdidas.length
      ? ultimoMotivoPorOportunidad(
          await this.prisma.salesReasonEntry.findMany({
            where: { companyId: cid, opportunityId: { in: idsPerdidas }, kind: { in: KINDS_MOTIVO_PERDIDA } },
            select: { opportunityId: true, kind: true, reasonLabel: true, comment: true, source: true, createdAt: true },
          }),
        )
      : new Map();
    const reabiertas = await this.reaperturas(cid, filas.map((o) => o.id), etapas);
    return filas.map((o) => ({
      ...this.formatear(o, etapas, opcionesServicio),
      reabierta: reabiertas.get(o.id) ?? null,
      assignedUserName: o.assignedUserId ? (nombre.get(o.assignedUserId) ?? null) : null,
      // Una perdida anterior al registro de motivos sale como «Sin información»: así el filtro «Motivo de pérdida» y
      // la dona del Dashboard cuentan las mismas.
      motivoPerdida:
        o.outcome === 'PERDIDA' ? (motivos.get(o.id) ?? { label: MOTIVO_SIN_INFORMACION, comment: null, source: null }) : null,
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
    const opcionesServicio = await this.opcionesServicioFicha(cid);
    const entradas = await this.prisma.salesReasonEntry.findMany({
      where: { companyId: cid, opportunityId: id },
      orderBy: { createdAt: 'desc' },
    });
    const { stageChanges, ...base } = o;
    const reabiertas = await this.reaperturas(cid, [id], etapas);
    return {
      ...this.formatear(base as OportunidadConRelaciones, etapas, opcionesServicio),
      reabierta: reabiertas.get(id) ?? null,
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
    if (!cliente) throw new NotFoundException('No se encontró en el Directorio');
    const inicial = await this.prisma.salesClientStage.findFirst({
      where: { companyId: cid, isInitial: true },
    });
    const serviceIds = await this.validarServicios(cid, dto.serviceIds);
    const quotedAmount = this.validarMonto(dto.quotedAmount);
    const quotedAt = this.parseDia(dto.quotedAt, 'La fecha de cotización');
    const ubicacion = dto.ubicacion ? limpiarUbicacion(dto.ubicacion) : null;
    // La fecha de llegada es de la OPORTUNIDAD: sin elegir, es ahora; jamás la fecha de ingreso de la empresa
    // o persona del Directorio (una empresa vieja puede abrir hoy una negociación nueva).
    const receivedAt = llegadaParaCrear(dto.receivedAt);
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
        // El responsable es de la OPORTUNIDAD (2026-10-16): quien la crea, salvo
        // que se indique otro. Ya no hereda el responsable de la empresa o persona.
        assignedUserId: dto.assignedUserId === undefined ? userId : dto.assignedUserId,
        source: fuente,
        originType: existentes > 0 ? 'CLIENTE_EXISTENTE' : 'MANUAL',
        receivedAt,
        serviceIds,
        title: this.texto(dto.title, MAX_TITULO, 'El título'),
        notes: this.texto(dto.notes, MAX_NOTAS, 'Las notas'),
        quotedAmount: quotedAmount ?? null,
        quotedAt: quotedAt ?? null,
        ubicacion,
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
      select: { id: true, receivedAt: true, closedAt: true },
    });
    if (!actual) throw new NotFoundException('Oportunidad no encontrada');
    const data: Prisma.SalesOpportunityUpdateInput = {};
    // «Fecha en que llegó»: solo se reescribe si cambió el día. Como los tiempos de respuesta, cotización y ciclo
    // se miden desde ahí, no puede quedar después del primer cambio de etapa ni del cierre.
    const llegada = llegadaParaEditar(dto.receivedAt, actual.receivedAt);
    if (llegada) {
      const primerCambio = await this.prisma.salesOpportunityStageChange.findFirst({
        where: { opportunityId: id },
        orderBy: { createdAt: 'asc' },
        select: { createdAt: true },
      });
      const problema = errorDeLlegada(llegada, {
        primerCambioDeEtapa: primerCambio?.createdAt ?? null,
        cerradaEl: actual.closedAt,
      });
      if (problema) throw new BadRequestException(problema);
      data.receivedAt = llegada;
    }
    if (dto.title !== undefined) data.title = this.texto(dto.title, MAX_TITULO, 'El título');
    if (dto.notes !== undefined) data.notes = this.texto(dto.notes, MAX_NOTAS, 'Las notas');
    if (dto.quotedAmount !== undefined) data.quotedAmount = this.validarMonto(dto.quotedAmount);
    if (dto.quotedAt !== undefined) data.quotedAt = this.parseDia(dto.quotedAt, 'La fecha de cotización');
    if (dto.assignedUserId !== undefined) data.assignedUserId = dto.assignedUserId;
    // Ubicación opcional: sin enviar no se toca; null la quita; un objeto la reemplaza entera.
    if (dto.ubicacion !== undefined) {
      Object.assign(
        data,
        columnasDeUbicacion(dto.ubicacion === null ? null : limpiarUbicacion(dto.ubicacion)),
      );
    }
    // Al editar, los servicios que la oportunidad ya tenía se conservan aunque se hayan desactivado después.
    const yaAsignados =
      dto.serviceIds !== undefined
        ? (await this.prisma.salesOpportunityService.findMany({ where: { opportunityId: id }, select: { serviceId: true } })).map(
          (r) => r.serviceId,
        )
        : [];
    const serviceIds =
      dto.serviceIds !== undefined ? await this.validarServicios(cid, dto.serviceIds, yaAsignados) : null;
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
    const etapasEmpresa = await this.prisma.salesClientStage.findMany({
      where: { companyId: cid },
      orderBy: { order: 'asc' },
    });
    const destino = etapasEmpresa.find((e) => e.key === dto.toStatus);
    if (!destino) {
      throw new BadRequestException(`La etapa "${dto.toStatus}" no existe en esta empresa`);
    }
    // Solo se avanza; una cerrada solo se reabre a «En evaluación» (ver etapas-sentido.util.ts).
    const sentido = validarCambioDeEtapa(
      etapasEmpresa.find((e) => e.key === opp.status) ?? null,
      opp.closedAt !== null,
      destino,
      etapasEmpresa,
    );
    if (!sentido.ok) throw new BadRequestException(sentido.mensaje);

    const { outcome, cerrada } = resultadoDeEtapa(destino.key, destino.isFinal);

    // Fase 3: al aceptar se pregunta qué pasa con el contrato. Se valida todo
    // ANTES de mover la oportunidad, para no dejarla aceptada a medias.
    let datosContrato:
      | { id: number; title: string | null; salesClientId: number; clienteNombre: string; serviceIds: number[]; quotedAmount: number | null }
      | undefined;
    // Fase 4: una oportunidad de RENOVACIÓN no pregunta servicio/producto: al aceptar crea el
    // contrato nuevo que renueva al anterior (o, si ese ya se renovó a mano, solo se acepta).
    const renueva = opp.renewsAgreementId;
    let estadoRenovacion: 'OK' | 'YA_RENOVADO' | undefined;
    if (!renueva && dto.contrato?.tipo === 'RENOVACION') {
      throw new BadRequestException(
        'Esa oportunidad no es una renovación: elige si fue un servicio recurrente o una venta única.',
      );
    }
    if (renueva && outcome === 'GANADA') {
      estadoRenovacion = await this.acuerdos.validarRenovacion(
        cid,
        { id, salesClientId: opp.salesClientId, clienteNombre: opp.salesClient.name },
        renueva,
        dto.contrato,
      );
    }
    if (dto.contrato && !renueva) {
      if (outcome !== 'GANADA') {
        throw new BadRequestException(
          'El contrato solo se registra al pasar la oportunidad a Aceptada.',
        );
      }
      const filasServicios = await this.prisma.salesOpportunityService.findMany({
        where: { opportunityId: id },
        select: { serviceId: true },
      });
      datosContrato = {
        id,
        title: opp.title,
        salesClientId: opp.salesClientId,
        clienteNombre: opp.salesClient.name,
        serviceIds: filasServicios.map((s) => s.serviceId),
        quotedAmount:
          dto.quotedAmount !== undefined && dto.quotedAmount !== null
            ? dto.quotedAmount
            : opp.quotedAmount === null
              ? null
              : Number(opp.quotedAmount),
      };
      await this.acuerdos.validarAlAceptar(cid, datosContrato, dto.contrato);
    }

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
        // Una renovación perdida es un contrato que no se renovó: el motivo se pide UNA sola vez y
        // queda también en el contrato (quita el aviso «Registrar el motivo» del contrato vencido).
        await this.motivos.registrar(
          tx,
          cid,
          userId,
          renueva ? 'CONTRATO_NO_RENOVADO' : 'OPP_PERDIDA',
          dto.motivo,
          {
            opportunityId: id,
            salesClientId: opp.salesClientId,
            ...(renueva ? { agreementId: renueva } : {}),
            detail: { desde: opp.status, hacia: destino.key },
          },
        );
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

    if (renueva && estadoRenovacion === 'OK' && dto.contrato) {
      try {
        const contratoResultado = await this.acuerdos.aplicarRenovacion(
          cid,
          userId,
          { id, title: opp.title, salesClientId: opp.salesClientId, clienteNombre: opp.salesClient.name },
          renueva,
          dto.contrato,
        );
        return { ...(await this.get(cid, id)), contratoResultado };
      } catch (err) {
        const motivo = err instanceof Error ? err.message : 'error desconocido';
        throw new BadRequestException(
          `La renovación de ${opp.salesClient.name} quedó Aceptada, pero no se pudo crear el contrato nuevo (${motivo}). Renuévalo desde Contratos con «Renovar».`,
        );
      }
    }
    if (dto.contrato && datosContrato) {
      try {
        const contratoResultado = await this.acuerdos.aplicarAlAceptar(
          cid,
          userId,
          datosContrato,
          dto.contrato,
        );
        return { ...(await this.get(cid, id)), contratoResultado };
      } catch (err) {
        const motivo = err instanceof Error ? err.message : 'error desconocido';
        throw new BadRequestException(
          `La oportunidad de ${opp.salesClient.name} quedó Aceptada, pero no se pudo registrar el contrato (${motivo}). Regístralo desde Contratos.`,
        );
      }
    }
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
    if (!cliente) throw new NotFoundException('No se encontró en el Directorio');
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

  // Se ejecuta después de confirmado el cambio de etapa. Un fallo acá nunca debe
  // deshacer ni bloquear el cambio que ya se guardó — solo se registra en el
  // servidor. Ningún texto menciona dinero, comisión ni porcentaje. Avisa solo
  // dentro de la app (campana), nunca por correo.
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
    // Solo notificación dentro de la app: a quien refiere NO se le manda correo (decisión de la
    // usuaria, 2026-10-20; antes salía también un correo desde sistemas@gemeseg.com).
  }
}
