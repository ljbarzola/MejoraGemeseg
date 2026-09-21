import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';

// Reemplaza el endpoint muerto certifications/alerts (nadie lo llamaba, no
// había cron ni consumidor en el frontend — ver hallazgos previos). Este
// combina certificaciones por vencer y capacitaciones pendientes en una
// sola respuesta que sí se consume desde un widget real (ver
// PersonalDashboard.tsx).
@Injectable()
export class PersonalAlertsService {
  constructor(private readonly prisma: PrismaService) {}

  async getAlerts(companyId: number) {
    const now = new Date();
    const in30Days = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    const [certifications, trainingsVencidas, trainingsPorVencer] =
      await Promise.all([
        this.prisma.certification.findMany({
          where: {
            companyId,
            status: 'ACTIVE',
            expiryDate: { gte: now, lte: in30Days },
          },
          orderBy: { expiryDate: 'asc' },
        }),
        // Antes "trainings" mezclaba vencidas y por vencer en un solo array
        // (dueDate <= in30Days, sin gte:now) — el dashboard no podía mostrar
        // un conteo de vencidas por separado. Se separan con el mismo
        // criterio que ya usa Certification arriba.
        this.prisma.training.findMany({
          where: {
            companyId,
            dueDate: { not: null, lt: now },
            completed: false,
          },
          orderBy: { dueDate: 'asc' },
        }),
        this.prisma.training.findMany({
          where: {
            companyId,
            dueDate: { gte: now, lte: in30Days },
            completed: false,
          },
          orderBy: { dueDate: 'asc' },
        }),
      ]);

    return { certifications, trainingsVencidas, trainingsPorVencer };
  }
}
