import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

export interface HistorialPedido {
  /** Identifica la fila en la pantalla; se devuelve tal cual para casar el resultado. */
  fila: string;
  leadId?: number | null;
  oportunidadId?: number | null;
  clienteId?: number | null;
}

interface Evento {
  fecha: Date;
  texto: string;
}

const TIPO_ACTIVIDAD: Record<string, string> = {
  NOTA: 'Nota',
  LLAMADA: 'Llamada',
  REUNION: 'Reunión',
  CORREO: 'Correo',
};

const KIND_MOTIVO: Record<string, string> = {
  LEAD_DESCARTE: 'Descartado',
  OPP_PERDIDA: 'Perdida',
  CONTRATO_CANCELADO: 'Contrato cancelado',
  CONTRATO_REDUCCION: 'Contrato reducido',
  CONTRATO_NO_RENOVADO: 'Contrato no renovado',
};

const dia = (d: Date) => {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`;
};

// Una línea por hecho, en orden cronológico: «27/10/2026 · Llamada (Ana): texto».
export function formatearHistorial(eventos: Evento[]): string {
  return [...eventos]
    .sort((a, b) => a.fecha.getTime() - b.fecha.getTime())
    .map((e) => `${dia(e.fecha)} · ${e.texto}`)
    .join('\n');
}

/**
 * Arma, para una lista de filas de cualquier tabla de Ventas, el texto de su
 * historial con lo importante que se hizo: cambios de etapa (con su nota),
 * motivos de cierre, notas, llamadas, reuniones y correos de la ficha. Es la
 * columna «Historial» del exportador (ExportTableButton).
 *
 * Qué entra según lo que la fila sepa de sí misma:
 *  - oportunidad: sus cambios de etapa, su nota y sus motivos de cierre;
 *  - posible cliente: su motivo de descarte, y lo de la oportunidad y la
 *    empresa o persona a la que se convirtió;
 *  - empresa o persona (clienteId): las notas, llamadas, reuniones y correos
 *    que el equipo anotó en su ficha. Son del cliente, no de una oportunidad.
 */
@Injectable()
export class VentasHistorialExportService {
  constructor(private readonly prisma: PrismaService) {}

  async historiales(companyId: number | null, pedidos: HistorialPedido[]): Promise<Record<string, string>> {
    if (!companyId) throw new BadRequestException('Se requiere una empresa');
    const cid = companyId;

    const unicos = (xs: (number | null | undefined)[]) => [...new Set(xs.filter((x): x is number => !!x))];
    const oppIds = unicos(pedidos.map((p) => p.oportunidadId));
    const clienteIds = unicos(pedidos.map((p) => p.clienteId));
    const leadIds = unicos(pedidos.map((p) => p.leadId));

    const [cambios, motivos, actividades, oportunidades, etapas, usuarios] = await Promise.all([
      oppIds.length
        ? this.prisma.salesOpportunityStageChange.findMany({
            where: { companyId: cid, opportunityId: { in: oppIds } },
            select: { opportunityId: true, fromStatus: true, toStatus: true, notes: true, changedBy: true, createdAt: true },
          })
        : [],
      oppIds.length || leadIds.length
        ? this.prisma.salesReasonEntry.findMany({
            where: {
              companyId: cid,
              OR: [
                ...(oppIds.length ? [{ opportunityId: { in: oppIds } }] : []),
                ...(leadIds.length ? [{ leadId: { in: leadIds } }] : []),
              ],
            },
            select: { opportunityId: true, leadId: true, kind: true, reasonLabel: true, comment: true, createdBy: true, createdAt: true },
          })
        : [],
      clienteIds.length
        ? this.prisma.salesClientActivity.findMany({
            where: { companyId: cid, salesClientId: { in: clienteIds } },
            select: { salesClientId: true, type: true, otherLabel: true, text: true, createdBy: true, createdAt: true },
          })
        : [],
      oppIds.length
        ? this.prisma.salesOpportunity.findMany({
            where: { companyId: cid, id: { in: oppIds } },
            select: { id: true, notes: true, createdAt: true },
          })
        : [],
      this.prisma.salesClientStage.findMany({ where: { companyId: cid }, select: { key: true, label: true } }),
      this.prisma.user.findMany({ where: { companyId: cid }, select: { id: true, fullName: true } }),
    ]);

    const etapa = new Map(etapas.map((e) => [e.key, e.label]));
    const nombreEtapa = (k?: string | null) => (k ? etapa.get(k) ?? k : 'sin etapa');
    const quien = new Map(usuarios.map((u) => [u.id, u.fullName]));
    const por = (id: number) => (quien.get(id) ? ` (${quien.get(id)})` : '');

    const agrupar = <T>(filas: T[], clave: (f: T) => number | null | undefined) => {
      const m = new Map<number, T[]>();
      for (const f of filas) {
        const k = clave(f);
        if (k) m.set(k, [...(m.get(k) ?? []), f]);
      }
      return m;
    };
    const cambiosDe = agrupar(cambios, (c) => c.opportunityId);
    const motivosDeOpp = agrupar(motivos, (m) => m.opportunityId);
    const motivosDeLead = agrupar(motivos, (m) => m.leadId);
    const actividadesDe = agrupar(actividades, (a) => a.salesClientId);
    const notaDeOpp = new Map(oportunidades.map((o) => [o.id, o]));

    const eventosDeOpp = (id: number): Evento[] => {
      const out: Evento[] = [];
      for (const c of cambiosDe.get(id) ?? []) {
        out.push({
          fecha: c.createdAt,
          texto: `Cambio de etapa: ${nombreEtapa(c.fromStatus)} → ${nombreEtapa(c.toStatus)}${por(c.changedBy)}${c.notes ? ` — ${c.notes}` : ''}`,
        });
      }
      for (const m of motivosDeOpp.get(id) ?? []) out.push(eventoMotivo(m, por));
      const o = notaDeOpp.get(id);
      if (o?.notes) out.push({ fecha: o.createdAt, texto: `Nota de la oportunidad: ${o.notes}` });
      return out;
    };
    const eventosDeCliente = (id: number): Evento[] =>
      (actividadesDe.get(id) ?? []).map((a) => ({
        fecha: a.createdAt,
        texto: `${a.type === 'OTRO' ? a.otherLabel || 'Otro' : TIPO_ACTIVIDAD[a.type] ?? a.type}${por(a.createdBy)}: ${a.text}`,
      }));

    const resultado: Record<string, string> = {};
    for (const p of pedidos) {
      const eventos: Evento[] = [];
      if (p.oportunidadId) eventos.push(...eventosDeOpp(p.oportunidadId));
      if (p.leadId) for (const m of motivosDeLead.get(p.leadId) ?? []) eventos.push(eventoMotivo(m, por));
      if (p.clienteId) eventos.push(...eventosDeCliente(p.clienteId));
      resultado[p.fila] = formatearHistorial(eventos);
    }
    return resultado;
  }
}

function eventoMotivo(
  m: { kind: string; reasonLabel: string; comment: string | null; createdBy: number; createdAt: Date },
  por: (id: number) => string,
): Evento {
  return {
    fecha: m.createdAt,
    texto: `${KIND_MOTIVO[m.kind] ?? 'Cierre'}: ${m.reasonLabel}${por(m.createdBy)}${m.comment ? ` — ${m.comment}` : ''}`,
  };
}
