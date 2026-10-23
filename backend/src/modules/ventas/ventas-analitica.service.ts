import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  calcularEstadoContrato,
  hoyEcuador,
  parseDiaContrato,
  type EstadoContrato,
} from './agreement-status.util';
import { type CicloVida } from './client-lifecycle.util';
import { VentasCicloService } from './ventas-ciclo.service';
import {
  conversionEmbudo,
  diasEntre,
  resumirMuestra,
} from './ventas-metricas.util';
import { ETAPA_GANADA } from './stage-outcome.util';
import { KINDS_MOTIVO_PERDIDA, MOTIVO_SIN_INFORMACION } from './motivo-perdida.util';
import {
  embudoMarketing,
  faseMarketing,
  type LeadParaEmbudo,
} from './ventas-marketing.util';
import { ETIQUETA_KIND, MOTIVO_KINDS } from './ventas-motivos.service';
import { agruparMapa, vistaValida } from './ventas-mapa.util';
import { Prisma } from '@prisma/client';

// Desde cuándo existe el historial de cambios de etapa (SalesClientStageChange
// empezó a guardarse ese día). Lo anterior se mide solo cuando hay datos
// completos y el tablero lo dice: «medido en N de M».
export const FECHA_INICIO_HISTORIAL = '2026-09-30';

const DIA_MS = 24 * 60 * 60 * 1000;
const dia = (d: Date) => d.toISOString().slice(0, 10);
const diaUtc = (s: string) => new Date(`${s}T00:00:00.000Z`);
const sumarDiasStr = (s: string, n: number) =>
  dia(new Date(diaUtc(s).getTime() + n * DIA_MS));

// Lunes (UTC) de la semana de un día 'YYYY-MM-DD'.
function lunesDe(s: string): string {
  const d = diaUtc(s);
  const dow = (d.getUTCDay() + 6) % 7;
  return dia(new Date(d.getTime() - dow * DIA_MS));
}

const VIGENTES: EstadoContrato[] = ['VIGENTE', 'POR_VENCER', 'POR_INICIAR'];

// A quién se miran las cifras. Todo el que tiene acceso a Ventas puede elegir «toda la empresa» (es solo lectura de
// cifras y el Resumen del Dashboard ya funcionaba así); elegir a OTRO vendedor es solo de ADMIN y MANAGER. Sin elegir
// nada, un empleado ve lo suyo y un ADMIN/MANAGER ve a toda la empresa. Antes un empleado veía estas pestañas
// siempre en 0 aunque eligiera «toda la empresa», mientras el Resumen sí le mostraba datos (2026-10-21).
export interface AlcanceAnalitica {
  userId: number;
  role: string;
  alcance?: string; // 'mine' | 'all' | id de un vendedor
}

