import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { CotQuote } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CotQuoteAccess, canEditQuote, sanitizeLines, toNum } from './cotizador.util';
import { calcularCotizacionVenta } from './cotizador-precios.util';

interface UnionFila {
  quoteId: number;
  companyId: number;
  opportunityId: number;
  principal: boolean;
}

/** Máximo de oportunidades que devuelve el buscador del Cotizador. */
const MAX_BUSQUEDA = 40;

/**
 * Cotización ↔ oportunidad (2026-11-17).
 *
 * Una cotización pertenece a UNA oportunidad; una oportunidad puede tener varias cotizaciones
 * (versiones o alternativas de la misma negociación). El vendedor marca una como «principal» y su
 * total (calculado aquí con las mismas reglas que la pantalla, cotizador-precios.util.ts) pasa a ser
 * el monto cotizado de la oportunidad, y se mantiene al día cada vez que esa cotización se guarda.
 * La unión vive en la tabla "CotQuoteOportunidad" (sin modelo Prisma, creada al arrancar).
 * Para «Enviar al cliente» la cotización TIENE que estar unida (decisión de Leidy: se puede guardar
 * un borrador sin oportunidad, pero no enviarlo).
 */
@Injectable()
export class CotizadorOportunidadService {
  private readonly logger = new Logger(CotizadorOportunidadService.name);

  constructor(private readonly prisma: PrismaService) {}

  private async union(quoteId: number): Promise<UnionFila | null> {
    const filas = await this.prisma.$queryRaw<UnionFila[]>(
      Prisma.sql`SELECT * FROM "CotQuoteOportunidad" WHERE "quoteId" = ${quoteId} LIMIT 1`,
    );
    return filas[0] ?? null;
  }

  /** ¿La cotización está unida a una oportunidad? (lo exige «Enviar al cliente»). */
  async estaUnida(quoteId: number): Promise<boolean> {
    return (await this.union(quoteId)) !== null;
  }

  /** Total de venta (con IVA) de una cotización, igual que lo muestra la pantalla. */
  async totalDe(q: CotQuote): Promise<number> {
    let items: ReturnType<typeof sanitizeLines> = [];
    try {
      items = sanitizeLines(q.items);
    } catch {
      return 0;
    }
    const codigos = [
      ...new Set(
        items.map((l) => (l as { code?: unknown }).code).filter((c): c is string => typeof c === 'string'),
      ),
    ];
    const productos = await this.prisma.cotProduct.findMany({
      where: { companyId: q.companyId, ...(codigos.length ? { code: { in: codigos } } : {}) },
    });
    return calcularCotizacionVenta({
      items,
      catalogo: new Map(productos.map((p) => [p.code, p])),
      supplierMargins: (q.supplierMargins ?? {}) as Record<string, number>,
      installMargin: toNum(q.installMargin),
      discountType: q.discountType,
      discountValue: toNum(q.discountValue),
    }).totales.total;
  }

  /**
   * Oportunidad de una cotización, para el selector del Cotizador. Trae también lo que la pantalla necesita para
   * preguntar antes de cambiar el monto (2026-11-17, pedido de Leidy: nunca reemplazar un monto en silencio): el
   * total de esta cotización, el monto actual de la oportunidad y cuál es hoy su cotización principal.
   */
  async deCotizacion(q: CotQuote) {
    const u = await this.union(q.id);
    if (!u) return { oportunidad: null, principal: false, total: null, montoOportunidad: null, principalActual: null };
    const [opp] = await this.buscarFilas(q.companyId, { ids: [u.opportunityId] });
    const otra = u.principal
      ? []
      : await this.prisma.$queryRaw<{ quoteId: number }[]>(
          Prisma.sql`SELECT "quoteId" FROM "CotQuoteOportunidad"
                     WHERE "opportunityId" = ${u.opportunityId} AND "principal" LIMIT 1`,
        );
    const qPrincipal = otra[0]
      ? await this.prisma.cotQuote.findFirst({ where: { id: otra[0].quoteId, companyId: q.companyId } })
      : null;
    return {
      oportunidad: opp ?? null,
      principal: u.principal,
      total: await this.totalDe(q),
      montoOportunidad: opp?.monto ?? null,
      principalActual: qPrincipal
        ? { id: qPrincipal.id, quoteNumber: qPrincipal.quoteNumber, total: await this.totalDe(qPrincipal) }
        : null,
    };
  }

