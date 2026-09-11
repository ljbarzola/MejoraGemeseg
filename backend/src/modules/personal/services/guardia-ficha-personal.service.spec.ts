import { GuardiaFichaPersonalService } from './guardia-ficha-personal.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { MovimientoPersonalService } from './movimiento-personal.service';

describe('GuardiaFichaPersonalService.upsert', () => {
  let service: GuardiaFichaPersonalService;
  let prisma: { guardiaFichaPersonal: { upsert: jest.Mock } };
  let movimientoPersonalService: { isActivo: jest.Mock };

  beforeEach(() => {
    prisma = {
      guardiaFichaPersonal: { upsert: jest.fn().mockResolvedValue({}) },
    };
    movimientoPersonalService = { isActivo: jest.fn().mockResolvedValue(true) };
    service = new GuardiaFichaPersonalService(
      prisma as unknown as PrismaService,
      movimientoPersonalService as unknown as MovimientoPersonalService,
    );
  });

  it('normaliza strings vacíos/whitespace a null en vez de guardarlos tal cual', async () => {
    await service.upsert(1, '0912345678', {
      telefono: '  ',
      email: '',
      direccion: 'Av. Siempre Viva 123',
    });

    expect(prisma.guardiaFichaPersonal.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({
          telefono: null,
          email: null,
          direccion: 'Av. Siempre Viva 123',
        }),
      }),
    );
  });

  it('convierte fechaNacimiento string a Date, y ausencia a null', async () => {
    await service.upsert(1, '0912345678', { fechaNacimiento: '1990-05-20' });

    const call = prisma.guardiaFichaPersonal.upsert.mock.calls[0][0];
    expect(call.update.fechaNacimiento).toBeInstanceOf(Date);

    await service.upsert(1, '0912345678', {});
    const secondCall = prisma.guardiaFichaPersonal.upsert.mock.calls[1][0];
    expect(secondCall.update.fechaNacimiento).toBeNull();
  });

  it('crea con companyId/cedula la primera vez', async () => {
    await service.upsert(2, '0987654321', { telefono: '099' });

    expect(prisma.guardiaFichaPersonal.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { companyId_cedula: { companyId: 2, cedula: '0987654321' } },
        create: expect.objectContaining({
          companyId: 2,
          cedula: '0987654321',
          telefono: '099',
        }),
      }),
    );
  });
});
