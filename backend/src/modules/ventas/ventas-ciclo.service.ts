import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { hoyEcuador } from './agreement-status.util';
import {
  calcularCicloVida,
  type ResultadoCiclo,
} from './client-lifecycle.util';

/**
 * Ciclo de vida de los clientes de una empresa (Prospecto, Cliente, En riesgo,
 * Ex-cliente, Perdido). Reúne los datos de cada cliente en pocas consultas por
 * lote y delega la regla en `calcularCicloVida` (función pura con spec).
 */
@Injectable()
export class VentasCicloService {
  constructor(private readonly prisma: PrismaService) {}

  async calcular(
    companyId: number,
    clientIds?: number[],
    ahora: Date = new Date(),
  ): Promise<Map<number, ResultadoCiclo & { oportunidadesAbiertas: number }>> {
    const filtroCliente = clientIds ? { in: clientIds } : undefined;
    const [clientes, contratos, oportunidades, actividades, cambios, documentos] =
      await Promise.all([
        this.prisma.salesClient.findMany({
          where: { companyId, ...(filtroCliente ? { id: filtroCliente } : {}) },
          select: { id: true, createdAt: true, nextActionDate: true },
        }),
        this.prisma.salesAgreement.findMany({
          where: {
            companyId,
            ...(filtroCliente ? { salesClientId: filtroCliente } : {}),
          },
          select: {
            salesClientId: true,
            status: true,
            kind: true,
            startDate: true,
            endDate: true,
            graceDays: true,
          },
        }),
        this.prisma.salesOpportunity.findMany({
          where: {
            companyId,
            ...(filtroCliente ? { salesClientId: filtroCliente } : {}),
          },
          select: { salesClientId: true, closedAt: true, outcome: true, originType: true },
        }),
        this.prisma.salesClientActivity.groupBy({
          by: ['salesClientId'],
          where: {
            companyId,
            ...(filtroCliente ? { salesClientId: filtroCliente } : {}),
          },
          _max: { createdAt: true },
        }),
        this.prisma.salesOpportunityStageChange.groupBy({
          by: ['salesClientId'],
          where: {
            companyId,
            ...(filtroCliente ? { salesClientId: filtroCliente } : {}),
          },
          _max: { createdAt: true },
        }),
        this.prisma.salesContract.groupBy({
          by: ['salesClientId'],
          where: {
            companyId,
            salesClientId: filtroCliente ?? { not: null },
          },
          _max: { createdAt: true },
        }),
      ]);

    const porCliente = <T extends { salesClientId: number | null }>(filas: T[]) => {
      const m = new Map<number, T[]>();
      for (const f of filas) {
        if (f.salesClientId === null) continue;
        m.set(f.salesClientId, [...(m.get(f.salesClientId) ?? []), f]);
      }
      return m;
    };
    const contratosPor = porCliente(contratos);
    const oppsPor = porCliente(oportunidades);
    const ultima = new Map<number, Date>();
    const aplicar = (filas: { salesClientId: number | null; _max: { createdAt: Date | null } }[]) => {
      for (const f of filas) {
        const d = f._max.createdAt;
        if (f.salesClientId === null || !d) continue;
        const actual = ultima.get(f.salesClientId);
        if (!actual || d > actual) ultima.set(f.salesClientId, d);
      }
    };
    aplicar(actividades);
    aplicar(cambios);
    aplicar(documentos);

    const hoy = hoyEcuador(ahora);
    const resultado = new Map<number, ResultadoCiclo & { oportunidadesAbiertas: number }>();
    for (const c of clientes) {
      const opps = oppsPor.get(c.id) ?? [];
      const tieneAbierta = opps.some((o) => o.closedAt === null);
      const actividad = ultima.get(c.id);
      const ultimaActividad =
        actividad && actividad > c.createdAt ? actividad : c.createdAt;
      const ciclo = calcularCicloVida(
        {
          contratos: contratosPor.get(c.id) ?? [],
          oportunidades: opps.map((o) => ({
            closedAt: o.closedAt,
            outcome: o.outcome,
            historica: o.originType === 'HISTORICO',
          })),
          ultimaActividad,
          seguimientoVencido:
            tieneAbierta &&
            !!c.nextActionDate &&
            c.nextActionDate.toISOString().slice(0, 10) < hoy,
        },
        ahora,
      );
      resultado.set(c.id, {
        ...ciclo,
        oportunidadesAbiertas: opps.filter((o) => o.closedAt === null).length,
      });
    }
    return resultado;
  }
}