  /**
   * Une (o desune con `opportunityId = null`) una cotización a una oportunidad. Solo quien puede
   * editar la cotización. Si la oportunidad aún no tiene cotización principal ni monto escrito, esta
   * queda como principal (así el monto aparece solo la primera vez sin pisar uno escrito a mano).
   */
  async unir(q: CotQuote, access: CotQuoteAccess | null, opportunityId: number | null, userId: number) {
    if (!canEditQuote(access)) {
      throw new ForbiddenException('Solo quien puede editar la cotización puede cambiar su oportunidad');
    }
    const actual = await this.union(q.id);
    if (opportunityId === null) {
      if (actual) {
        // El monto de la oportunidad se queda como estaba: quitar la unión no borra lo cotizado.
        await this.prisma.$executeRaw(Prisma.sql`DELETE FROM "CotQuoteOportunidad" WHERE "quoteId" = ${q.id}`);
      }
      return this.deCotizacion(q);
    }
    if (actual?.opportunityId === opportunityId) return this.deCotizacion(q);

    const opp = await this.prisma.salesOpportunity.findFirst({
      where: { id: opportunityId, companyId: q.companyId },
      select: { id: true, quotedAmount: true },
    });
    if (!opp) throw new NotFoundException('Oportunidad no encontrada');

    const yaHayPrincipal = await this.prisma.$queryRaw<{ n: number }[]>(
      Prisma.sql`SELECT COUNT(*)::int AS n FROM "CotQuoteOportunidad"
                 WHERE "opportunityId" = ${opportunityId} AND "principal" AND "quoteId" <> ${q.id}`,
    );
    const sinMonto = opp.quotedAmount === null || Number(opp.quotedAmount) === 0;
    const principal = (yaHayPrincipal[0]?.n ?? 0) === 0 && sinMonto;

    await this.prisma.$executeRaw(
      Prisma.sql`INSERT INTO "CotQuoteOportunidad" ("quoteId", "companyId", "opportunityId", "principal", "unidaPor")
                 VALUES (${q.id}, ${q.companyId}, ${opportunityId}, ${principal}, ${userId})
                 ON CONFLICT ("quoteId") DO UPDATE SET "opportunityId" = EXCLUDED."opportunityId",
                   "principal" = EXCLUDED."principal", "unidaPor" = EXCLUDED."unidaPor", "unidaEn" = NOW()`,
    );
    if (principal) await this.sincronizarMonto(q);
    return this.deCotizacion(q);
  }

  /** Marca la cotización como principal de su oportunidad (y copia su total a la oportunidad). */
  async marcarPrincipal(companyId: number, opportunityId: number, quoteId: number) {
    const u = await this.union(quoteId);
    if (!u || u.companyId !== companyId || u.opportunityId !== opportunityId) {
      throw new BadRequestException('Esa cotización no pertenece a esta oportunidad');
    }
    await this.prisma.$transaction([
      this.prisma.$executeRaw(
        Prisma.sql`UPDATE "CotQuoteOportunidad" SET "principal" = false
                   WHERE "opportunityId" = ${opportunityId} AND "quoteId" <> ${quoteId}`,
      ),
      this.prisma.$executeRaw(
        Prisma.sql`UPDATE "CotQuoteOportunidad" SET "principal" = true WHERE "quoteId" = ${quoteId}`,
      ),
    ]);
    const q = await this.prisma.cotQuote.findFirst({ where: { id: quoteId, companyId } });
    if (q) await this.sincronizarMonto(q);
    return this.deOportunidad(companyId, opportunityId);
  }

  /**
   * Si la cotización es la principal de su oportunidad, copia su total a la oportunidad. Se llama
   * después de guardarla. Si falla, se registra y no se cae el guardado de la cotización.
   */
  async sincronizarMonto(q: CotQuote) {
    try {
      const u = await this.union(q.id);
      if (!u?.principal) return;
      const total = await this.totalDe(q);
      const opp = await this.prisma.salesOpportunity.findFirst({
        where: { id: u.opportunityId, companyId: q.companyId },
        select: { quotedAt: true },
      });
      if (!opp) return;
      await this.prisma.salesOpportunity.update({
        where: { id: u.opportunityId },
        data: {
          quotedAmount: new Prisma.Decimal(total.toFixed(2)),
          // La fecha de cotización solo se pone si estaba vacía (mide «tiempo hasta cotizar»).
          ...(opp.quotedAt ? {} : { quotedAt: q.quoteDate }),
        },
      });
    } catch (e) {
      this.logger.error(`No se pudo actualizar el monto de la oportunidad (cotización ${q.id}): ${(e as Error).message}`);
    }
  }

