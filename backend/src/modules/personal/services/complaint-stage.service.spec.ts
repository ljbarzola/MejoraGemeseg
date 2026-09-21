import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ComplaintStageService } from './complaint-stage.service';
import { PrismaService } from '../../../prisma/prisma.service';

describe('ComplaintStageService.delete', () => {
  let service: ComplaintStageService;
  let prisma: {
    complaintStage: { findFirst: jest.Mock; delete: jest.Mock };
    complaint: { count: jest.Mock; findMany: jest.Mock };
  };

  const companyId = 1;

  beforeEach(() => {
    prisma = {
      complaintStage: { findFirst: jest.fn(), delete: jest.fn() },
      complaint: { count: jest.fn(), findMany: jest.fn() },
    };
    service = new ComplaintStageService(prisma as unknown as PrismaService);
  });

  it('lanza NotFoundException si la etapa no existe en la empresa', async () => {
    prisma.complaintStage.findFirst.mockResolvedValue(null);

    await expect(service.delete(99, companyId)).rejects.toThrow(
      NotFoundException,
    );
    expect(prisma.complaint.count).not.toHaveBeenCalled();
  });

  it('bloquea el borrado si la etapa es la inicial, sin llegar a contar quejas', async () => {
    prisma.complaintStage.findFirst.mockResolvedValue({
      id: 1,
      companyId,
      key: 'RECIBIDA',
      label: 'Recibida',
      isInitial: true,
      isFinal: false,
    });

    await expect(service.delete(1, companyId)).rejects.toThrow(
      BadRequestException,
    );
    expect(prisma.complaint.count).not.toHaveBeenCalled();
    expect(prisma.complaintStage.delete).not.toHaveBeenCalled();
  });

  it('bloquea el borrado y lista las quejas concretas si hay quejas activas en la etapa', async () => {
    prisma.complaintStage.findFirst.mockResolvedValue({
      id: 2,
      companyId,
      key: 'EN_SOLUCION',
      label: 'En solución',
      isInitial: false,
      isFinal: false,
    });
    prisma.complaint.count.mockResolvedValue(2);
    prisma.complaint.findMany.mockResolvedValue([
      { id: 10, description: 'Falta de EPP en el turno de la noche' },
      { id: 11, description: 'Retraso reiterado en el pago de horas extra' },
    ]);

    await expect(service.delete(2, companyId)).rejects.toThrow(
      BadRequestException,
    );
    let message = '';
    try {
      await service.delete(2, companyId);
    } catch (err: any) {
      message = err.message;
    }
    expect(message).toContain('#10');
    expect(message).toContain('#11');
    expect(message).toContain('En solución');
    expect(prisma.complaintStage.delete).not.toHaveBeenCalled();
  });

  it('borra la etapa cuando no es la inicial y no tiene quejas activas', async () => {
    const stage = {
      id: 3,
      companyId,
      key: 'CERRADA',
      label: 'Cerrada',
      isInitial: false,
      isFinal: true,
    };
    prisma.complaintStage.findFirst.mockResolvedValue(stage);
    prisma.complaint.count.mockResolvedValue(0);
    prisma.complaintStage.delete.mockResolvedValue(stage);

    const result = await service.delete(3, companyId);

    expect(result).toEqual(stage);
    expect(prisma.complaintStage.delete).toHaveBeenCalledWith({
      where: { id: 3 },
    });
  });
});
