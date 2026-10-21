import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { calcularEstadoContrato, type EstadoContrato } from '../ventas/agreement-status.util';
import { ETIQUETA_CICLO, type CicloVida } from '../ventas/client-lifecycle.util';
import { VentasAnaliticaService, type AlcanceAnalitica } from '../ventas/ventas-analitica.service';
import { VentasExpedienteService } from '../ventas/ventas-expediente.service';
import { ETIQUETA_KIND, type MotivoKind } from '../ventas/ventas-motivos.service';
import { diaHoyEcuador, formatoDia, normalizar } from './ai-ventas.queries';

// Consultas de INVESTIGACIÓN del Agente de Ventas (2026-10-07). Igual que las de
// ai-ventas.queries.ts devuelven texto plano que el modelo redacta, pero estas
// están hechas para explicar qué pasó: cada hecho trae su fecha y, cuando sale de
// un registro concreto, su marca de evidencia ([#tipo:id]) que después se verifica.
// Todo está acotado por empresa; quien no es ADMIN/MANAGER solo ve las cifras de
// sus propios clientes (misma regla que el tablero).

const MAX_LINEAS = 15;
const DIA_MS = 24 * 60 * 60 * 1000;

const ETIQUETA_ESTADO: Record<EstadoContrato, string> = {
  POR_INICIAR: 'por iniciar',
  VIGENTE: 'vigente',
  POR_VENCER: 'por vencer',
  VENCIDO: 'vencido',
  RENOVADO: 'renovado',
  CANCELADO: 'cancelado',
  POR_ENTREGAR: 'por entregar',
  ENTREGADO: 'entregado',
};

