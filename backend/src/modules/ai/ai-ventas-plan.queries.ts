import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { hoyEcuador } from '../ventas/agreement-status.util';
import { VentasCicloService } from '../ventas/ventas-ciclo.service';
import { ETIQUETA_KIND, type MotivoKind } from '../ventas/ventas-motivos.service';
import { formatoDia } from './ai-ventas.queries';

// Consultas del Agente de Ventas pensadas para DECIDIR qué hacer (2026-10-18), no solo para
// contar: el plan del día y los inactivos a recuperar. Igual que las demás devuelven texto plano
// con marcas de evidencia ([#opp:id], [#contrato:id], [#lead:id], [#motivo:id]) que después se
// verifican, y dicen «no consta» cuando falta un dato. Todo acotado por empresa.

const DIA_MS = 24 * 60 * 60 * 1000;
const MAX_POR_GRUPO = 6;
const MAX_INACTIVOS = 10;

// Umbrales (en días). Los de «estancada» y «sin atender» son los mismos que ya usa el Dashboard y la
// bandeja de Posibles clientes: no se inventan reglas nuevas.
const DIAS_ESTANCADA = 7;
const DIAS_COTIZADA_SIN_RESPUESTA = 7;
const DIAS_NUEVA_SIN_TOCAR = 2;
const DIAS_LEAD_SIN_ATENDER = 2;
const DIAS_AVISO_RENOVACION = 30;

const ETAPAS_COTIZADAS = ['COTIZADO', 'NEGOCIACION'];
const ETAPA_INICIAL = 'RECIBIDO';

