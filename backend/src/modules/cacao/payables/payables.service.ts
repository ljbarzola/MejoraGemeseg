import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';

@Injectable()
export class CacaoPayablesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(companyId: number, query: { status?: string }) {
    const where: any = { companyId };
    if (query.status) where.status = query.status;
    return this.prisma.cacaoPayable.findMany({
      where,
      include: { supplier: true, settlement: true, payments: true },
      orderBy: { dueDate: 'asc' },
    });
  }

  async pay(id: number, amount: number, method: string, reference: string | undefined, companyId: number) {
    const payable = await this.prisma.cacaoPayable.findFirst({ where: { id, companyId } });
    if (!payable) throw new NotFoundException('Cuenta por pagar no encontrada');
    if (payable.status === 'PAID') throw new BadRequestException('Ya está pagada');

    const newPaid = payable.paidAmount + amount;
    if (newPaid > payable.totalAmount) throw new BadRequestException('El monto excede el saldo');

    await this.prisma.cacaoPayment.create({
      data: {
        type: 'PAYMENT',
        payableId: id,
        amount,
        method,
        reference: reference || null,
        companyId,
      },
    });

    return this.prisma.cacaoPayable.update({
      where: { id },
      data: {
        paidAmount: newPaid,
        status: newPaid >= payable.totalAmount ? 'PAID' : 'PARTIAL',
      },
      include: { supplier: true, payments: true },
    });
  }
}
