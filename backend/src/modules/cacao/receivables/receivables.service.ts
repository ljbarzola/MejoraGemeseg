import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { PaymentDto, round2, TOLERANCIA_MONTO } from '../common/payment.dto';

@Injectable()
export class CacaoReceivablesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(companyId: number, query: { status?: string }) {
    const where: Prisma.CacaoReceivableWhereInput = { companyId };
    if (query.status) where.status = query.status;
    return this.prisma.cacaoReceivable.findMany({
      where,
      include: {
        client: true,
        shipment: true,
        payments: { orderBy: { createdAt: 'asc' } },
      },
      orderBy: { dueDate: 'asc' },
    });
  }

  /**
   * Registra un cobro. Igual que el pago a proveedores: una sola transacción con la cuenta
   * bloqueada, y el embarque pasa a COMPLETED en esa misma transacción.
   */
  async receive(
    id: number,
    dto: PaymentDto,
    companyId: number,
    userId: number,
  ) {
    const amount = round2(dto.amount);

    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "CacaoReceivable" WHERE "id" = ${id} AND "companyId" = ${companyId} FOR UPDATE`;

      const receivable = await tx.cacaoReceivable.findFirst({
        where: { id, companyId },
      });
      if (!receivable)
        throw new NotFoundException('Cuenta por cobrar no encontrada');
      if (receivable.status === 'RECEIVED')
        throw new BadRequestException('Ya está cobrada');

      const balance = round2(
        receivable.totalAmount - receivable.receivedAmount,
      );
      if (amount > balance + TOLERANCIA_MONTO)
        throw new BadRequestException(
          `El monto excede el saldo pendiente ($${balance.toFixed(2)})`,
        );

      const newReceived = round2(receivable.receivedAmount + amount);
      const fullyReceived =
        newReceived >= receivable.totalAmount - TOLERANCIA_MONTO;

      await tx.cacaoPayment.create({
        data: {
          type: 'RECEIPT',
          receivableId: id,
          amount,
          method: dto.method,
          reference: dto.reference?.trim() || null,
          companyId,
          createdBy: userId,
        },
      });
      await tx.cacaoReceivable.update({
        where: { id },
        data: {
          receivedAmount: newReceived,
          status: fullyReceived ? 'RECEIVED' : 'PARTIAL',
        },
      });
      if (fullyReceived && receivable.shipmentId) {
        await tx.cacaoShipment.update({
          where: { id: receivable.shipmentId },
          data: { status: 'COMPLETED' },
        });
      }
    });

    return this.findOne(id, companyId);
  }

  /** Anula un cobro registrado por error; la cuenta recupera ese saldo. */
  async voidReceipt(
    paymentId: number,
    reason: string,
    companyId: number,
    userId: number,
  ) {
    const receivableId = await this.prisma.$transaction(async (tx) => {
      const payment = await tx.cacaoPayment.findFirst({
        where: { id: paymentId, companyId, type: 'RECEIPT' },
      });
      if (!payment || !payment.receivableId)
        throw new NotFoundException('Cobro no encontrado');

      await tx.$queryRaw`SELECT "id" FROM "CacaoReceivable" WHERE "id" = ${payment.receivableId} FOR UPDATE`;

      const current = await tx.cacaoPayment.findUnique({
        where: { id: paymentId },
      });
      if (current?.voidedAt)
        throw new BadRequestException('Este cobro ya fue anulado');
      const receivable = await tx.cacaoReceivable.findUniqueOrThrow({
        where: { id: payment.receivableId },
      });

      const newReceived = Math.max(
        0,
        round2(receivable.receivedAmount - payment.amount),
      );
      await tx.cacaoPayment.update({
        where: { id: paymentId },
        data: {
          voidedAt: new Date(),
          voidedBy: userId,
          voidReason: reason.trim(),
        },
      });
      await tx.cacaoReceivable.update({
        where: { id: receivable.id },
        data: {
          receivedAmount: newReceived,
          status: newReceived <= 0 ? 'PENDING' : 'PARTIAL',
        },
      });
      if (receivable.status === 'RECEIVED') {
        await tx.cacaoShipment.update({
          where: { id: receivable.shipmentId },
          data: { status: 'PENDING' },
        });
      }
      return receivable.id;
    });

    return this.findOne(receivableId, companyId);
  }

  private async findOne(id: number, companyId: number) {
    return this.prisma.cacaoReceivable.findFirstOrThrow({
      where: { id, companyId },
      include: {
        client: true,
        payments: { orderBy: { createdAt: 'asc' } },
      },
    });
  }
}
