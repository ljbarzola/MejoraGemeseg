import { PersonalAlertsService } from './personal-alerts.service';
import { PrismaService } from '../../../prisma/prisma.service';

describe('PersonalAlertsService.getAlerts', () => {
  let service: PersonalAlertsService;
  let prisma: {
    certification: { findMany: jest.Mock };
    training: { findMany: jest.Mock };
  };

  beforeEach(() => {
    prisma = {
      certification: { findMany: jest.fn().mockResolvedValue([]) },
      training: { findMany: jest.fn().mockResolvedValue([]) },
    };
    service = new PersonalAlertsService(prisma as unknown as PrismaService);
  });

  it('separa las capacitaciones vencidas de las por vencer en dos consultas distintas', async () => {
    await service.getAlerts(1);

    expect(prisma.training.findMany).toHaveBeenCalledTimes(2);

    const [vencidasCall, porVencerCall] = prisma.training.findMany.mock.calls;
    expect(vencidasCall[0].where.dueDate).toEqual(
      expect.objectContaining({ lt: expect.any(Date) }),
    );
    expect(vencidasCall[0].where.dueDate.gte).toBeUndefined();
    expect(porVencerCall[0].where.dueDate).toEqual(
      expect.objectContaining({ gte: expect.any(Date), lte: expect.any(Date) }),
    );
  });

  it('devuelve trainingsVencidas y trainingsPorVencer como listas separadas', async () => {
    const vencida = { id: 1, dueDate: new Date('2020-01-01'), completed: false };
    const porVencer = { id: 2, dueDate: new Date(), completed: false };
    prisma.training.findMany
      .mockResolvedValueOnce([vencida])
      .mockResolvedValueOnce([porVencer]);

    const result = await service.getAlerts(1);

    expect(result.trainingsVencidas).toEqual([vencida]);
    expect(result.trainingsPorVencer).toEqual([porVencer]);
  });
});