const dinero = (v: number | null | undefined) =>
  v === null || v === undefined
    ? 'sin valor registrado'
    : `$${v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const mas = (total: number, mostradas: number) =>
  total > mostradas ? `\n…y ${total - mostradas} más (se muestran los primeros ${mostradas}).` : '';

// Periodos que acepta el modelo para perdidos y embudo. Cualquier otra cosa = por defecto.
export function rangoInvestigacion(
  param: string | undefined,
  porDefectoDias: number,
  hoy: string,
): { desde: string; hasta: string; etiqueta: string } {
  const p = normalizar(param || '').replace(/\s+/g, '_');
  const d = new Date(`${hoy}T00:00:00.000Z`);
  const dia = (x: Date) => x.toISOString().slice(0, 10);
  if (p === 'mes') return { desde: `${hoy.slice(0, 8)}01`, hasta: hoy, etiqueta: 'este mes' };
  if (p === 'mes_pasado') {
    const ini = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 1, 1));
    const fin = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 0));
    return { desde: dia(ini), hasta: dia(fin), etiqueta: 'el mes pasado' };
  }
  const n = ['90', '180', '365'].includes(p) ? Number(p) : porDefectoDias;
  return {
    desde: dia(new Date(d.getTime() - (n - 1) * DIA_MS)),
    hasta: hoy,
    etiqueta: `los últimos ${n} días`,
  };
}

@Injectable()
export class AiVentasInvestigacionQueries {
  constructor(
    private readonly prisma: PrismaService,
    private readonly analitica: VentasAnaliticaService,
    private readonly expedientes: VentasExpedienteService,
  ) {}

  private async alcance(userId: number): Promise<AlcanceAnalitica> {
    const u = await this.prisma.user.findUnique({ where: { id: userId }, select: { role: true } });
    return { userId, role: u?.role ?? 'EMPLOYEE', alcance: 'all' };
  }

  // ---- investigar a un cliente ----
  async expediente(companyId: number, cliente?: string): Promise<string> {
    if (!cliente) {
      return 'Indica de qué cliente quieres el expediente (parte de su nombre o su RUC).';
    }
    return (await this.expedientes.armar(companyId, cliente)).texto;
  }

  // Expediente de un cliente que ya se conoce por su id (botón «Preguntar al agente» de la ficha).
  async expedientePorId(companyId: number, clienteId: number): Promise<string> {
    return (await this.expedientes.armarPorId(companyId, clienteId)).texto;
  }

  // ---- cartera ----
  async cartera(companyId: number, userId: number): Promise<string> {
    const a = await this.alcance(userId);
    const c = await this.analitica.cartera(companyId, a);
    const ciclo = c.ciclo;
    const lineas: string[] = [
      `Cartera al ${formatoDia(c.hoy)}${a.role === 'ADMIN' || a.role === 'MANAGER' ? '' : ' (solo tus clientes)'}:`,
      `- Clientes por ciclo de vida: ${(['PROSPECTO', 'CLIENTE', 'EN_RIESGO', 'EX_CLIENTE', 'PERDIDO'] as CicloVida[])
        .map((k) => `${ETIQUETA_CICLO[k]} ${ciclo[k]}`)
        .join(', ')} (total ${ciclo.total}).`,
      `- Contratos: ${c.contratos.vigentes} vigentes (${c.contratos.porVencer} por vencer), ${c.contratos.vencidosSinRenovar} vencidos sin renovar, ${c.contratos.cancelados} cancelados.`,
      `- Valor mensual de los contratos en curso: ${dinero(c.contratos.valorMensualVigente)}${c.contratos.sinValor ? ` (${c.contratos.sinValor} contratos sin valor registrado no suman)` : ''}.`,
      `- Renovaciones próximas: ${c.renovaciones.d30} en 30 días, ${c.renovaciones.d60} en 60, ${c.renovaciones.d90} en 90.`,
    ];
    for (const r of c.renovaciones.proximas.slice(0, 5)) {
      lineas.push(`   · ${r.cliente} — vence el ${formatoDia(r.fin)} (en ${r.dias} días) — ${dinero(r.valorMensual)} [#contrato:${r.id}]`);
    }
    if (c.vencidos.length) {
      lineas.push(`- Vencidos sin renovar (${c.vencidos.length}):`);
      for (const v of c.vencidos.slice(0, 8)) {
        lineas.push(
          `   · ${v.cliente} — venció el ${formatoDia(v.fin)} (hace ${v.diasVencido} días, ${v.enGracia ? 'dentro de la gracia' : 'ya pasó la gracia'}) — ${v.motivoCierre ? `motivo: ${v.motivoCierre}` : 'sin motivo registrado'} [#contrato:${v.id}]`,
        );
      }
    }
    if (c.servicios.masContratados.length) {
      lineas.push(`- Servicios más contratados: ${c.servicios.masContratados.slice(0, 5).map((s) => `${s.servicio} (${s.contratos})`).join(', ')}.`);
    }
    lineas.push(`- Venta cruzada: ${c.servicios.clientesConUnServicio} clientes con un solo servicio y ${c.servicios.clientesConVarios} con varios.`);
    lineas.push(`- Contratos renovados con menos servicios o menor valor en los últimos 90 días: ${c.reducciones.ultimos90Dias}.`);
    for (const r of c.reducciones.recientes.slice(0, 5)) {
      lineas.push(`   · ${formatoDia(r.fecha)} ${r.cliente} — ${r.motivo}${r.source ? ` (${r.source === 'CLIENTE' ? 'lo dijo el cliente' : 'suposición del vendedor'})` : ''}`);
    }
    lineas.push(`- Clientes que dejaron de estar cubiertos este mes: ${c.bajasDelMes.total}${c.bajasDelMes.clientes.length ? ` (${c.bajasDelMes.clientes.slice(0, 5).map((b) => b.cliente).join(', ')})` : ''}.`);
    return lineas.join('\n');
  }

  // ---- lo que se perdió en un periodo ----
  async perdidos(companyId: number, userId: number, rangoParam?: string): Promise<string> {
    const a = await this.alcance(userId);
    const r = rangoInvestigacion(rangoParam, 90, diaHoyEcuador());
    const m = await this.analitica.motivos(companyId, a, r.desde, r.hasta);
    const privilegiado = a.role === 'ADMIN' || a.role === 'MANAGER';
    const propios = privilegiado
      ? null
      : (await this.prisma.salesClient.findMany({ where: { companyId, assignedUserId: userId }, select: { id: true } })).map((c) => c.id);
    const entradas = await this.prisma.salesReasonEntry.findMany({
      where: {
        companyId,
        kind: { in: ['OPP_PERDIDA', 'CONTRATO_CANCELADO', 'CONTRATO_NO_RENOVADO', 'CONTRATO_REDUCCION'] },
        createdAt: { gte: new Date(`${r.desde}T00:00:00.000Z`), lte: new Date(`${r.hasta}T23:59:59.999Z`) },
        ...(propios ? { salesClientId: { in: propios } } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: MAX_LINEAS,
    });
    const nombres = new Map(
      (await this.prisma.salesClient.findMany({
        where: { companyId, id: { in: entradas.map((e) => e.salesClientId).filter((x): x is number => !!x) } },
        select: { id: true, name: true },
      })).map((c) => [c.id, c.name]),
    );
    const total = m.porCierre
      .filter((k) => k.kind !== 'LEAD_DESCARTE')
      .reduce((s, k) => s + k.total, 0);
    if (total === 0) {
      return `No hay pérdidas registradas ${r.etiqueta} (del ${formatoDia(r.desde)} al ${formatoDia(r.hasta)}). Ojo: solo cuentan las que tienen su motivo registrado desde que se empezó a pedirlo.`;
    }
    const lineas: string[] = [`Pérdidas de ${r.etiqueta} (del ${formatoDia(r.desde)} al ${formatoDia(r.hasta)}): ${total} registradas.`];
    for (const k of m.porCierre.filter((x) => x.kind !== 'LEAD_DESCARTE' && x.total > 0)) {
      lineas.push(
        `- ${ETIQUETA_KIND[k.kind as MotivoKind]}: ${k.total} — ${k.items.slice(0, 4).map((i) => `${i.label} ${i.count} (${i.pct}%)`).join(', ')}. De esos, ${k.sinInformacionPct}% sin información y ${k.segunVendedorPct}% según el vendedor (suposición, no confirmada por el cliente).`,
      );
    }
    lineas.push('Detalle más reciente:');
    for (const e of entradas) {
      lineas.push(
        `- ${formatoDia(e.createdAt)} ${e.salesClientId ? (nombres.get(e.salesClientId) ?? 'cliente') : 'cliente'} — ${ETIQUETA_KIND[e.kind as MotivoKind]}: ${e.reasonLabel}${e.source ? ` (${e.source === 'CLIENTE' ? 'lo dijo el cliente' : 'suposición del vendedor'})` : ''}${e.comment ? ` — «${e.comment.slice(0, 120)}»` : ''} [#motivo:${e.id}]`,
      );
    }
    return lineas.join('\n') + mas(total, entradas.length);
  }

  // ---- embudo y velocidad ----
  async embudo(companyId: number, userId: number, rangoParam?: string): Promise<string> {
    const a = await this.alcance(userId);
    const r = rangoInvestigacion(rangoParam, 90, diaHoyEcuador());
    const e = await this.analitica.embudo(companyId, a, r.desde, r.hasta);
    if (e.oportunidades === 0) return `No hubo oportunidades nuevas ${r.etiqueta}.`;
    const poca = (n: number, pocas: boolean) => (pocas ? ` (pocas muestras: n=${n})` : ` (n=${n})`);
    const v = e.velocidad;
    const f = (x: { mediana: number | null; p75: number | null; n: number; pocasMuestras: boolean }) =>
      x.mediana === null ? 'sin datos' : `mediana ${x.mediana} días, el 75% en ${x.p75} o menos${poca(x.n, x.pocasMuestras)}`;
    return [
      `Embudo de ${r.etiqueta} (${e.oportunidades} oportunidades nuevas):`,
      ...e.conversion.map((p) =>
        p.tasa === null
          ? `- ${p.etiqueta}: ${p.alcanzaron} llegaron.`
          : `- ${p.etiqueta}: ${p.alcanzaron} llegaron, ${p.convirtieron} pasaron a la siguiente (${p.tasa}%).`,
      ),
      `Velocidad de respuesta (de llegar a la primera revisión): ${f(v.respuestaDias)}.`,
      `Velocidad de cotización (de llegar a cotizar): ${f(v.cotizacionDias)}.`,
      `Duración del ciclo hasta aceptar: ${f(v.cicloDias)}.`,
      `Cobertura: los tiempos se midieron en ${e.cobertura.medidas} de ${e.cobertura.de} oportunidades; el historial de etapas solo existe desde el ${formatoDia(e.cobertura.historialDesde)}.`,
    ].join('\n');
  }

  // ---- contratos comerciales ----
  async contratos(companyId: number, estadoParam?: string): Promise<string> {
    const e = normalizar(estadoParam || '').replace(/\s+/g, '_');
    const mapa: Record<string, EstadoContrato> = {
      vigente: 'VIGENTE',
      vigentes: 'VIGENTE',
      por_vencer: 'POR_VENCER',
      vencido: 'VENCIDO',
      vencidos: 'VENCIDO',
      cancelado: 'CANCELADO',
      cancelados: 'CANCELADO',
      renovado: 'RENOVADO',
      renovados: 'RENOVADO',
      por_iniciar: 'POR_INICIAR',
      por_entregar: 'POR_ENTREGAR',
      entregado: 'ENTREGADO',
      entregados: 'ENTREGADO',
    };
    if (estadoParam && !mapa[e]) {
      return `El estado "${estadoParam}" no es válido: usa vigente, por_vencer, vencido, cancelado, renovado, por_entregar o entregado.`;
    }
    const filas = await this.prisma.salesAgreement.findMany({
      where: { companyId },
      include: {
        salesClient: { select: { name: true } },
        services: { include: { service: { select: { name: true } } } },
      },
      orderBy: [{ endDate: 'asc' }, { id: 'asc' }],
    });
    const conEstado = filas.map((c) => ({ c, estado: calcularEstadoContrato(c) }));
    const sel = mapa[e] ? conEstado.filter((x) => x.estado === mapa[e]) : conEstado;
    if (sel.length === 0) return mapa[e] ? `No hay contratos ${ETIQUETA_ESTADO[mapa[e]]}s.` : 'No hay contratos registrados.';
    const lineas = sel.slice(0, MAX_LINEAS).map(
      ({ c, estado }) =>
        c.kind === 'PRODUCTO'
          ? `- ${c.salesClient.name}${c.title ? ` · ${c.title}` : ''} · VENTA DE PRODUCTO (única, no se renueva) · ${ETIQUETA_ESTADO[estado]} · vendido el ${formatoDia(c.startDate)} · ${c.services.map((s) => s.service.name).join(', ') || 'sin productos'} · valor total ${dinero(c.totalValue === null ? null : Number(c.totalValue))}${c.warrantyUntil ? ` · garantía hasta ${formatoDia(c.warrantyUntil)}` : ''} [#contrato:${c.id}]`
          : `- ${c.salesClient.name}${c.title ? ` · ${c.title}` : ''} · ${ETIQUETA_ESTADO[estado]} · ${formatoDia(c.startDate)} a ${c.endDate ? formatoDia(c.endDate) : 'sin fin'} · ${c.services.map((s) => s.service.name).join(', ') || 'sin servicios'} · ${dinero(c.monthlyValue === null ? null : Number(c.monthlyValue))} [#contrato:${c.id}]`,
    );
    const porEstado = (Object.keys(ETIQUETA_ESTADO) as EstadoContrato[])
      .map((k) => `${ETIQUETA_ESTADO[k]}: ${conEstado.filter((x) => x.estado === k).length}`)
      .join(', ');
    return `Contratos ${mapa[e] ? ETIQUETA_ESTADO[mapa[e]] + 's' : '(todos)'}: ${sel.length}.\nPor estado: ${porEstado}.\n${lineas.join('\n')}${mas(sel.length, MAX_LINEAS)}`;
  }
}