@Injectable()
export class VentasAnaliticaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ciclos: VentasCicloService,
  ) {}

  private requireCompany(companyId: number | null): number {
    if (!companyId) throw new BadRequestException('Se requiere una empresa');
    return companyId;
  }

  // null = toda la empresa; número = solo lo de ese vendedor.
  private vendedor(a: AlcanceAnalitica): number | null {
    const privilegiado = a.role === 'ADMIN' || a.role === 'MANAGER';
    if (a.alcance === 'all') return null;
    if (a.alcance === 'mine') return a.userId;
    if (!privilegiado) return a.userId; // sin elegir, o pidiendo a otra persona: solo lo suyo
    if (!a.alcance) return null;
    const id = Number(a.alcance);
    return Number.isInteger(id) && id > 0 ? id : null;
  }

  private rango(desde?: string, hasta?: string, diasPorDefecto = 90) {
    const hoy = hoyEcuador();
    const fin = hasta ? parseDiaContrato(hasta) : diaUtc(hoy);
    if (hasta && !fin) throw new BadRequestException('La fecha «hasta» no es válida.');
    const ini = desde ? parseDiaContrato(desde) : diaUtc(sumarDiasStr(hoy, -diasPorDefecto));
    if (desde && !ini) throw new BadRequestException('La fecha «desde» no es válida.');
    if (ini!.getTime() > fin!.getTime()) {
      throw new BadRequestException('La fecha «desde» no puede ser posterior a «hasta».');
    }
    // `hasta` incluye todo ese día.
    return {
      desde: ini!,
      hasta: fin!,
      hastaFin: new Date(fin!.getTime() + DIA_MS - 1),
      desdeStr: dia(ini!),
      hastaStr: dia(fin!),
    };
  }

  // Las empresas o personas «de» un vendedor: las que tienen una oportunidad a su nombre, más las que aún traen su
  // nombre del sistema anterior. Desde 2026-10-16 el responsable es de la OPORTUNIDAD; mirar solo el de la
  // empresa dejaba la cartera de un vendedor casi vacía aunque llevara oportunidades. Es la misma regla del
  // Resumen del Dashboard (VentasClientesService.getDashboard).
  private async idsClientes(companyId: number, vendedor: number | null) {
    if (vendedor === null) return null;
    const cs = await this.prisma.salesClient.findMany({
      where: {
        companyId,
        OR: [{ assignedUserId: vendedor }, { opportunities: { some: { assignedUserId: vendedor } } }],
      },
      select: { id: true },
    });
    return cs.map((c) => c.id);
  }

  /** Ids de las empresas o personas del alcance (null = toda la empresa). Los usan las pantallas a las que lleva el Dashboard. */
  async clientesDelAlcance(companyId: number | null, a: AlcanceAnalitica): Promise<{ ids: number[] | null }> {
    const cid = this.requireCompany(companyId);
    return { ids: await this.idsClientes(cid, this.vendedor(a)) };
  }

  // ---------------------------------------------------------------------
  // Cartera y contratos (foto de hoy)
  // ---------------------------------------------------------------------

  async cartera(companyId: number | null, a: AlcanceAnalitica) {
    const cid = this.requireCompany(companyId);
    const ids = await this.idsClientes(cid, this.vendedor(a));
    const filtroCliente = ids ? { in: ids } : undefined;
    const hoy = hoyEcuador();
    const hoyD = diaUtc(hoy);

    const [clientes, contratos, entradas, reducciones, ciclos] = await Promise.all([
      this.prisma.salesClient.findMany({
        where: { companyId: cid, ...(filtroCliente ? { id: filtroCliente } : {}) },
        select: { id: true, name: true },
      }),
      this.prisma.salesAgreement.findMany({
        // Las ventas de producto no vencen ni se renuevan: no entran en estas cifras.
        where: { companyId: cid, kind: { not: 'PRODUCTO' }, ...(filtroCliente ? { salesClientId: filtroCliente } : {}) },
        include: { services: { include: { service: { select: { id: true, name: true } } } } },
      }),
      this.prisma.salesReasonEntry.findMany({
        where: {
          companyId: cid,
          kind: { in: ['CONTRATO_CANCELADO', 'CONTRATO_NO_RENOVADO'] },
          agreementId: { not: null },
        },
        orderBy: { createdAt: 'desc' },
        select: { agreementId: true, reasonLabel: true },
      }),
      this.prisma.salesReasonEntry.findMany({
        where: {
          companyId: cid,
          kind: 'CONTRATO_REDUCCION',
          createdAt: { gte: new Date(hoyD.getTime() - 90 * DIA_MS) },
          ...(filtroCliente ? { salesClientId: filtroCliente } : {}),
        },
        orderBy: { createdAt: 'desc' },
        select: { id: true, salesClientId: true, reasonLabel: true, source: true, detail: true, createdAt: true },
      }),
      this.ciclos.calcular(cid, ids ?? undefined),
    ]);

    const nombre = new Map(clientes.map((c) => [c.id, c.name]));
    const motivoCierre = new Map<number, string>();
    for (const e of entradas) {
      if (e.agreementId && !motivoCierre.has(e.agreementId)) motivoCierre.set(e.agreementId, e.reasonLabel);
    }

    // ---- ciclo de vida ----
    const porCiclo: Record<CicloVida, number> = {
      SOLO_DATOS: 0, PROSPECTO: 0, CLIENTE: 0, EN_RIESGO: 0, EX_CLIENTE: 0, PERDIDO: 0,
    };
    for (const c of clientes) {
      const r = ciclos.get(c.id);
      if (r) porCiclo[r.ciclo]++;
    }

    // ---- contratos ----
    const conEstado = contratos.map((c) => ({ c, estado: calcularEstadoContrato(c) }));
    const vigentes = conEstado.filter((x) => VIGENTES.includes(x.estado));
    const enCurso = conEstado.filter((x) => x.estado === 'VIGENTE' || x.estado === 'POR_VENCER');
    const valorMensual = enCurso.reduce((s, x) => s + (x.c.monthlyValue ? Number(x.c.monthlyValue) : 0), 0);
    const sinValor = enCurso.filter((x) => x.c.monthlyValue === null).length;

    // ---- renovaciones próximas ----
    const diasHasta = (fin: Date) => Math.round((fin.getTime() - hoyD.getTime()) / DIA_MS);
    const proximas = enCurso
      .filter((x) => x.c.endDate && diasHasta(x.c.endDate) >= 0 && diasHasta(x.c.endDate) <= 90)
      .map((x) => ({
        id: x.c.id,
        clienteId: x.c.salesClientId,
        cliente: nombre.get(x.c.salesClientId) ?? '—',
        titulo: x.c.title,
        fin: dia(x.c.endDate!),
        dias: diasHasta(x.c.endDate!),
        valorMensual: x.c.monthlyValue === null ? null : Number(x.c.monthlyValue),
      }))
      .sort((p, q) => p.dias - q.dias);
    const renovaciones = {
      d30: proximas.filter((p) => p.dias <= 30).length,
      d60: proximas.filter((p) => p.dias <= 60).length,
      d90: proximas.length,
      proximas: proximas.slice(0, 15),
    };

    // ---- vencidos sin renovar ----
    const vencidos = conEstado
      .filter((x) => x.estado === 'VENCIDO')
      .map((x) => {
        const diasVencido = -diasHasta(x.c.endDate!);
        return {
          id: x.c.id,
          clienteId: x.c.salesClientId,
          cliente: nombre.get(x.c.salesClientId) ?? '—',
          titulo: x.c.title,
          fin: dia(x.c.endDate!),
          diasVencido,
          enGracia: diasVencido <= x.c.graceDays,
          valorMensual: x.c.monthlyValue === null ? null : Number(x.c.monthlyValue),
          motivoCierre: motivoCierre.get(x.c.id) ?? null,
        };
      })
      .sort((p, q) => p.diasVencido - q.diasVencido);

    // ---- servicios y venta cruzada ----
    const porServicio = new Map<string, { contratos: number; clientes: Set<number> }>();
    const serviciosPorCliente = new Map<number, Set<number>>();
    for (const x of vigentes) {
      for (const s of x.c.services) {
        const e = porServicio.get(s.service.name) ?? { contratos: 0, clientes: new Set<number>() };
        e.contratos++;
        e.clientes.add(x.c.salesClientId);
        porServicio.set(s.service.name, e);
        const set = serviciosPorCliente.get(x.c.salesClientId) ?? new Set<number>();
        set.add(s.service.id);
        serviciosPorCliente.set(x.c.salesClientId, set);
      }
    }
    const masContratados = [...porServicio.entries()]
      .map(([servicio, e]) => ({ servicio, contratos: e.contratos, clientes: e.clientes.size }))
      .sort((p, q) => q.contratos - p.contratos)
      .slice(0, 10);
    const conUno = [...serviciosPorCliente.values()].filter((s) => s.size === 1).length;
    const conVarios = [...serviciosPorCliente.values()].filter((s) => s.size > 1).length;

    // ---- bajas del mes ----
    const inicioMes = `${hoy.slice(0, 8)}01`;
    const bajas = this.bajasDeClientes(contratos, hoy).filter(
      (b) => b.fin >= inicioMes && b.fin < hoy,
    );

    return {
      ciclo: { ...porCiclo, total: clientes.length },
      contratos: {
        vigentes: vigentes.length,
        porVencer: conEstado.filter((x) => x.estado === 'POR_VENCER').length,
        vencidosSinRenovar: vencidos.length,
        cancelados: conEstado.filter((x) => x.estado === 'CANCELADO').length,
        valorMensualVigente: valorMensual,
        sinValor,
      },
      renovaciones,
      vencidos: vencidos.slice(0, 30),
      servicios: { masContratados, clientesConUnServicio: conUno, clientesConVarios: conVarios },
      reducciones: {
        ultimos90Dias: reducciones.length,
        recientes: reducciones.slice(0, 10).map((r) => ({
          id: r.id,
          cliente: r.salesClientId ? (nombre.get(r.salesClientId) ?? '—') : '—',
          motivo: r.reasonLabel,
          source: r.source,
          detail: r.detail,
          fecha: dia(r.createdAt),
        })),
      },
      bajasDelMes: {
        total: bajas.length,
        clientes: bajas.slice(0, 10).map((b) => ({
          id: b.clienteId,
          cliente: nombre.get(b.clienteId) ?? '—',
          fin: b.fin,
        })),
      },
      hoy,
    };
  }

  // Fin de la cobertura continua de cada cliente: el último día que tuvo algún
  // contrato en pie (un contrato cancelado cubre hasta su fecha de cancelación;
  // uno sin fecha de fin no termina nunca). Solo devuelve a los clientes que ya
  // no están cubiertos hoy.
  private bajasDeClientes(
    contratos: { salesClientId: number; status: string; startDate: Date; endDate: Date | null; cancelledAt: Date | null }[],
    hoy: string,
  ): { clienteId: number; fin: string }[] {
    const finPorCliente = new Map<number, string | 'SIN_FIN'>();
    for (const c of contratos) {
      let fin: string | 'SIN_FIN';
      if (c.status === 'CANCELADO') fin = dia(c.cancelledAt ?? c.startDate);
      else fin = c.endDate ? dia(c.endDate) : 'SIN_FIN';
      const actual = finPorCliente.get(c.salesClientId);
      if (actual === 'SIN_FIN') continue;
      if (fin === 'SIN_FIN' || !actual || fin > actual) finPorCliente.set(c.salesClientId, fin);
    }
    return [...finPorCliente.entries()]
      .filter(([, fin]) => fin !== 'SIN_FIN' && fin < hoy)
      .map(([clienteId, fin]) => ({ clienteId, fin: fin as string }));
  }

  // ---------------------------------------------------------------------
  // Retención (en clientes y en dinero) y % de renovación
  // ---------------------------------------------------------------------

  async retencion(
    companyId: number | null,
    a: AlcanceAnalitica,
    desdeRaw?: string,
    hastaRaw?: string,
  ) {
    const cid = this.requireCompany(companyId);
    const r = this.rango(desdeRaw, hastaRaw, 365);
    const ids = await this.idsClientes(cid, this.vendedor(a));
    const contratos = await this.prisma.salesAgreement.findMany({
      where: { companyId: cid, kind: { not: 'PRODUCTO' }, ...(ids ? { salesClientId: { in: ids } } : {}) },
    });

    // ¿El contrato cubre ese día? (cancelado: hasta su fecha de cancelación)
    const cubre = (c: (typeof contratos)[number], d: string) => {
      if (dia(c.startDate) > d) return false;
      if (c.status === 'CANCELADO') return d <= dia(c.cancelledAt ?? c.startDate);
      return !c.endDate || dia(c.endDate) >= d;
    };
    const valor = (c: (typeof contratos)[number]) => (c.monthlyValue === null ? null : Number(c.monthlyValue));

    // Cohorte: clientes cubiertos al inicio del periodo.
    const cohorte = new Map<number, typeof contratos>();
    for (const c of contratos) {
      if (cubre(c, r.desdeStr)) cohorte.set(c.salesClientId, [...(cohorte.get(c.salesClientId) ?? []), c]);
    }
    let mrr0 = 0;
    let mrr1 = 0;
    let retenidoBruto = 0;
    let sinValorEnCohorte = 0;
    let clientesRetenidos = 0;
    for (const [clienteId, cs0] of cohorte) {
      const cs1 = contratos.filter((c) => c.salesClientId === clienteId && cubre(c, r.hastaStr));
      if (cs1.length > 0) clientesRetenidos++;
      // Solo se mide el dinero de clientes cuyos contratos del inicio tienen valor.
      if (cs0.some((c) => valor(c) === null)) {
        sinValorEnCohorte++;
        continue;
      }
      const v0 = cs0.reduce((s, c) => s + (valor(c) ?? 0), 0);
      const v1 = cs1.reduce((s, c) => s + (valor(c) ?? 0), 0);
      mrr0 += v0;
      mrr1 += v1;
      retenidoBruto += Math.min(v0, v1);
    }

    // Renovación: contratos cuyo fin cayó dentro del periodo.
    const terminan = contratos.filter(
      (c) => c.endDate && dia(c.endDate) >= r.desdeStr && dia(c.endDate) <= r.hastaStr,
    );
    const renovados = terminan.filter((c) => c.status === 'RENOVADO');
    const cancelados = terminan.filter((c) => c.status === 'CANCELADO');
    const sinRenovar = terminan.filter(
      (c) => c.status === 'ACTIVO' && calcularEstadoContrato(c) === 'VENCIDO',
    );
    const decididos = renovados.length + cancelados.length + sinRenovar.length;
    const suma = (cs: typeof contratos) => cs.reduce((s, c) => s + (valor(c) ?? 0), 0);
    const decididosDinero = suma(renovados) + suma(cancelados) + suma(sinRenovar);

    return {
      periodo: { desde: r.desdeStr, hasta: r.hastaStr },
      clientes: {
        cohorte: cohorte.size,
        retenidos: clientesRetenidos,
        tasa: cohorte.size === 0 ? null : Math.round((clientesRetenidos / cohorte.size) * 1000) / 10,
      },
      dinero: {
        mrrInicial: mrr0,
        mrrFinal: mrr1,
        retencionBruta: mrr0 === 0 ? null : Math.round((retenidoBruto / mrr0) * 1000) / 10,
        retencionNeta: mrr0 === 0 ? null : Math.round((mrr1 / mrr0) * 1000) / 10,
        clientesSinValor: sinValorEnCohorte,
      },
      renovacion: {
        contratosQueTerminan: terminan.length,
        renovados: renovados.length,
        cancelados: cancelados.length,
        vencidosSinRenovar: sinRenovar.length,
        tasa: decididos === 0 ? null : Math.round((renovados.length / decididos) * 1000) / 10,
        tasaEnDinero:
          decididosDinero === 0 ? null : Math.round((suma(renovados) / decididosDinero) * 1000) / 10,
      },
    };
  }

  // ---------------------------------------------------------------------
  // Embudo, tiempos y velocidad (se leen del historial de cambios de etapa)
  // ---------------------------------------------------------------------

  async embudo(
    companyId: number | null,
    a: AlcanceAnalitica,
    desdeRaw?: string,
    hastaRaw?: string,
  ) {
    const cid = this.requireCompany(companyId);
    const r = this.rango(desdeRaw, hastaRaw, 90);
    const vend = this.vendedor(a);
    const [etapas, opps] = await Promise.all([
      this.prisma.salesClientStage.findMany({ where: { companyId: cid }, orderBy: { order: 'asc' } }),
      this.prisma.salesOpportunity.findMany({
        where: {
          companyId: cid,
          receivedAt: { gte: r.desde, lte: r.hastaFin },
          // Un cliente que ya venía contratando y se registró a mano no es una venta nueva. Una
          // renovación (la abre sola el sistema, sin responsable) tampoco: contarla falsearía el
          // tiempo de respuesta y la conversión del embudo de ventas nuevas.
          originType: { notIn: ['HISTORICO', 'RENOVACION'] },
          ...(vend !== null ? { assignedUserId: vend } : {}),
        },
        include: { stageChanges: { orderBy: { createdAt: 'asc' } } },
      }),
    ]);

    // Camino del embudo: las etapas que no son finales, en orden, y la de ganada.
    const camino = etapas.filter((e) => !e.isFinal).map((e) => e.key);
    if (etapas.some((e) => e.key === ETAPA_GANADA)) camino.push(ETAPA_GANADA);
    const etiqueta = new Map(etapas.map((e) => [e.key, e.label]));
    const inicial = etapas.find((e) => e.isInitial)?.key ?? camino[0];
    const inicioHistorial = diaUtc(FECHA_INICIO_HISTORIAL);

    // Una oportunidad migrada anterior al inicio del historial no tiene todos
    // sus cambios: se cuenta en el embudo por lo que se sabe, pero no en los
    // tiempos (mediríamos mal).
    const conHistorialCompleto = (o: (typeof opps)[number]) =>
      o.originType !== 'MIGRADA' || o.receivedAt >= inicioHistorial;

    const posicion = (o: (typeof opps)[number]) => {
      const alcanzadas = new Set<string>([inicial, ...o.stageChanges.map((c) => c.toStatus)]);
      if (o.status) alcanzadas.add(o.status);
      let max = 0;
      camino.forEach((k, i) => {
        if (alcanzadas.has(k)) max = i;
      });
      if (o.outcome === 'GANADA') max = camino.length - 1;
      return max;
    };
    const conversion = conversionEmbudo(
      camino,
      opps.map((o) => ({ posicionMaxima: posicion(o) })),
    ).map((p) => ({ ...p, etiqueta: etiqueta.get(p.etapa) ?? p.etapa }));

    // Tiempo en cada etapa (días): de la entrada a la salida, solo tramos cerrados.
    const duraciones = new Map<string, number[]>();
    for (const o of opps.filter(conHistorialCompleto)) {
      const eventos = [
        { status: o.stageChanges[0]?.fromStatus ?? inicial, at: o.receivedAt },
        ...o.stageChanges.map((c) => ({ status: c.toStatus, at: c.createdAt })),
      ];
      for (let i = 0; i < eventos.length - 1; i++) {
        const lista = duraciones.get(eventos[i].status) ?? [];
        lista.push(diasEntre(eventos[i].at, eventos[i + 1].at));
        duraciones.set(eventos[i].status, lista);
      }
    }
    // Aceptado es el final del camino, no una etapa donde la oportunidad espera:
    // medirle el tiempo no tiene sentido.
    const tiempoPorEtapa = camino
      .filter((k) => k !== ETAPA_GANADA)
      .map((k) => ({
      etapa: k,
      etiqueta: etiqueta.get(k) ?? k,
      ...resumirMuestra(duraciones.get(k) ?? []),
    }));

    // Velocidad: respuesta (Recibido→Leído), cotización (Recibido→Cotizado) y ciclo.
    const completas = opps.filter(conHistorialCompleto);
    const primera = (o: (typeof opps)[number], etapa: string) =>
      o.stageChanges.find((c) => c.toStatus === etapa)?.createdAt ?? null;
    const respuesta: number[] = [];
    const cotizacion: number[] = [];
    const ciclo: number[] = [];
    for (const o of completas) {
      const leido = primera(o, 'LEIDO');
      if (leido) respuesta.push(diasEntre(o.receivedAt, leido));
      const cot = primera(o, 'COTIZADO');
      const quotedAt = o.quotedAt ? new Date(`${dia(o.quotedAt)}T12:00:00.000Z`) : null;
      const marca = cot && quotedAt ? (cot < quotedAt ? cot : quotedAt) : (cot ?? quotedAt);
      if (marca) cotizacion.push(Math.max(0, diasEntre(o.receivedAt, marca)));
      if (o.outcome === 'GANADA' && o.closedAt) ciclo.push(diasEntre(o.receivedAt, o.closedAt));
    }

    return {
      periodo: { desde: r.desdeStr, hasta: r.hastaStr },
      oportunidades: opps.length,
      conversion,
      tiempoPorEtapa,
      velocidad: {
        respuestaDias: resumirMuestra(respuesta),
        cotizacionDias: resumirMuestra(cotizacion),
        cicloDias: resumirMuestra(ciclo),
      },
      cobertura: {
        medidas: completas.length,
        de: opps.length,
        historialDesde: FECHA_INICIO_HISTORIAL,
      },
    };
  }

  // ---------------------------------------------------------------------
  // Mapa de Ecuador: dónde se cotiza (2026-10-19)
  // ---------------------------------------------------------------------

  // Las oportunidades que tienen Ubicación, agrupadas por ciudad y provincia. Las renovaciones (las abre
  // sola el sistema) y los clientes históricos no son demanda nueva, así que no cuentan. Quien no es
  // ADMIN/MANAGER solo ve las suyas (por el responsable de la oportunidad, como el resto del Resumen).
  async mapa(companyId: number | null, a: AlcanceAnalitica, vistaRaw?: string) {
    const cid = this.requireCompany(companyId);
    const vend = this.vendedor(a);
    const vista = vistaValida(vistaRaw);
    const where: Prisma.SalesOpportunityWhereInput = {
      companyId: cid,
      originType: { notIn: ['HISTORICO', 'RENOVACION'] },
      ...(vend !== null ? { assignedUserId: vend } : {}),
    };
    if (vista === 'abiertas') where.closedAt = null;
    else if (vista === 'aceptadas') where.outcome = 'GANADA';
    else if (vista === 'perdidas') where.outcome = 'PERDIDA';
    else if (vista === 'cotizadas') where.OR = [{ quotedAmount: { not: null } }, { quotedAt: { not: null } }];

    const filas = await this.prisma.salesOpportunity.findMany({
      where,
      select: {
        locationName: true,
        locationLat: true,
        locationLng: true,
        locationCity: true,
        locationProvince: true,
        quotedAmount: true,
        outcome: true,
        closedAt: true,
      },
    });
    return {
      vista,
      ...agruparMapa(
        filas.map((f) => ({ ...f, quotedAmount: f.quotedAmount === null ? null : Number(f.quotedAmount) })),
      ),
    };
  }

  // Velocidad típica de la empresa (últimos 12 meses): contra ella compara el
  // expediente de un cliente cuánto tardó en responderse y cotizarse.
  async velocidadEmpresa(companyId: number) {
    const hoy = hoyEcuador();
    const e = await this.embudo(
      companyId,
      { userId: 0, role: 'ADMIN', alcance: 'all' },
      sumarDiasStr(hoy, -365),
      hoy,
    );
    return e.velocidad;
  }

  // ---------------------------------------------------------------------
  // Aceptación por fuente, servicio, responsable y referidor
  // ---------------------------------------------------------------------

  async aceptacion(
    companyId: number | null,
    a: AlcanceAnalitica,
    desdeRaw?: string,
    hastaRaw?: string,
  ) {
    const cid = this.requireCompany(companyId);
    const r = this.rango(desdeRaw, hastaRaw, 180);
    const vend = this.vendedor(a);
    const cerradas = await this.prisma.salesOpportunity.findMany({
      where: {
        companyId: cid,
        outcome: { in: ['GANADA', 'PERDIDA'] },
        closedAt: { gte: r.desde, lte: r.hastaFin },
        originType: { not: 'HISTORICO' },
        ...(vend !== null ? { assignedUserId: vend } : {}),
      },
      include: { services: { include: { service: { select: { name: true } } } } },
    });
    const usuarios = await this.prisma.user.findMany({
      where: { companyId: cid },
      select: { id: true, fullName: true },
    });
    const nombreUsuario = new Map(usuarios.map((u) => [u.id, u.fullName]));

    type Grupo = { ganadas: number; perdidas: number };
    const agrupar = (clavesDe: (o: (typeof cerradas)[number]) => string[]) => {
      const m = new Map<string, Grupo>();
      for (const o of cerradas) {
        for (const k of clavesDe(o)) {
          const g = m.get(k) ?? { ganadas: 0, perdidas: 0 };
          if (o.outcome === 'GANADA') g.ganadas++;
          else g.perdidas++;
          m.set(k, g);
        }
      }
      return [...m.entries()]
        .map(([nombre, g]) => ({
          nombre,
          ...g,
          n: g.ganadas + g.perdidas,
          tasa: Math.round((g.ganadas / (g.ganadas + g.perdidas)) * 1000) / 10,
          pocasMuestras: g.ganadas + g.perdidas < 5,
        }))
        .sort((p, q) => q.n - p.n)
        .slice(0, 10);
    };

    const privilegiado = a.role === 'ADMIN' || a.role === 'MANAGER';
    return {
      periodo: { desde: r.desdeStr, hasta: r.hastaStr },
      cerradas: cerradas.length,
      porFuente: agrupar((o) => [o.source || 'Sin fuente']),
      porServicio: agrupar((o) => (o.services.length ? o.services.map((s) => s.service.name) : ['Sin servicio'])),
      // Ver a todos los vendedores y referidores es solo para ADMIN/MANAGER.
      porResponsable: privilegiado
        ? agrupar((o) => [o.assignedUserId ? (nombreUsuario.get(o.assignedUserId) ?? 'Sin responsable') : 'Sin responsable'])
        : [],
      porReferidor: privilegiado
        ? agrupar((o) => (o.referredByUserId ? [nombreUsuario.get(o.referredByUserId) ?? 'Referidor'] : []))
        : [],
    };
  }

  // ---------------------------------------------------------------------
  // Motivos de cierre (pareto)
  // ---------------------------------------------------------------------

  async motivos(
    companyId: number | null,
    a: AlcanceAnalitica,
    desdeRaw?: string,
    hastaRaw?: string,
  ) {
    const cid = this.requireCompany(companyId);
    const r = this.rango(desdeRaw, hastaRaw, 180);
    const vend = this.vendedor(a);
    const ids = await this.idsClientes(cid, vend);
    // Un posible cliente descartado aún no es una empresa del Directorio (no tiene salesClientId): para un vendedor
    // cuentan los que tenía asignados.
    const leadsDelVendedor = vend === null
      ? []
      : (await this.prisma.salesLead.findMany({ where: { companyId: cid, assignedUserId: vend }, select: { id: true } })).map((l) => l.id);
    const registradas = await this.prisma.salesReasonEntry.findMany({
      where: {
        companyId: cid,
        createdAt: { gte: r.desde, lte: r.hastaFin },
        ...(ids ? { OR: [{ salesClientId: { in: ids } }, { leadId: { in: leadsDelVendedor } }] } : {}),
      },
      select: { kind: true, reasonLabel: true, source: true, opportunityId: true, createdAt: true },
    });
    // Una oportunidad reabierta ya no está perdida (2026-10-22): su motivo viejo no cuenta, para que la dona siga
    // sumando lo mismo que el medidor. Y si se perdió dos veces, solo cuenta el último motivo.
    const entradaDePerdida = (e: { kind: string; opportunityId?: number | null }) =>
      e.opportunityId != null && KINDS_MOTIVO_PERDIDA.includes(e.kind);
    const idsConMotivo = [...new Set(registradas.filter(entradaDePerdida).map((e) => e.opportunityId as number))];
    const siguenPerdidas = idsConMotivo.length
      ? new Set(
          (
            await this.prisma.salesOpportunity.findMany({
              where: { companyId: cid, id: { in: idsConMotivo }, outcome: 'PERDIDA' },
              select: { id: true },
            })
          ).map((o) => o.id),
        )
      : new Set<number>();
    const ultimoMotivo = new Map<number, number>();
    for (const e of registradas.filter(entradaDePerdida)) {
      const t = e.createdAt.getTime();
      if (t > (ultimoMotivo.get(e.opportunityId as number) ?? 0)) ultimoMotivo.set(e.opportunityId as number, t);
    }
    const entradas: { kind: string; reasonLabel: string; source: string | null }[] = registradas.filter(
      (e) =>
        !entradaDePerdida(e) ||
        (siguenPerdidas.has(e.opportunityId as number) && e.createdAt.getTime() === ultimoMotivo.get(e.opportunityId as number)),
    );
    // Lo perdido o descartado ANTES de que el sistema pidiera un motivo no tiene registro: cuenta como «Sin información»
    // para que la dona sume lo mismo que el medidor de Aceptación y que la lista a la que lleva (2026-10-21).
    const [perdidasSinMotivo, descartadosSinMotivo] = await Promise.all([
      this.perdidasSinMotivo(cid, ids, r.desde, r.hastaFin),
      this.descartadosSinMotivo(cid, vend, r.desde, r.hastaFin),
    ]);
    entradas.push(
      ...Array.from({ length: perdidasSinMotivo }, () => ({ kind: 'OPP_PERDIDA', reasonLabel: MOTIVO_SIN_INFORMACION, source: null })),
      ...Array.from({ length: descartadosSinMotivo }, () => ({ kind: 'LEAD_DESCARTE', reasonLabel: MOTIVO_SIN_INFORMACION, source: null })),
    );
    const pct = (n: number, t: number) => (t === 0 ? 0 : Math.round((n / t) * 1000) / 10);
    return {
      periodo: { desde: r.desdeStr, hasta: r.hastaStr },
      porCierre: MOTIVO_KINDS.map((kind) => {
        const lista = entradas.filter((e) => e.kind === kind);
        const cuenta = new Map<string, number>();
        for (const e of lista) cuenta.set(e.reasonLabel, (cuenta.get(e.reasonLabel) ?? 0) + 1);
        const items = [...cuenta.entries()]
          .map(([label, count]) => ({ label, count, pct: pct(count, lista.length) }))
          .sort((p, q) => q.count - p.count);
        const sinInfo = lista.filter((e) => e.source === null).length;
        return {
          kind,
          etiqueta: ETIQUETA_KIND[kind],
          total: lista.length,
          items,
          // Cuánto de lo registrado no se sabe, y cuánto es solo opinión del
          // vendedor: sin esto la gráfica parecería más segura de lo que es.
          sinInformacionPct: pct(sinInfo, lista.length),
          segunVendedorPct: pct(lista.filter((e) => e.source === 'VENDEDOR').length, lista.length),
          segunClientePct: pct(lista.filter((e) => e.source === 'CLIENTE').length, lista.length),
        };
      }),
    };
  }

  // Oportunidades perdidas en el periodo y dentro del alcance que no tienen ningún motivo registrado.
  private async perdidasSinMotivo(cid: number, ids: number[] | null, desde: Date, hasta: Date): Promise<number> {
    const perdidas = await this.prisma.salesOpportunity.findMany({
      where: {
        companyId: cid,
        outcome: 'PERDIDA',
        closedAt: { gte: desde, lte: hasta },
        ...(ids ? { salesClientId: { in: ids } } : {}),
      },
      select: { id: true },
    });
    if (perdidas.length === 0) return 0;
    const conMotivo = await this.prisma.salesReasonEntry.findMany({
      where: { companyId: cid, kind: { in: KINDS_MOTIVO_PERDIDA }, opportunityId: { in: perdidas.map((o) => o.id) } },
      select: { opportunityId: true },
    });
    const con = new Set(conMotivo.map((e) => e.opportunityId));
    return perdidas.filter((o) => !con.has(o.id)).length;
  }

  // Posibles clientes descartados en el periodo (para un vendedor, los suyos) sin motivo registrado.
  private async descartadosSinMotivo(cid: number, vend: number | null, desde: Date, hasta: Date): Promise<number> {
    const descartados = await this.prisma.salesLead.findMany({
      where: { companyId: cid, status: 'DESCARTADO', ...(vend !== null ? { assignedUserId: vend } : {}) },
      select: { id: true, triagedAt: true, updatedAt: true },
    });
    const delPeriodo = descartados.filter((l) => {
      const cuando = l.triagedAt ?? l.updatedAt;
      return cuando >= desde && cuando <= hasta;
    });
    if (delPeriodo.length === 0) return 0;
    const conMotivo = await this.prisma.salesReasonEntry.findMany({
      where: { companyId: cid, kind: 'LEAD_DESCARTE', leadId: { in: delPeriodo.map((l) => l.id) } },
      select: { leadId: true },
    });
    const con = new Set(conMotivo.map((e) => e.leadId));
    return delPeriodo.filter((l) => !con.has(l.id)).length;
  }

  // ---------------------------------------------------------------------
  // Actividad del equipo por vendedor y semana
  // ---------------------------------------------------------------------

  async actividad(
    companyId: number | null,
    a: AlcanceAnalitica,
    desdeRaw?: string,
    hastaRaw?: string,
  ) {
    const cid = this.requireCompany(companyId);
    const r = this.rango(desdeRaw, hastaRaw, 56);
    const vend = this.vendedor(a);
    const [actividades, cambios, usuarios] = await Promise.all([
      this.prisma.salesClientActivity.findMany({
        where: {
          companyId: cid,
          createdAt: { gte: r.desde, lte: r.hastaFin },
          ...(vend !== null ? { createdBy: vend } : {}),
        },
        select: { createdBy: true, createdAt: true },
      }),
      this.prisma.salesOpportunityStageChange.findMany({
        where: {
          companyId: cid,
          createdAt: { gte: r.desde, lte: r.hastaFin },
          ...(vend !== null ? { changedBy: vend } : {}),
        },
        select: { changedBy: true, createdAt: true },
      }),
      this.prisma.user.findMany({
        where: { companyId: cid },
        select: { id: true, fullName: true },
      }),
    ]);
    const nombre = new Map(usuarios.map((u) => [u.id, u.fullName]));

    // Semanas (lunes) del periodo, de la más vieja a la más nueva.
    const semanas: string[] = [];
    for (let s = lunesDe(r.desdeStr); s <= r.hastaStr; s = sumarDiasStr(s, 7)) semanas.push(s);

    const filas = new Map<number, { actividades: number; cambios: number; porSemana: Record<string, number> }>();
    const fila = (id: number) => {
      let f = filas.get(id);
      if (!f) {
        f = { actividades: 0, cambios: 0, porSemana: Object.fromEntries(semanas.map((s) => [s, 0])) };
        filas.set(id, f);
      }
      return f;
    };
    for (const x of actividades) {
      const f = fila(x.createdBy);
      f.actividades++;
      const s = lunesDe(dia(x.createdAt));
      if (s in f.porSemana) f.porSemana[s]++;
    }
    for (const x of cambios) {
      const f = fila(x.changedBy);
      f.cambios++;
      const s = lunesDe(dia(x.createdAt));
      if (s in f.porSemana) f.porSemana[s]++;
    }
    return {
      periodo: { desde: r.desdeStr, hasta: r.hastaStr },
      semanas,
      vendedores: [...filas.entries()]
        .map(([id, f]) => ({
          id,
          nombre: nombre.get(id) ?? `Usuario ${id}`,
          ...f,
          total: f.actividades + f.cambios,
        }))
        .sort((p, q) => q.total - p.total),
    };
  }

  // ---------------------------------------------------------------------
  // Embudo de marketing por canal, campaña o landing (2026-10-08)
  // ---------------------------------------------------------------------

  // Leads -> Cotizaron -> Contrataron, con los mismos nombres del panel de
  // Google Ads. «Interacciones» (las visitas a la página) no existe en el CRM:
  // solo lo ve Google. Un lead cuenta como cualificado/convertido según la
  // oportunidad a la que pasó (ver ventas-marketing.util.ts).
  async marketing(
    companyId: number | null,
    a: AlcanceAnalitica,
    agrupar: string | undefined,
    desdeRaw?: string,
    hastaRaw?: string,
    canal?: string,
  ) {
    const cid = this.requireCompany(companyId);
    const r = this.rango(desdeRaw, hastaRaw, 90);
    const vend = this.vendedor(a);
    const campo: 'channel' | 'campaign' | 'landing' =
      agrupar === 'campana' ? 'campaign' : agrupar === 'landing' ? 'landing' : 'channel';
    const leads = await this.prisma.salesLead.findMany({
      where: {
        companyId: cid,
        createdAt: { gte: r.desde, lte: r.hastaFin },
        ...(canal ? { channel: canal } : {}),
        // Un lead de servicio es el que cuenta para marketing; spam, empleo y
        // proveedores no son clientes potenciales.
        OR: [{ contactReason: null }, { contactReason: 'SERVICIO' }],
        ...(vend !== null ? { assignedUserId: vend } : {}),
      },
      select: {
        channel: true,
        campaign: true,
        extra: true,
        convertedOpportunityId: true,
      },
    });
    const idsOpp = [
      ...new Set(leads.map((l) => l.convertedOpportunityId).filter((x): x is number => x !== null)),
    ];
    const opps = idsOpp.length
      ? await this.prisma.salesOpportunity.findMany({
          where: { companyId: cid, id: { in: idsOpp } },
          select: {
            id: true,
            outcome: true,
            status: true,
            quotedAt: true,
            stageChanges: { select: { toStatus: true } },
          },
        })
      : [];
    const fasePorOpp = new Map(
      opps.map((o) => [
        o.id,
        faseMarketing({
          outcome: o.outcome,
          status: o.status,
          quotedAt: o.quotedAt,
          etapasAlcanzadas: o.stageChanges.map((c) => c.toStatus),
        }),
      ]),
    );
    const filasLead: LeadParaEmbudo[] = leads.map((l) => ({
      channel: l.channel,
      campaign: l.campaign,
      landing: ((l.extra ?? {}) as Record<string, unknown>)['landing']?.toString() ?? null,
      fase: l.convertedOpportunityId !== null ? (fasePorOpp.get(l.convertedOpportunityId) ?? null) : null,
    }));
    const resultado = embudoMarketing(filasLead, campo);
    return {
      periodo: { desde: r.desdeStr, hasta: r.hastaStr },
      agrupadoPor: campo === 'campaign' ? 'campana' : campo,
      ...resultado,
    };
  }
}
