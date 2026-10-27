import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { CreateReceptionDto } from './dto/create-reception.dto';
import { CacaoUnitConfigService } from '../unit-config/unit-config.service';
import { CacheService } from '../../cache/cache.service';
import { liquidadoPorLote } from '../common/liquidado.util';

const INTENTOS_CODIGO_DE_LOTE = 5;

/** ¿El error es una violación de unicidad (dos recepciones pidieron el mismo código de lote)? */
function esCodigoDuplicado(error: unknown): boolean {
  return (error as { code?: string } | null)?.code === 'P2002';
}

const TOLERANCIA_KG = 0.001;
const round4 = (n: number) => Math.round((n + Number.EPSILON) * 10000) / 10000;

const MSG_TICKET_REPETIDO =
  'Ya hay una recepción con ese número de ticket. Revisa que no la hayas registrado antes.';

/** ¿La violación de unicidad es la del número de ticket (y no la del código de lote)? */
function esTicketDuplicado(error: unknown): boolean {
  if (!esCodigoDuplicado(error)) return false;
  const meta = (error as { meta?: unknown }).meta;
  return JSON.stringify(meta ?? '').includes('ticketNumber');
}

@Injectable()
export class CacaoReceptionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly unitConfig: CacaoUnitConfigService,
    private readonly cache: CacheService,
  ) {}

  async findAll(
    companyId: number,
    query: { supplierId?: string; from?: string; to?: string },
  ) {
    const where: Prisma.CacaoReceptionWhereInput = { companyId };
    if (query.supplierId) where.supplierId = Number(query.supplierId);
    if (query.from || query.to) {
      where.date = {};
      if (query.from) where.date.gte = new Date(query.from);
      if (query.to) where.date.lte = new Date(query.to);
    }
    const recepciones = await this.prisma.cacaoReception.findMany({
      where,
      include: { supplier: true, lot: true },
      orderBy: { date: 'desc' },
    });

    // Cuánto de cada entrega ya se liquidó al proveedor. Cada recepción forma su propio lote, así
    // que el lote identifica la entrega. La pantalla lo compara con el peso neto recibido: Sin
    // liquidar / Parcial / Liquidada (o Cerrada si se cerró sin liquidar).
    const liquidado = await liquidadoPorLote(
      this.prisma,
      companyId,
      recepciones.map((r) => r.lotId).filter((id): id is number => id !== null),
    );
    return recepciones.map((r) => ({
      ...r,
      liquidadoKg: r.lotId === null ? 0 : (liquidado.get(r.lotId) ?? 0),
    }));
  }

  /**
   * Cierra una entrega sin liquidarla (por ejemplo, un ticket que no se le va a pagar al
   * proveedor): deja de ofrecerse al liquidar y queda registrado quién, cuándo y por qué.
   * Lo ya liquidado se queda como está; no se puede cerrar una entrega liquidada por completo.
   */
  async close(id: number, companyId: number, userId: number, reason: string) {
    const recepcion = await this.prisma.cacaoReception.findFirst({
      where: { id, companyId },
    });
    if (!recepcion) throw new NotFoundException('Recepción no encontrada');
    if (recepcion.closedAt) {
      throw new BadRequestException('Esta entrega ya está cerrada');
    }
    const liquidado =
      recepcion.lotId === null
        ? 0
        : ((
            await liquidadoPorLote(this.prisma, companyId, [recepcion.lotId])
          ).get(recepcion.lotId) ?? 0);
    if (liquidado >= recepcion.netWeight - TOLERANCIA_KG) {
      throw new BadRequestException(
        'La entrega ya está liquidada por completo: no hay nada que cerrar',
      );
    }
    // Solo cierra si sigue abierta: si otra persona la cerró a la vez, esta recibe el aviso.
    const cerrada = await this.prisma.cacaoReception.updateMany({
      where: { id, companyId, closedAt: null },
      data: {
        closedAt: new Date(),
        closedBy: userId,
        closeReason: reason.trim(),
      },
    });
    if (cerrada.count === 0) {
      throw new BadRequestException('Esta entrega ya está cerrada');
    }
    return this.prisma.cacaoReception.findFirst({
      where: { id, companyId },
      include: { supplier: true, lot: true },
    });
  }

  /**
   * Anula una recepción mal registrada: el lote queda en cero y anulado, con una salida en el
   * kárdex que lo explica. Solo si no se ha usado: sin liquidaciones vigentes, sin embarques
   * vigentes y sin fijaciones de precio (lo que se usó se corrige anulando primero eso).
   */
  async void(id: number, companyId: number, userId: number, reason: string) {
    await this.prisma.$transaction(async (tx) => {
      const recepcion = await tx.cacaoReception.findFirst({
        where: { id, companyId },
      });
      if (!recepcion) throw new NotFoundException('Recepción no encontrada');
      if (recepcion.voidedAt) {
        throw new BadRequestException('Esta recepción ya está anulada');
      }
      if (recepcion.lotId === null) {
        throw new BadRequestException('La recepción no tiene lote que anular');
      }
      await tx.$queryRaw`SELECT "id" FROM "CacaoLot" WHERE "id" = ${recepcion.lotId} FOR UPDATE`;

      const lote = await tx.cacaoLot.findFirst({
        where: { id: recepcion.lotId, companyId },
      });
      if (!lote) throw new NotFoundException('Lote no encontrado');

      const liquidado =
        (await liquidadoPorLote(tx, companyId, [lote.id])).get(lote.id) ?? 0;
      if (liquidado > TOLERANCIA_KG) {
        throw new BadRequestException(
          'La entrega tiene liquidaciones vigentes: recházalas o anúlalas antes de anular la recepción',
        );
      }
      const embarques = await tx.cacaoShipmentLot.count({
        where: {
          lotId: lote.id,
          shipment: { status: { not: 'CANCELLED' } },
        },
      });
      if (
        embarques > 0 ||
        Math.abs(lote.netWeight - recepcion.netWeight) > TOLERANCIA_KG
      ) {
        throw new BadRequestException(
          'El lote ya salió en un embarque: anula primero ese embarque',
        );
      }
      const fijaciones = await tx.cacaoPriceFixing.count({
        where: { lotId: lote.id },
      });
      if (fijaciones > 0) {
        throw new BadRequestException(
          'El lote tiene una fijación de precio registrada y no se puede anular la recepción',
        );
      }

      await tx.cacaoReception.update({
        where: { id },
        data: {
          voidedAt: new Date(),
          voidedBy: userId,
          voidReason: reason.trim(),
        },
      });
      await tx.cacaoLot.update({
        where: { id: lote.id },
        data: { netWeight: 0, status: 'VOIDED' },
      });
      const previo = await tx.cacaoKardex.findFirst({
        where: { lotId: lote.id, companyId },
        orderBy: { id: 'desc' },
      });
      const costo = round4(recepcion.netWeight * lote.averageCost);
      await tx.cacaoKardex.create({
        data: {
          lotId: lote.id,
          type: 'EXIT',
          quantity: recepcion.netWeight,
          unitCost: lote.averageCost,
          totalCost: costo,
          balanceQty: round4((previo?.balanceQty ?? 0) - recepcion.netWeight),
          balanceCost: round4((previo?.balanceCost ?? 0) - costo),
          date: new Date(),
          reference: `Anulación recepción ${recepcion.guideNumber}`,
          referenceUnit: recepcion.unitOfMeasure,
          companyId,
        },
      });
    });

    await this.invalidateCache(companyId);
    return this.prisma.cacaoReception.findFirst({
      where: { id, companyId },
      include: { supplier: true, lot: true },
    });
  }

  /** Vuelve a abrir una entrega cerrada para poder liquidarla. */
  async reopen(id: number, companyId: number) {
    const recepcion = await this.prisma.cacaoReception.findFirst({
      where: { id, companyId },
    });
    if (!recepcion) throw new NotFoundException('Recepción no encontrada');
    if (!recepcion.closedAt) {
      throw new BadRequestException('Esta entrega no está cerrada');
    }
    await this.prisma.cacaoReception.update({
      where: { id },
      data: { closedAt: null, closedBy: null, closeReason: null },
    });
    return this.prisma.cacaoReception.findFirst({
      where: { id, companyId },
      include: { supplier: true, lot: true },
    });
  }

  async findQualities(companyId: number) {
    return this.prisma.cacaoQuality.findMany({
      where: { companyId },
      orderBy: { name: 'asc' },
    });
  }

  /**
   * Registra una recepción: crea su lote, la recepción y la entrada del kárdex en UNA
   * transacción (antes eran tres escrituras sueltas y una falla dejaba un lote sin
   * recepción). Si dos recepciones piden a la vez el mismo código de lote, la segunda
   * reintenta con el siguiente.
   */
  async create(dto: CreateReceptionDto, companyId: number, userId: number) {
    const unit = dto.unitOfMeasure || 'KG';

    const supplier = await this.prisma.cacaoSupplier.findFirst({
      where: { id: dto.supplierId, companyId },
    });
    if (!supplier) throw new BadRequestException('Proveedor no encontrado');

    const quality = await this.prisma.cacaoQuality.findFirst({
      where: { id: dto.qualityId, companyId },
    });
    if (!quality) throw new BadRequestException('Calidad no encontrada');

    // El número de ticket identifica el comprobante de pesaje: no se registra dos veces.
    if (dto.ticketNumber) {
      const repetido = await this.prisma.cacaoReception.findFirst({
        where: { companyId, ticketNumber: dto.ticketNumber },
      });
      if (repetido) throw new BadRequestException(MSG_TICKET_REPETIDO);
    }

    // Todo se guarda en kg
    const factor = await this.unitConfig.getFactor(unit, companyId);
    // Con un factor de 6 decimales (el quintal) los productos arrastran ruido: se guardan a 4 decimales.
    const grossWeightKg = round4(dto.grossWeight * factor);
    const tareKg = round4(dto.tare * factor);
    const netWeightKg = round4(grossWeightKg - tareKg);
    if (netWeightKg <= 0) {
      throw new BadRequestException(
        'El peso neto debe ser mayor a cero: revisa el peso bruto y la tara',
      );
    }

    const provPrice = dto.provisionalPrice ?? 0;
    const fecha = new Date(dto.date);
    const year = new Date().getFullYear();

    for (let intento = 1; ; intento++) {
      try {
        const reception = await this.prisma.$transaction(async (tx) => {
          const lastLot = await tx.cacaoLot.findFirst({
            where: { companyId, code: { startsWith: `LOTE-${year}-` } },
            orderBy: { id: 'desc' },
          });
          const seq = lastLot
            ? parseInt(lastLot.code.split('-')[2], 10) + 1
            : 1;
          const lotCode = `LOTE-${year}-${String(seq).padStart(5, '0')}`;

          const lot = await tx.cacaoLot.create({
            data: {
              code: lotCode,
              qualityId: quality.id,
              netWeight: netWeightKg,
              averageCost: provPrice,
              differential: dto.differential ?? null,
              status: 'OPEN',
              companyId,
            },
          });

          const created = await tx.cacaoReception.create({
            data: {
              date: fecha,
              supplierId: dto.supplierId,
              guideNumber: dto.guideNumber.trim(),
              unitOfMeasure: unit,
              ticketNumber: dto.ticketNumber ?? null,
              weighingProfile: dto.weighingProfile ?? null,
              driverName: dto.driverName ?? null,
              vehiclePlate: dto.vehiclePlate ?? null,
              grossWeight: grossWeightKg,
              tare: tareKg,
              netWeight: netWeightKg,
              humidity: dto.humidity,
              impurities: dto.impurities,
              provisionalPrice: provPrice,
              differential: dto.differential ?? null,
              qualityId: quality.id,
              lotId: lot.id,
              companyId,
              createdBy: userId,
            },
            include: { supplier: true, lot: true },
          });

          // El kárdex siempre va en kg
          await tx.cacaoKardex.create({
            data: {
              lotId: lot.id,
              type: 'ENTRY',
              quantity: netWeightKg,
              unitCost: provPrice,
              totalCost: netWeightKg * provPrice,
              balanceQty: netWeightKg,
              balanceCost: netWeightKg * provPrice,
              date: fecha,
              reference: `Recepción ${dto.guideNumber.trim()}`,
              referenceUnit: unit,
              companyId,
            },
          });
          return created;
        });
        await this.invalidateCache(companyId);
        return reception;
      } catch (error) {
        // Dos personas registraron el mismo ticket a la vez: gana la primera, la otra recibe el aviso
        // (no es el código de lote, así que no se reintenta).
        if (esTicketDuplicado(error)) {
          throw new BadRequestException(MSG_TICKET_REPETIDO);
        }
        if (esCodigoDuplicado(error) && intento < INTENTOS_CODIGO_DE_LOTE) {
          continue;
        }
        throw error;
      }
    }
  }

  async invalidateCache(companyId: number): Promise<void> {
    await this.cache.invalidate(`dashboard:${companyId}`);
    await this.cache.invalidate(`kardex:${companyId}:*`);
  }
}