const dinero = (v: number | null | undefined) =>
  v === null || v === undefined
    ? 'sin valor registrado'
    : `$${v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const diasEntre = (desde: string, hasta: string) =>
  Math.round(
    (Date.parse(`${hasta}T00:00:00.000Z`) - Date.parse(`${desde}T00:00:00.000Z`)) / DIA_MS,
  );
const dia = (d: Date) => d.toISOString().slice(0, 10);
const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;
const mas = (total: number, mostradas: number) =>
  total > mostradas ? `\n   …y ${total - mostradas} más.` : '';

// Qué tan reciente terminó un contrato pesa en el orden de los inactivos: uno de hace 2 meses se
// recupera más fácil que uno de hace 2 años. Exportada para probarla.
export function pesoRecencia(diasDesdeQueTermino: number): number {
  if (diasDesdeQueTermino <= 90) return 1;
  if (diasDesdeQueTermino <= 180) return 0.7;
  if (diasDesdeQueTermino <= 365) return 0.4;
  return 0.2;
}

@Injectable()
export class AiVentasPlanQueries {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ciclos: VentasCicloService,
  ) {}

  // ---------------------------------------------------------------------
  // «¿Qué debo atender hoy?» — plan del día
  // ---------------------------------------------------------------------
  async prioridades(
    companyId: number,
    userId: number,
    alcanceParam?: string,
  ): Promise<string> {
    const hoy = hoyEcuador();
    const usuario = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { role: true, fullName: true },
    });
    const privilegiado = usuario?.role === 'ADMIN' || usuario?.role === 'MANAGER';
    // Solo ADMIN y MANAGER pueden pedir el plan de todo el equipo.
    const equipo = privilegiado && /equipo|todos|todo/i.test(alcanceParam ?? '');

    const [etapas, oportunidades, contratos, renovaciones, leads] = await Promise.all([
      this.prisma.salesClientStage.findMany({
        where: { companyId },
        select: { key: true, label: true },
      }),
      this.prisma.salesOpportunity.findMany({
        where: { companyId, closedAt: null, ...(equipo ? {} : { assignedUserId: userId }) },
        include: {
          salesClient: { select: { id: true, name: true, nextActionText: true, nextActionDate: true } },
          services: { include: { service: { select: { name: true } } } },
          stageChanges: { orderBy: { createdAt: 'desc' }, take: 1, select: { createdAt: true } },
        },
      }),
      this.prisma.salesAgreement.findMany({
        where: { companyId, kind: 'SERVICIO', status: 'ACTIVO', endDate: { not: null } },
        include: { salesClient: { select: { name: true } } },
        orderBy: [{ endDate: 'asc' }, { id: 'asc' }],
      }),
      this.prisma.salesOpportunity.findMany({
        where: { companyId, renewsAgreementId: { not: null } },
        select: { id: true, renewsAgreementId: true, assignedUserId: true, closedAt: true, outcome: true },
      }),
      this.prisma.salesLead.findMany({
        where: { companyId, status: 'NUEVO', assignedUserId: null },
        orderBy: { createdAt: 'asc' },
        select: { id: true, name: true, companyName: true, channel: true, createdAt: true, contactReason: true },
      }),
    ]);
    const etiquetaEtapa = new Map(etapas.map((e) => [e.key, e.label]));

    const lineas: string[] = [
      `Plan del día al ${formatoDia(hoy)} ${equipo ? 'para TODO el equipo' : `para ${usuario?.fullName ?? 'ti'} (sus oportunidades abiertas)`}.`,
    ];

    // ---- oportunidades abiertas, clasificadas ----
    const fila = oportunidades.map((o) => {
      const desde = o.stageChanges[0]?.createdAt ?? o.receivedAt;
      return {
        o,
        // Instante en UTC: se pasa al día de Ecuador (de noche ya es «mañana» en UTC).
        diasEnEtapa: Math.max(0, diasEntre(hoyEcuador(desde), hoy)),
        etapa: o.status ? (etiquetaEtapa.get(o.status) ?? o.status) : 'sin etapa',
        servicios: o.services.map((s) => s.service.name).join(', ') || 'sin servicios',
      };
    });
    const describir = (f: (typeof fila)[number], extra = '') =>
      `   · ${f.o.salesClient.name}${f.o.title ? ` — ${f.o.title}` : ''} (${f.servicios}) — etapa ${f.etapa}, ${plural(f.diasEnEtapa, 'día', 'días')} en esta etapa${f.o.quotedAmount !== null ? ` — cotizada en ${dinero(Number(f.o.quotedAmount))}` : ''}${extra} [#opp:${f.o.id}]`;

    // Seguimiento (siguiente paso guardado en el cliente): una sola línea por cliente.
    const vistosSeguimiento = new Set<number>();
    const seguimientos = fila
      .filter((f) => {
        const fecha = f.o.salesClient.nextActionDate;
        if (!fecha || vistosSeguimiento.has(f.o.salesClientId)) return false;
        vistosSeguimiento.add(f.o.salesClientId);
        return true;
      })
      .map((f) => ({ f, fecha: dia(f.o.salesClient.nextActionDate!) }));
    const vencidos = seguimientos.filter((s) => s.fecha < hoy).sort((a, b) => a.fecha.localeCompare(b.fecha));
    const paraHoy = seguimientos.filter((s) => s.fecha === hoy);
    const textoPaso = (s: (typeof seguimientos)[number]) =>
      ` — siguiente paso: ${s.f.o.salesClient.nextActionText || 'sin texto'} (para el ${formatoDia(s.fecha)})`;

    lineas.push(`1) SEGUIMIENTOS VENCIDOS (${vencidos.length}):`);
    if (vencidos.length === 0) lineas.push('   Ninguno.');
    for (const s of vencidos.slice(0, MAX_POR_GRUPO)) {
      lineas.push(describir(s.f, textoPaso(s) + `, vencido hace ${plural(diasEntre(s.fecha, hoy), 'día', 'días')}`));
    }
    lineas.push(mas(vencidos.length, MAX_POR_GRUPO).replace(/^\n/, ''));
    lineas.push(`2) SEGUIMIENTOS PARA HOY (${paraHoy.length}):`);
    if (paraHoy.length === 0) lineas.push('   Ninguno.');
    for (const s of paraHoy.slice(0, MAX_POR_GRUPO)) lineas.push(describir(s.f, textoPaso(s)));

    const yaListadas = new Set([...vencidos, ...paraHoy].map((s) => s.f.o.id));
    const sinTocar = fila
      .filter((f) => f.o.status === ETAPA_INICIAL && f.diasEnEtapa >= DIAS_NUEVA_SIN_TOCAR && !yaListadas.has(f.o.id))
      .sort((a, b) => b.diasEnEtapa - a.diasEnEtapa);
    lineas.push(`3) OPORTUNIDADES NUEVAS SIN TOCAR (${sinTocar.length}; ${DIAS_NUEVA_SIN_TOCAR} días o más en la etapa inicial):`);
    if (sinTocar.length === 0) lineas.push('   Ninguna.');
    for (const f of sinTocar.slice(0, MAX_POR_GRUPO)) lineas.push(describir(f));
    if (sinTocar.length > MAX_POR_GRUPO) lineas.push(mas(sinTocar.length, MAX_POR_GRUPO).replace(/^\n/, ''));

    const cotizadas = fila
      .filter(
        (f) =>
          f.o.status &&
          ETAPAS_COTIZADAS.includes(f.o.status) &&
          f.diasEnEtapa >= DIAS_COTIZADA_SIN_RESPUESTA &&
          !yaListadas.has(f.o.id),
      )
      .sort((a, b) => b.diasEnEtapa - a.diasEnEtapa);
    lineas.push(`4) COTIZADAS SIN RESPUESTA (${cotizadas.length}; ${DIAS_COTIZADA_SIN_RESPUESTA} días o más sin cambiar de etapa):`);
    if (cotizadas.length === 0) lineas.push('   Ninguna.');
    for (const f of cotizadas.slice(0, MAX_POR_GRUPO)) lineas.push(describir(f));
    if (cotizadas.length > MAX_POR_GRUPO) lineas.push(mas(cotizadas.length, MAX_POR_GRUPO).replace(/^\n/, ''));

    const ya = new Set([...yaListadas, ...sinTocar.map((f) => f.o.id), ...cotizadas.map((f) => f.o.id)]);
    const estancadas = fila
      .filter((f) => f.diasEnEtapa > DIAS_ESTANCADA && !ya.has(f.o.id))
      .sort((a, b) => b.diasEnEtapa - a.diasEnEtapa);
    lineas.push(`5) OTRAS ESTANCADAS (${estancadas.length}; más de ${DIAS_ESTANCADA} días en la misma etapa):`);
    if (estancadas.length === 0) lineas.push('   Ninguna.');
    for (const f of estancadas.slice(0, MAX_POR_GRUPO)) lineas.push(describir(f));
    if (estancadas.length > MAX_POR_GRUPO) lineas.push(mas(estancadas.length, MAX_POR_GRUPO).replace(/^\n/, ''));

    // ---- renovaciones (de todo el equipo: la oportunidad nace sin responsable) ----
    const limite = dia(new Date(Date.parse(`${hoy}T00:00:00.000Z`) + DIAS_AVISO_RENOVACION * DIA_MS));
    const renovacionDe = new Map<number, (typeof renovaciones)[number]>();
    for (const r of renovaciones) {
      if (r.renewsAgreementId !== null) renovacionDe.set(r.renewsAgreementId, r);
    }
    const porRenovar = contratos
      .map((c) => ({ c, fin: dia(c.endDate!) }))
      .filter(({ c, fin }) => fin <= limite && Date.parse(`${hoy}T00:00:00.000Z`) <= Date.parse(`${fin}T00:00:00.000Z`) + c.graceDays * DIA_MS)
      .sort((a, b) => a.fin.localeCompare(b.fin));
    lineas.push(`6) RENOVACIONES POR ATENDER (${porRenovar.length}; contratos que terminan en ${DIAS_AVISO_RENOVACION} días o menos, o ya vencidos dentro de su gracia):`);
    if (porRenovar.length === 0) lineas.push('   Ninguna.');
    for (const { c, fin } of porRenovar.slice(0, MAX_POR_GRUPO + 2)) {
      const dias = diasEntre(hoy, fin);
      const cuando = dias > 0 ? `termina el ${formatoDia(fin)} (en ${plural(dias, 'día', 'días')})` : dias === 0 ? `termina hoy` : `terminó el ${formatoDia(fin)} (hace ${plural(-dias, 'día', 'días')}, sigue en gracia)`;
      const r = renovacionDe.get(c.id);
      const estado = !r
        ? 'todavía no tiene oportunidad de renovación'
        : r.closedAt
          ? `su oportunidad de renovación ya se cerró (${r.outcome === 'GANADA' ? 'aceptada' : 'perdida'})`
          : `oportunidad de renovación abierta, ${r.assignedUserId ? (r.assignedUserId === userId ? 'a tu nombre' : 'con responsable') : 'SIN responsable'}`;
      lineas.push(
        `   · ${c.salesClient.name} — ${c.title ?? 'contrato sin título'} — ${cuando} — ${dinero(c.monthlyValue === null ? null : Number(c.monthlyValue))} — ${estado} [#contrato:${c.id}]${r ? ` [#opp:${r.id}]` : ''}`,
      );
    }
    if (porRenovar.length > MAX_POR_GRUPO + 2) lineas.push(mas(porRenovar.length, MAX_POR_GRUPO + 2).replace(/^\n/, ''));

    // ---- bandeja de posibles clientes ----
    const sinAtender = leads
      .map((l) => ({ l, dias: diasEntre(hoyEcuador(l.createdAt), hoy) }))
      .filter((x) => x.dias >= DIAS_LEAD_SIN_ATENDER);
    lineas.push(`7) POSIBLES CLIENTES SIN ATENDER (${sinAtender.length}; sin asignar y con ${DIAS_LEAD_SIN_ATENDER} días o más):`);
    if (sinAtender.length === 0) lineas.push('   Ninguno.');
    for (const { l, dias } of sinAtender.slice(0, MAX_POR_GRUPO)) {
      lineas.push(`   · ${l.companyName || l.name} — llegó por ${l.channel} hace ${plural(dias, 'día', 'días')}${l.contactReason ? ` — tipo ${l.contactReason}` : ' — sin clasificar'} [#lead:${l.id}]`);
    }
    if (sinAtender.length > MAX_POR_GRUPO) lineas.push(mas(sinAtender.length, MAX_POR_GRUPO).replace(/^\n/, ''));

    lineas.push(
      'Lo que NO consta: el sistema no registra las llamadas o mensajes que no se hayan anotado en el historial; un cliente "sin tocar" puede haber sido atendido fuera del sistema.',
    );
    return lineas.filter((l) => l !== '').join('\n');
  }

  // ---------------------------------------------------------------------
  // «Recuperar inactivos» — empresas que tuvieron contrato y ya no tienen ninguno
  // ---------------------------------------------------------------------
  async inactivos(companyId: number): Promise<string> {
    const hoy = hoyEcuador();
    const ciclos = await this.ciclos.calcular(companyId);
    const ids = [...ciclos.entries()].filter(([, r]) => r.ciclo === 'EX_CLIENTE').map(([id]) => id);
    if (ids.length === 0) {
      return 'No hay clientes inactivos: ninguna empresa o persona que haya tenido contrato se quedó sin uno vigente.';
    }

    const [clientes, contratos, motivos, actividades, abiertas, incidentes] = await Promise.all([
      this.prisma.salesClient.findMany({
        where: { companyId, id: { in: ids } },
        select: { id: true, name: true, email: true, phone: true },
      }),
      this.prisma.salesAgreement.findMany({
        where: { companyId, salesClientId: { in: ids } },
        include: { services: { include: { service: { select: { name: true } } } } },
        orderBy: [{ startDate: 'asc' }, { id: 'asc' }],
      }),
      this.prisma.salesReasonEntry.findMany({
        where: {
          companyId,
          salesClientId: { in: ids },
          kind: { in: ['CONTRATO_CANCELADO', 'CONTRATO_NO_RENOVADO'] },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.salesClientActivity.groupBy({
        by: ['salesClientId'],
        where: { companyId, salesClientId: { in: ids } },
        _max: { createdAt: true },
        _count: { _all: true },
      }),
      this.prisma.salesOpportunity.findMany({
        where: { companyId, salesClientId: { in: ids }, closedAt: null },
        select: { id: true, salesClientId: true, title: true },
      }),
      this.prisma.salesAgreementIncident.groupBy({
        by: ['agreementId'],
        where: { companyId, type: 'INCIDENTE_SERVICIO', agreement: { salesClientId: { in: ids } } },
        _count: { _all: true },
      }),
    ]);

    const incidentesPorContrato = new Map(incidentes.map((i) => [i.agreementId, i._count._all]));
    const filas = clientes.map((cl) => {
      const suyos = contratos.filter((c) => c.salesClientId === cl.id && c.kind === 'SERVICIO');
      // El último contrato de servicio: el que terminó más tarde (o se canceló).
      const fin = (c: (typeof suyos)[number]) => dia(c.cancelledAt ?? c.endDate ?? c.startDate);
      const ultimo = [...suyos].sort((a, b) => fin(b).localeCompare(fin(a)))[0];
      const terminoEl = ultimo ? fin(ultimo) : null;
      const diasDesde = terminoEl ? Math.max(0, diasEntre(terminoEl, hoy)) : null;
      const valor = ultimo?.monthlyValue != null ? Number(ultimo.monthlyValue) : null;
      const motivo = motivos.find((m) => m.salesClientId === cl.id);
      const act = actividades.find((a) => a.salesClientId === cl.id);
      const nIncidentes = suyos.reduce((s, c) => s + (incidentesPorContrato.get(c.id) ?? 0), 0);
      return {
        cl,
        ultimo,
        terminoEl,
        diasDesde,
        valor,
        motivo,
        ultimaActividad: act?._max.createdAt ?? null,
        nIncidentes,
        abierta: abiertas.find((o) => o.salesClientId === cl.id),
        nContratos: suyos.length,
        puntaje: (valor ?? 0) * pesoRecencia(diasDesde ?? 9999),
      };
    });
    filas.sort((a, b) => b.puntaje - a.puntaje || (a.diasDesde ?? 0) - (b.diasDesde ?? 0));

    const lineas: string[] = [
      `Clientes inactivos (tuvieron contrato de servicio y hoy no tienen ninguno vigente): ${ids.length}.`,
      'Orden sugerido: primero los de mayor valor mensual que terminaron hace menos tiempo (es una guía para empezar, no una regla: un valor «sin registrar» cuenta como cero).',
    ];
    for (const f of filas.slice(0, MAX_INACTIVOS)) {
      const u = f.ultimo;
      const servicios = u ? u.services.map((s) => s.service.name).join(', ') || 'sin servicios' : 'sin contrato de servicio registrado';
      const contacto = [f.cl.phone, f.cl.email].filter(Boolean).join(' · ') || 'sin teléfono ni correo registrados';
      lineas.push(
        `- ${f.cl.name} — ${servicios} — ${u ? (u.cancelledAt ? `se canceló el ${formatoDia(f.terminoEl)}` : `terminó el ${formatoDia(f.terminoEl)}`) : 'sin fecha'}${f.diasDesde !== null ? ` (hace ${plural(f.diasDesde, 'día', 'días')})` : ''} — ${dinero(f.valor)} al mes${u ? ` [#contrato:${u.id}]` : ''}`,
      );
      lineas.push(
        `    · Por qué se fue: ${f.motivo ? `${ETIQUETA_KIND[f.motivo.kind as MotivoKind] ?? f.motivo.kind}: «${f.motivo.reasonLabel}»${f.motivo.source ? ` (${f.motivo.source === 'CLIENTE' ? 'lo dijo el cliente' : 'suposición del vendedor, no confirmada'})` : ' (sin información de quién lo dijo)'}${f.motivo.comment ? ` — «${f.motivo.comment.slice(0, 120)}»` : ''} [#motivo:${f.motivo.id}]` : 'no consta (nadie registró el motivo)'}`,
      );
      lineas.push(
        `    · Último movimiento anotado: ${f.ultimaActividad ? formatoDia(hoyEcuador(f.ultimaActividad)) : 'ninguno'}${f.nIncidentes ? ` · incidentes del servicio registrados: ${f.nIncidentes}` : ''}${f.nContratos > 1 ? ` · contratos de servicio que tuvo: ${f.nContratos}` : ''}`,
      );
      lineas.push(
        `    · ${f.abierta ? `YA hay una oportunidad abierta (se está trabajando) [#opp:${f.abierta.id}]` : 'No hay ninguna oportunidad abierta con él'} · Contacto: ${contacto}`,
      );
    }
    if (filas.length > MAX_INACTIVOS) lineas.push(`…y ${filas.length - MAX_INACTIVOS} inactivos más (se muestran los ${MAX_INACTIVOS} primeros del orden sugerido).`);
    lineas.push(
      'Lo que NO consta: el sistema no sabe si el cliente se fue con otro proveedor ni cuánto pagaba esa competencia; solo lo que se registró en motivos, notas e incidentes.',
    );
    return lineas.join('\n');
  }
}
