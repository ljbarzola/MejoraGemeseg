import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';

// Alertas de capacitaciones pendientes (vencidas y por vencer) en una sola
// respuesta, consumida por el widget del dashboard de Personal
// (ver PersonalDashboard.tsx).
@Injectable()
export class PersonalAlertsService {
  constructor(private readonly prisma: PrismaService) {}

  async getAlerts(companyId: number) {
    const now = new Date();
    const in30Days = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    const [trainingsVencidas, trainingsPorVencer] =
      await Promise.all([
        // Antes "trainings" mezclaba vencidas y por vencer en un solo array
        // (dueDate <= in30Days, sin gte:now) — el dashboard no podía mostrar
        // un conteo de vencidas por separado, por eso son dos consultas.
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

    return { trainingsVencidas, trainingsPorVencer };
  }
}
