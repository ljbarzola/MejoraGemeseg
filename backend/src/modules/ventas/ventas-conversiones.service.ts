import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { GoogleAdsConversionesService } from './google-ads-conversiones.service';
import {
  gclidDeLead,
  gclidVigente,
  hechosAcumulados,
  hechosDeEtapa,
  VIGENCIA_GCLID_DIAS,
} from './ventas-conversiones.util';
import { clavesCualificadas } from './ventas-marketing.util';

// Estados de un hecho: PENDIENTE (falta avisar), ENVIADO, FALLO (se reintenta)
// y VENCIDO (el clic tiene más de 90 días: Google ya no lo acepta).
// RECHAZADO (2026-10-27): Google recibió el aviso pero lo rechazó al procesarlo; no se reintenta.
export const ESTADOS_CONVERSION = ['PENDIENTE', 'ENVIADO', 'FALLO', 'VENCIDO', 'RECHAZADO'] as const;

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
      const etapas = await this.prisma.salesClientStage.findMany({
        where: { companyId: c.companyId },
        select: { key: true, isInitial: true, isFinal: true },
      });
      const hechos = hechosDeEtapa(c.destinoKey, c.outcome, clavesCualificadas(etapas));
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
      if (await this.envio.configurado(c.companyId)) {
        void this.envio.enviarPendientes({ companyId: c.companyId }).catch((e: Error) =>
          this.logger.error(`Envío inmediato a Google Ads: ${e.message}`),
        );
      }
    } catch (err) {
      this.logger.error(
        `No se pudo registrar la conversión de la oportunidad #${c.opportunityId}: ${(err as Error).message}`,
      );
    }
  }

  // Rellena lo que faltó registrar (2026-10-27): al pasar «cualificado» de Cotizada a En evaluación, las
  // oportunidades que ya estaban evaluándose no tenían su hecho. Mira todo el camino de cada oportunidad
  // (etapas por las que pasó + resultado) de los leads de anuncio que llegaron hace menos de 90 días (más
  // viejos Google ya no los acepta) y crea los hechos que no existan. Es idempotente (único por oportunidad
  // y tipo), así que el cron puede correrlo cada hora y también cubre cualquier registro que se haya perdido.
  async rellenarFaltantes(): Promise<{ creados: number }> {
    try {
      const desde = new Date(Date.now() - VIGENCIA_GCLID_DIAS * 86_400_000);
      const leads = await this.prisma.salesLead.findMany({
        where: { createdAt: { gte: desde }, convertedOpportunityId: { not: null } },
        select: { id: true, companyId: true, extra: true, convertedOpportunityId: true },
      });
      const conGclid = leads
        .map((l) => ({ ...l, gclid: gclidDeLead(l.extra) }))
        .filter((l): l is typeof l & { gclid: string; convertedOpportunityId: number } =>
          !!l.gclid && l.convertedOpportunityId !== null,
        );
      if (conGclid.length === 0) return { creados: 0 };

      const idsOpp = conGclid.map((l) => l.convertedOpportunityId);
      // Las etapas propias de cada empresa (p. ej. «PROPUESTA_ENVIADA») también cuentan como cualificado.
      const etapasEmpresas = await this.prisma.salesClientStage.findMany({
        where: { companyId: { in: [...new Set(conGclid.map((l) => l.companyId))] } },
        select: { companyId: true, key: true, isInitial: true, isFinal: true },
      });
      const cualificadasDe = (companyId: number) =>
        clavesCualificadas(etapasEmpresas.filter((e) => e.companyId === companyId));
      const [opps, existentes] = await Promise.all([
        this.prisma.salesOpportunity.findMany({
          where: { id: { in: idsOpp } },
          select: {
            id: true,
            status: true,
            outcome: true,
            quotedAmount: true,
            quotedAt: true,
            closedAt: true,
            stageChanges: { select: { toStatus: true, createdAt: true }, orderBy: { createdAt: 'asc' } },
          },
        }),
        this.prisma.salesConversionEvent.findMany({
          where: { opportunityId: { in: idsOpp }, kind: { in: ['CUALIFICADO', 'CONVERTIDO'] } },
          select: { opportunityId: true, kind: true },
        }),
      ]);
      const yaRegistrado = new Set(existentes.map((e) => `${e.opportunityId}:${e.kind}`));
      const oppPorId = new Map(opps.map((o) => [o.id, o]));

      const ahora = new Date();
      const data: Prisma.SalesConversionEventCreateManyInput[] = [];
      for (const l of conGclid) {
        const o = oppPorId.get(l.convertedOpportunityId);
        if (!o) continue;
        const outcome = o.outcome === 'GANADA' || o.outcome === 'PERDIDA' ? o.outcome : null;
        // Una fecha de cotización también cuenta (igual que en el embudo del Dashboard, faseMarketing).
        const etapas = [
          ...o.stageChanges.map((c) => c.toStatus),
          ...(o.status ? [o.status] : []),
          ...(o.quotedAt ? ['COTIZADO'] : []),
        ];
        const cualificadas = cualificadasDe(l.companyId);
        for (const kind of hechosAcumulados(etapas, outcome, cualificadas)) {
          if (yaRegistrado.has(`${o.id}:${kind}`)) continue;
          // La fecha del hecho es la del cambio real (el cierre para «convertido»); sin ella, ahora.
          const cuando =
            kind === 'CONVERTIDO'
              ? (o.closedAt ?? ahora)
              : (o.stageChanges.find((c) => cualificadas.includes(c.toStatus))?.createdAt ?? ahora);
          data.push({
            companyId: l.companyId,
            leadId: l.id,
            opportunityId: o.id,
            kind,
            gclid: l.gclid,
            occurredAt: cuando,
            value: kind === 'CONVERTIDO' && o.quotedAmount !== null ? Number(o.quotedAmount) : null,
            status: 'PENDIENTE',
          });
        }
      }
      if (data.length === 0) return { creados: 0 };
      const r = await this.prisma.salesConversionEvent.createMany({ data, skipDuplicates: true });
      this.logger.log(`Conversiones rellenadas para Google Ads: ${r.count}`);
      return { creados: r.count };
    } catch (err) {
      this.logger.error(`No se pudieron rellenar las conversiones: ${(err as Error).message}`);
      return { creados: 0 };
    }
  }

  // «Lead válido» (2026-10-18): una persona del equipo confirmó que el posible cliente es un contacto
  // real de servicio (lo clasificó como «Servicio» o lo pasó a oportunidad). Es el paso intermedio entre
  // llenar el formulario y cotizar. Solo cuenta si vino de un anuncio (trae gclid) y la empresa guardó el ID
  // de esa conversión; una sola vez por posible cliente, y registrar NUNCA debe romper lo que la persona hacía.
  async registrarLeadValido(companyId: number, leadId: number): Promise<void> {
    try {
      if (!(await this.envio.usaLeadValido(companyId))) return;
      const lead = await this.prisma.salesLead.findFirst({
        where: { id: leadId, companyId },
        select: { id: true, extra: true, createdAt: true },
      });
      const gclid = gclidDeLead(lead?.extra);
      if (!lead || !gclid) return;
      // La unicidad de la base es (oportunidad, tipo) y este hecho no tiene oportunidad: se cuida aquí.
      const yaEsta = await this.prisma.salesConversionEvent.findFirst({
        where: { leadId: lead.id, kind: 'VALIDO' },
        select: { id: true },
      });
      if (yaEsta) return;

      const ahora = new Date();
      const vigente = gclidVigente(lead.createdAt, ahora);
      await this.prisma.salesConversionEvent.create({
        data: {
          companyId,
          leadId: lead.id,
          opportunityId: null,
          kind: 'VALIDO',
          gclid,
          occurredAt: ahora,
          value: null,
          status: vigente ? 'PENDIENTE' : 'VENCIDO',
          lastError: vigente
            ? null
            : `El clic tiene más de ${VIGENCIA_GCLID_DIAS} días: Google ya no lo acepta.`,
        },
      });
      void this.envio.enviarPendientes({ companyId }).catch((e: Error) =>
        this.logger.error(`Envío inmediato a Google Ads: ${e.message}`),
      );
    } catch (err) {
      this.logger.error(
        `No se pudo registrar el lead válido #${leadId}: ${(err as Error).message}`,
      );
    }
  }

  // Conteos por estado y por tipo para la pantalla de Conexiones.
  async resumen(companyId: number | null) {
    if (!companyId) {
      return {
        conectado: false,
        total: 0,
        porEstado: {},
        porTipo: {},
        confirmadosPorGoogle: 0,
        ultimoRechazo: null,
        recientes: [],
      };
    }
    const [estados, tipos, recientes, confirmados, ultimoRechazo] = await Promise.all([
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
          googleStatus: true,
        },
      }),
      // Cuántos avisos Google ya confirmó haber procesado bien (no solo «recibido»).
      this.prisma.salesConversionEvent.count({ where: { companyId, googleStatus: 'ACEPTADO' } }),
      this.prisma.salesConversionEvent.findFirst({
        where: { companyId, status: 'RECHAZADO' },
        orderBy: { checkedAt: 'desc' },
        select: { lastError: true },
      }),
    ]);
    const porEstado = Object.fromEntries(estados.map((e) => [e.status, e._count._all]));
    const porTipo = Object.fromEntries(tipos.map((t) => [t.kind, t._count._all]));
    return {
      // false mientras falten los IDs de la cuenta de Google Ads: los hechos quedan PENDIENTES.
      conectado: await this.envio.configurado(companyId),
      total: estados.reduce((n, e) => n + e._count._all, 0),
      porEstado,
      porTipo,
      confirmadosPorGoogle: confirmados,
      ultimoRechazo: ultimoRechazo?.lastError ?? null,
      recientes,
    };
  }
}
