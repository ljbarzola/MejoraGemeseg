import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class PersonalService {
  constructor(private readonly prisma: PrismaService) {}

  async getDashboard(companyId: number) {
    const now = new Date();
    const [totalCandidates, activeCertifications, pendingContracts, alertCount] = await Promise.all([
      this.prisma.candidate.count({ where: { companyId } }),
      this.prisma.certification.count({ where: { companyId, status: 'ACTIVE' } }),
      this.prisma.contract.count({ where: { companyId, status: 'DRAFT' } }),
      // Mismo criterio que CertificationService.getAlerts: sin el `gte` el KPI
      // sumaba certificaciones ya vencidas y no cuadraba con la lista de alertas.
      this.prisma.certification.count({
        where: {
          companyId,
          status: 'ACTIVE',
          expiryDate: {
            gte: now,
            lte: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000),
          },
        },
      }),
    ]);

    return { totalCandidates, activeCertifications, pendingContracts, alertCount };
  }
}