  /** Cotizaciones de una oportunidad (para su ficha). `puedeAbrir` según las reglas del Cotizador. */
  async deOportunidad(companyId: number, opportunityId: number, actor?: { userId: number; role: string }) {
    const opp = await this.prisma.salesOpportunity.findFirst({
      where: { id: opportunityId, companyId },
      select: { id: true, quotedAmount: true },
    });
    if (!opp) throw new NotFoundException('Oportunidad no encontrada');
    const uniones = await this.prisma.$queryRaw<UnionFila[]>(
      Prisma.sql`SELECT * FROM "CotQuoteOportunidad" WHERE "opportunityId" = ${opportunityId}`,
    );
    const principal = new Map(uniones.map((u) => [u.quoteId, u.principal]));
    const quotes = uniones.length
      ? await this.prisma.cotQuote.findMany({
          where: { id: { in: uniones.map((u) => u.quoteId) }, companyId },
          orderBy: [{ quoteDate: 'desc' }, { id: 'desc' }],
        })
      : [];
    const [shares, grants] = actor
      ? await Promise.all([
          this.prisma.cotQuoteShare.findMany({
            where: { companyId, sharedWithId: actor.userId },
            select: { quoteId: true },
          }),
          this.prisma.cotEditGrant.findMany({
            where: { companyId, editorId: actor.userId },
            select: { ownerId: true },
          }),
        ])
      : [[], []];
    const compartidas = new Set(shares.map((s) => s.quoteId));
    const deEditores = new Set(grants.map((g) => g.ownerId));
    const cotizaciones = await Promise.all(
      quotes.map(async (q) => ({
        id: q.id,
        quoteNumber: q.quoteNumber,
        quoteDate: q.quoteDate.toISOString().slice(0, 10),
        status: q.status,
        vendorName: q.vendorName,
        total: await this.totalDe(q),
        principal: principal.get(q.id) ?? false,
        puedeAbrir:
          !actor ||
          actor.role === 'ADMIN' ||
          q.ownerId === actor.userId ||
          compartidas.has(q.id) ||
          deEditores.has(q.ownerId),
      })),
    );
    return {
      montoOportunidad: opp.quotedAmount === null ? null : Number(opp.quotedAmount),
      cotizaciones,
    };
  }

  /** Oportunidades para el selector del Cotizador: abiertas, filtradas por texto (cliente, RUC o título). */
  async buscar(companyId: number, texto: string | undefined) {
    return this.buscarFilas(companyId, { texto: (texto ?? '').trim().slice(0, 100), soloAbiertas: true });
  }

  /** Una oportunidad (abierta o no) en la forma del selector; para «Cotizar» desde Oportunidades. */
  async una(companyId: number, id: number) {
    const [o] = await this.buscarFilas(companyId, { ids: [id] });
    if (!o) throw new NotFoundException('Oportunidad no encontrada');
    return o;
  }

  private async buscarFilas(
    companyId: number,
    f: { ids?: number[]; texto?: string; soloAbiertas?: boolean },
  ) {
    const where: Prisma.SalesOpportunityWhereInput = { companyId };
    if (f.ids) where.id = { in: f.ids };
    if (f.soloAbiertas) where.closedAt = null;
    if (f.texto) {
      where.OR = [
        { title: { contains: f.texto, mode: 'insensitive' } },
        { salesClient: { name: { contains: f.texto, mode: 'insensitive' } } },
        { salesClient: { ruc: { contains: f.texto } } },
      ];
    }
    const filas = await this.prisma.salesOpportunity.findMany({
      where,
      orderBy: [{ receivedAt: 'desc' }, { id: 'desc' }],
      take: f.ids ? undefined : MAX_BUSQUEDA,
      select: {
        id: true,
        title: true,
        status: true,
        closedAt: true,
        outcome: true,
        quotedAmount: true,
        receivedAt: true,
        assignedUserId: true,
        // Pilares de los servicios de la oportunidad: el Cotizador los usa para preseleccionar
        // el pilar del que se precargan las condiciones generales.
        services: { select: { service: { select: { pilar: true } } } },
        salesClient: {
          select: { id: true, name: true, ruc: true, address: true, phone: true, email: true, extra: true },
        },
      },
    });
    const etapas = new Map(
      (
        await this.prisma.salesClientStage.findMany({
          where: { companyId },
          select: { key: true, label: true },
        })
      ).map((e) => [e.key, e.label]),
    );
    const responsables = new Map(
      (
        await this.prisma.user.findMany({
          where: { id: { in: [...new Set(filas.map((o) => o.assignedUserId).filter((x): x is number => x !== null))] } },
          select: { id: true, fullName: true },
        })
      ).map((u) => [u.id, u.fullName]),
    );
    return filas.map((o) => ({
      id: o.id,
      titulo: o.title ?? '',
      etapa: o.status ? (etapas.get(o.status) ?? o.status) : '',
      abierta: o.closedAt === null,
      monto: o.quotedAmount === null ? null : Number(o.quotedAmount),
      llegada: o.receivedAt,
      responsable: o.assignedUserId ? (responsables.get(o.assignedUserId) ?? '') : '',
      pilares: [
        ...new Set(
          o.services
            .map((s) => s.service.pilar)
            .filter((p): p is string => Boolean(p)),
        ),
      ],
      cliente: {
        id: o.salesClient.id,
        nombre: o.salesClient.name,
        ruc: o.salesClient.ruc ?? '',
        direccion: o.salesClient.address ?? '',
        telefono: o.salesClient.phone ?? '',
        email: o.salesClient.email ?? '',
      },
    }));
  }
}
