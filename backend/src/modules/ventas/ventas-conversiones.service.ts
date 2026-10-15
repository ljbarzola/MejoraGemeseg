import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { GoogleAdsConversionesService } from './google-ads-conversiones.service';
import {
  gclidDeLead,
  gclidVigente,
  hechosDeEtapa,
  VIGENCIA_GCLID_DIAS,
} from './ventas-conversiones.util';

// Estados de un hecho: PENDIENTE (falta avisar), ENVIADO, FALLO (se reintenta)
// y VENCIDO (el clic tiene más de 90 días: Google ya no lo acepta).
export const ESTADOS_CONVERSION = ['PENDIENTE', 'ENVIADO', 'FALLO', 'VENCIDO'] as const;

export interface CambioDeEtapa {
  companyId: number;
  opportunityId: number;
  leadId: number | null;
  destinoKey: string;
  outcome: 'GANADA' | 'PERDIDA' | null;
  // Monto cotizado de la oportunidad tras el cambio (es el valor del «convertido»).
  quotedAmount: number | null;
}

// Guarda, para un lead que vino de un anuncio de Google (trae gclid), cada
// hecho que Google quiere saber. El envío es otro paso (se sacan los PENDIENTES);
// aquí solo se registra, y registrar NUNCA debe romper el cambio de etapa.
@Injectable()
export class VentasConversionesService {
  private readonly logger = new Logger(VentasConversionesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly envio: GoogleAdsConversionesService,
  ) {}

  async registrarPorEtapa(c: CambioDeEtapa): Promise<void> {
    try {
      if (!c.leadId) return;
      const hechos = hechosDeEtapa(c.destinoKey, c.outcome);
      if (hechos.length === 0) return;
      const lead = await this.prisma.salesLead.findFirst({
        where: { id: c.leadId, companyId: c.companyId },
        select: { id: true, extra: true, createdAt: true },
      });
      const gclid = gclidDeLead(lead?.extra);
      if (!lead || !gclid) return;

      const ahora = new Date();
      const vigente = gclidVigente(lead.createdAt, ahora);
      await this.prisma.salesConversionEvent.createMany({
        data: hechos.map((kind) => ({
          companyId: c.companyId,
          leadId: lead.id,
          opportunityId: c.opportunityId,
          kind,
          gclid,
          occurredAt: ahora,
          value: kind === 'CONVERTIDO' ? c.quotedAmount : null,
          status: vigente ? 'PENDIENTE' : 'VENCIDO',
          lastError: vigente
            ? null
            : `El clic tiene más de ${VIGENCIA_GCLID_DIAS} días: Google ya no lo acepta.`,
        })),
        // Cada oportunidad registra un hecho una sola vez (si se mueve de
        // Cotizada a En negociación no se repite).
        skipDuplicates: true,
      });
      // Si el envío a Google ya está configurado, se intenta al momento; si falla,
      // el cron lo reintenta. Nunca se espera: no debe frenar el cambio de etapa.
      if (this.envio.configurado()) {
        void this.envio.enviarPendientes().catch((e: Error) =>
          this.logger.error(`Envío inmediato a Google Ads: ${e.message}`),
        );
      }
    } catch (err) {
      this.logger.error(
        `No se pudo registrar la conversión de la oportunidad #${c.opportunityId}: ${(err as Error).message}`,
      );
    }
  }

  // Conteos por estado y por tipo para la pantalla de Conexiones.
  async resumen(companyId: number | null) {
    if (!companyId) {
      return { conectado: false, total: 0, porEstado: {}, porTipo: {}, recientes: [] };
    }
    const [estados, tipos, recientes] = await Promise.all([
      this.prisma.salesConversionEvent.groupBy({
        by: ['status'],
        where: { companyId },
        _count: { _all: true },
      }),
      this.prisma.salesConversionEvent.groupBy({
        by: ['kind'],
        where: { companyId },
        _count: { _all: true },
      }),
      this.prisma.salesConversionEvent.findMany({
        where: { companyId },
        orderBy: { createdAt: 'desc' },
        take: 8,
        select: {
          id: true,
          kind: true,
          status: true,
          occurredAt: true,
          sentAt: true,
          lastError: true,
          leadId: true,
        },
      }),
    ]);
    const porEstado = Object.fromEntries(estados.map((e) => [e.status, e._count._all]));
    const porTipo = Object.fromEntries(tipos.map((t) => [t.kind, t._count._all]));
    return {
      // false mientras falten los IDs de la cuenta de Google Ads: los hechos quedan PENDIENTES.
      conectado: this.envio.configurado(),
      total: estados.reduce((n, e) => n + e._count._all, 0),
      porEstado,
      porTipo,
      recientes,
    };
  }
}
