import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class PersonalService {
  constructor(private readonly prisma: PrismaService) {}

  async getDashboard(companyId: number) {
    const [totalCandidates, activeCertifications, pendingContracts, alertCount] = await Promise.all([
      this.prisma.candidate.count({ where: { companyId } }),
      this.prisma.certification.count({ where: { companyId, status: 'ACTIVE' } }),
      this.prisma.contract.count({ where: { companyId, status: 'DRAFT' } }),
      this.prisma.certification.count({
        where: {
          companyId,
          status: 'ACTIVE',
          expiryDate: { lte: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) },
        },
      }),
    ]);

    return { totalCandidates, activeCertifications, pendingContracts, alertCount };
  }
}
