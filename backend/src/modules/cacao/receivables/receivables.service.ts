import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';

@Injectable()
export class CacaoReceivablesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(companyId: number, query: { status?: string }) {
    const where: any = { companyId };
    if (query.status) where.status = query.status;
    return this.prisma.cacaoReceivable.findMany({
      where,
      include: { client: true, shipment: true, payments: true },
      orderBy: { dueDate: 'asc' },
    });
  }

  async receive(id: number, amount: number, method: string, reference: string | undefined, companyId: number) {
    const receivable = await this.prisma.cacaoReceivable.findFirst({ where: { id, companyId } });
    if (!receivable) throw new NotFoundException('Cuenta por cobrar no encontrada');
    if (receivable.status === 'RECEIVED') throw new BadRequestException('Ya está cobrada');

    const newReceived = receivable.receivedAmount + amount;
    if (newReceived > receivable.totalAmount) throw new BadRequestException('El monto excede el total');

    await this.prisma.cacaoPayment.create({
      data: {
        type: 'RECEIPT',
        receivableId: id,
        amount,
        method,
        reference: reference || null,
        companyId,
      },
    });

    return this.prisma.cacaoReceivable.update({
      where: { id },
      data: {
        receivedAmount: newReceived,
        status: newReceived >= receivable.totalAmount ? 'RECEIVED' : 'PARTIAL',
      },
      include: { client: true, payments: true },
    });
  }
}
