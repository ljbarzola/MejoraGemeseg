import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';

@Injectable()
export class VerificationService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(companyId: number, cedula?: string) {
    return this.prisma.verificationCheck.findMany({
      where: { companyId, ...(cedula ? { cedula } : {}) },
      include: { verifier: { select: { id: true, fullName: true, email: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async create(data: { cedula: string; platform: string; status?: string; notes?: string }, companyId: number, userId: number) {
    return this.prisma.verificationCheck.create({
      data: {
        cedula: data.cedula,
        platform: data.platform,
        status: data.status || 'PENDIENTE',
        notes: data.notes || null,
        companyId,
        verifiedBy: userId,
      },
      include: { verifier: { select: { id: true, fullName: true, email: true } } },
    });
  }

  async update(id: number, data: { platform?: string; status?: string; notes?: string }, companyId: number, userId: number) {
    const existing = await this.prisma.verificationCheck.findFirst({ where: { id, companyId } });
    if (!existing) throw new NotFoundException('Verificación no encontrada');
    return this.prisma.verificationCheck.update({
      where: { id },
      data: { ...data, verifiedBy: userId, verifiedAt: new Date() },
      include: { verifier: { select: { id: true, fullName: true, email: true } } },
    });
  }

  async remove(id: number, companyId: number) {
    const existing = await this.prisma.verificationCheck.findFirst({ where: { id, companyId } });
    if (!existing) throw new NotFoundException('Verificación no encontrada');
    return this.prisma.verificationCheck.delete({ where: { id } });
  }
}
