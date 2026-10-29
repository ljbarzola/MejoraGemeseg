import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { CreateShipmentDto } from './dto/create-shipment.dto';
import { CacaoUnitConfigService } from '../unit-config/unit-config.service';
import { CacaoConfigService } from '../config/cacao-config.service';
import { CacheService } from '../../cache/cache.service';

const TOLERANCIA_KG = 0.001;

const round1 = (n: number) => Math.round((n + Number.EPSILON) * 10) / 10;
const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const round4 = (n: number) => Math.round((n + Number.EPSILON) * 10000) / 10000;

@Injectable()
export class CacaoShipmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly unitConfig: CacaoUnitConfigService,
    private readonly config: CacaoConfigService,
    private readonly cache: CacheService,
  ) {}

  async getNextId(companyId: number) {
    const last = await this.prisma.cacaoShipment.findFirst({
      where: { companyId },
      orderBy: { id: 'desc' },
    });
    const nextNum = last ? last.id + 1 : 1;
    return { code: `EMB-${String(nextNum).padStart(4, '0')}` };
  }

  async findAll(companyId: number) {
    return this.prisma.cacaoShipment.findMany({
      where: { companyId },
      include: {
        client: true,
        lots: { include: { lot: true } },
        receivable: true,
      },
      orderBy: { date: 'desc' },
    });
  }

  /**
   * Crea un embarque: el embarque, el descuento de cada lote, la salida del kárdex y la cuenta
   * por cobrar ocurren en UNA transacción con los lotes bloqueados (antes eran escrituras
   * sueltas: una falla a medias dejaba lotes descontados sin embarque, y dos embarques
   * simultáneos podían vender el mismo peso).
   *
   * El precio de venta es en $/kg, como dice la pantalla. El costo, el monto y el margen los
   * calcula el servidor con el costo promedio de cada lote. Antes el servidor trataba el
   * precio como «por unidad» y la pantalla mandaba el costo multiplicado por el factor: con
   * sacos o toneladas la salida del kárdex y la cuenta por cobrar salían mal.
   */
  async create(dto: CreateShipmentDto, companyId: number, userId: number) {
    const unit = dto.unitOfMeasure || 'KG';

    const client = await this.prisma.cacaoClient.findFirst({
      where: { id: dto.clientId, companyId },
    });
    if (!client) throw new BadRequestException('Cliente no encontrado');

    const lotIds = dto.lots.map((l) => l.lotId);
    if (new Set(lotIds).size !== lotIds.length) {
      throw new BadRequestException(
        'No puede seleccionar el mismo lote dos veces',
      );
    }

    const factor = await this.unitConfig.getFactor(unit, companyId);
    const plazoCobro = dto.dueDays ?? (await this.config.plazoCobro(companyId));
    const fecha = new Date(dto.date);

    const shipment = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "CacaoLot" WHERE "id" IN (${Prisma.join(lotIds)}) FOR UPDATE`;

      const lots = await tx.cacaoLot.findMany({
        where: { id: { in: lotIds }, companyId },
      });

      const lines = dto.lots.map((input) => {
        const lot = lots.find((l) => l.id === input.lotId);
        if (!lot) {
          throw new BadRequestException(`Lote ${input.lotId} no encontrado`);
        }
        const quantityKg = round4(input.quantity * factor);
        if (lot.netWeight + TOLERANCIA_KG < quantityKg) {
          throw new BadRequestException(
            `Lote ${lot.code} no tiene suficiente peso`,
          );
        }
        return {
          lot,
          quantity: input.quantity,
          quantityKg,
          unitCost: lot.averageCost,
          cost: round2(quantityKg * lot.averageCost),
          sale: round2(quantityKg * dto.salePrice),
        };
      });

      const totalWeight = round4(lines.reduce((s, l) => s + l.quantity, 0));
      const totalWeightKg = round4(lines.reduce((s, l) => s + l.quantityKg, 0));
      const totalCost = round2(lines.reduce((s, l) => s + l.cost, 0));
      const totalSale = round2(lines.reduce((s, l) => s + l.sale, 0));
      const margin =
        totalCost > 0 ? round1((totalSale / totalCost - 1) * 100) : 0;

      const created = await tx.cacaoShipment.create({
        data: {
          date: fecha,
          clientId: dto.clientId,
          contractRef: dto.contractRef.trim(),
          unitOfMeasure: unit,
          totalWeight,
          totalWeightKg,
          totalCost,
          salePrice: dto.salePrice,
          salePricePerKg: dto.salePrice,
          margin,
          status: 'PENDING',
          companyId,
          createdBy: userId,
          lots: {
            create: lines.map((l) => ({
              lotId: l.lot.id,
              quantity: l.quantity,
              quantityKg: l.quantityKg,
              unitCost: l.unitCost,
              saleAmount: l.sale,
              unitOfMeasure: unit,
            })),
          },
        },
      });

      for (const l of lines) {
        const restante = round4(l.lot.netWeight - l.quantityKg);
        await tx.cacaoLot.update({
          where: { id: l.lot.id },
          data: {
            netWeight: restante,
            status: restante <= 0 ? 'CLOSED' : 'OPEN',
          },
        });

        const previo = await tx.cacaoKardex.findFirst({
          where: { lotId: l.lot.id, companyId },
          orderBy: { id: 'desc' },
        });
        await tx.cacaoKardex.create({
          data: {
            lotId: l.lot.id,
            type: 'EXIT',
            quantity: l.quantityKg,
            unitCost: l.unitCost,
            totalCost: l.cost,
            balanceQty: round4((previo?.balanceQty ?? 0) - l.quantityKg),
            balanceCost: round2((previo?.balanceCost ?? 0) - l.cost),
            date: fecha,
            reference: `Embarque ${dto.contractRef.trim()}`,
            referenceUnit: unit,
            companyId,
          },
        });
      }

      await tx.cacaoReceivable.create({
        data: {
          shipmentId: created.id,
          clientId: dto.clientId,
          totalAmount: totalSale,
          receivedAmount: 0,
          dueDate: new Date(Date.now() + plazoCobro * 24 * 60 * 60 * 1000),
          status: 'PENDING',
          companyId,
        },
      });

      return tx.cacaoShipment.findUniqueOrThrow({
        where: { id: created.id },
        include: {
          client: true,
          lots: { include: { lot: true } },
          receivable: true,
        },
      });
    });

    await this.invalidateCache(companyId);
    return shipment;
  }

  /**
   * Anula un embarque mal registrado: devuelve los kilos a cada lote (y lo reabre si se había
   * vendido por completo), deja una entrada en el kárdex que lo explica y cancela la cuenta por
   * cobrar. Si ya hay cobros vigentes, primero hay que anularlos. Todo en una transacción con el
   * lote y la cuenta bloqueados.
   */
  async cancel(id: number, companyId: number, userId: number, reason: string) {
    await this.prisma.$transaction(async (tx) => {
      // Mismo bloqueo que usa el cobro: no se anula mientras alguien está cobrando.
      await tx.$queryRaw`SELECT "id" FROM "CacaoReceivable" WHERE "shipmentId" = ${id} FOR UPDATE`;

      const shipment = await tx.cacaoShipment.findFirst({
        where: { id, companyId },
        include: { lots: true, receivable: true },
      });
      if (!shipment) throw new NotFoundException('Embarque no encontrado');
      if (shipment.status === 'CANCELLED') {
        throw new BadRequestException('Este embarque ya está anulado');
      }
      const cobrosVigentes = shipment.receivable
        ? await tx.cacaoPayment.count({
            where: { receivableId: shipment.receivable.id, voidedAt: null },
          })
        : 0;
      if (
        cobrosVigentes > 0 ||
        (shipment.receivable?.receivedAmount ?? 0) > 0
      ) {
        throw new BadRequestException(
          'El embarque tiene cobros registrados: anúlalos antes de anularlo',
        );
      }

      const lotIds = shipment.lots.map((l) => l.lotId);
      await tx.$queryRaw`SELECT "id" FROM "CacaoLot" WHERE "id" IN (${Prisma.join(lotIds)}) FOR UPDATE`;

      for (const linea of shipment.lots) {
        const lot = await tx.cacaoLot.findFirst({
          where: { id: linea.lotId, companyId },
        });
        if (!lot) continue;
        const nuevoPeso = round4(lot.netWeight + linea.quantityKg);
        await tx.cacaoLot.update({
          where: { id: lot.id },
          data: { netWeight: nuevoPeso, status: 'OPEN' },
        });
        const previo = await tx.cacaoKardex.findFirst({
          where: { lotId: lot.id, companyId },
          orderBy: { id: 'desc' },
        });
        const costo = round2(linea.quantityKg * linea.unitCost);
        await tx.cacaoKardex.create({
          data: {
            lotId: lot.id,
            type: 'ENTRY',
            quantity: linea.quantityKg,
            unitCost: linea.unitCost,
            totalCost: costo,
            balanceQty: round4((previo?.balanceQty ?? 0) + linea.quantityKg),
            balanceCost: round2((previo?.balanceCost ?? 0) + costo),
            date: new Date(),
            reference: `Anulación embarque ${shipment.contractRef}`,
            referenceUnit: linea.unitOfMeasure,
            companyId,
          },
        });
      }

      await tx.cacaoShipment.update({
        where: { id },
        data: {
          status: 'CANCELLED',
          cancelledAt: new Date(),
          cancelledBy: userId,
          cancelReason: reason.trim(),
        },
      });
      if (shipment.receivable) {
        await tx.cacaoReceivable.update({
          where: { id: shipment.receivable.id },
          data: { status: 'CANCELLED' },
        });
      }
    });

    await this.invalidateCache(companyId);
    return this.prisma.cacaoShipment.findFirst({
      where: { id, companyId },
      include: {
        client: true,
        lots: { include: { lot: true } },
        receivable: true,
      },
    });
  }

  async invalidateCache(companyId: number): Promise<void> {
    await this.cache.invalidate(`dashboard:${companyId}`);
    await this.cache.invalidate(`kardex:${companyId}:*`);
  }
}
