import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { PaymentDto, round2, TOLERANCIA_MONTO } from '../common/payment.dto';

@Injectable()
export class CacaoPayablesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(companyId: number, query: { status?: string }) {
    const where: Prisma.CacaoPayableWhereInput = { companyId };
    if (query.status) where.status = query.status;
    return this.prisma.cacaoPayable.findMany({
      where,
      include: {
        supplier: true,
        settlement: true,
        payments: { orderBy: { createdAt: 'asc' } },
      },
      orderBy: { dueDate: 'asc' },
    });
  }

  /**
   * Registra un pago. Todo ocurre en una transacción con la cuenta bloqueada: dos pagos
   * simultáneos ya no pueden superar el saldo, y si algo falla no queda un pago suelto.
   */
  async pay(id: number, dto: PaymentDto, companyId: number, userId: number) {
    const amount = round2(dto.amount);

    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "CacaoPayable" WHERE "id" = ${id} AND "companyId" = ${companyId} FOR UPDATE`;

      const payable = await tx.cacaoPayable.findFirst({
        where: { id, companyId },
        include: { settlement: true },
      });
      if (!payable)
        throw new NotFoundException('Cuenta por pagar no encontrada');
      if (payable.status === 'PAID')
        throw new BadRequestException('Ya está pagada');
      if (payable.status === 'CANCELLED')
        throw new BadRequestException('La cuenta por pagar fue anulada');
      if (payable.settlement.status !== 'APPROVED')
        throw new BadRequestException(
          'La liquidación aún no está aprobada, no se puede pagar',
        );

      const balance = round2(payable.totalAmount - payable.paidAmount);
      if (amount > balance + TOLERANCIA_MONTO)
        throw new BadRequestException(
          `El monto excede el saldo pendiente ($${balance.toFixed(2)})`,
        );

      const newPaid = round2(payable.paidAmount + amount);
      const fullyPaid = newPaid >= payable.totalAmount - TOLERANCIA_MONTO;

      await tx.cacaoPayment.create({
        data: {
          type: 'PAYMENT',
          payableId: id,
          amount,
          method: dto.method,
          reference: dto.reference?.trim() || null,
          companyId,
          createdBy: userId,
        },
      });
      await tx.cacaoPayable.update({
        where: { id },
        data: {
          paidAmount: newPaid,
          status: fullyPaid ? 'PAID' : 'PARTIAL',
        },
      });
      if (fullyPaid) {
        await tx.cacaoSettlement.update({
          where: { id: payable.settlementId },
          data: { status: 'PAID' },
        });
      }
    });

    return this.findOne(id, companyId);
  }

  /** Anula un pago registrado por error; la cuenta recupera ese saldo. */
  async voidPayment(
    paymentId: number,
    reason: string,
    companyId: number,
    userId: number,
  ) {
    const payableId = await this.prisma.$transaction(async (tx) => {
      const payment = await tx.cacaoPayment.findFirst({
        where: { id: paymentId, companyId, type: 'PAYMENT' },
      });
      if (!payment || !payment.payableId)
        throw new NotFoundException('Pago no encontrado');

      await tx.$queryRaw`SELECT "id" FROM "CacaoPayable" WHERE "id" = ${payment.payableId} FOR UPDATE`;

      // Se vuelve a leer ya con la cuenta bloqueada.
      const current = await tx.cacaoPayment.findUnique({
        where: { id: paymentId },
      });
      if (current?.voidedAt)
        throw new BadRequestException('Este pago ya fue anulado');
      const payable = await tx.cacaoPayable.findUniqueOrThrow({
        where: { id: payment.payableId },
      });

      const newPaid = Math.max(0, round2(payable.paidAmount - payment.amount));
      await tx.cacaoPayment.update({
        where: { id: paymentId },
        data: {
          voidedAt: new Date(),
          voidedBy: userId,
          voidReason: reason.trim(),
        },
      });
      await tx.cacaoPayable.update({
        where: { id: payable.id },
        data: {
          paidAmount: newPaid,
          status: newPaid <= 0 ? 'PENDING' : 'PARTIAL',
        },
      });
      if (payable.status === 'PAID') {
        await tx.cacaoSettlement.update({
          where: { id: payable.settlementId },
          data: { status: 'APPROVED' },
        });
      }
      return payable.id;
    });

    return this.findOne(payableId, companyId);
  }

  private async findOne(id: number, companyId: number) {
    return this.prisma.cacaoPayable.findFirstOrThrow({
      where: { id, companyId },
      include: {
        supplier: true,
        settlement: true,
        payments: { orderBy: { createdAt: 'asc' } },
      },
    });
  }
}
