import { EntidadService } from './entidad.service';
import { PrismaService } from '../../../prisma/prisma.service';

describe('EntidadService.update', () => {
  let service: EntidadService;
  let prisma: {
    entidad: { findFirst: jest.Mock; update: jest.Mock };
  };

  const entidad = {
    id: 1,
    companyId: 1,
    nombre: 'Banco Pichincha',
    tipo: 'PRIVADA',
  };

  beforeEach(() => {
    prisma = {
      entidad: {
        findFirst: jest.fn().mockResolvedValue(entidad),
        update: jest.fn().mockResolvedValue(entidad),
      },
    };
    service = new EntidadService(prisma as unknown as PrismaService);
  });

  it('permite editar "tipo" a mano (desde 2026-09-10) — el sync solo avisa si no coincide, nunca lo sobreescribe', async () => {
    await service.update(1, 1, { nombre: 'Nuevo nombre', tipo: 'PUBLICA' });

    expect(prisma.entidad.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: { nombre: 'Nuevo nombre', tipo: 'PUBLICA' },
    });
  });

  it('sigue permitiendo actualizar nombre/activo normalmente', async () => {
    await service.update(1, 1, { activo: false });

    expect(prisma.entidad.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: { activo: false },
    });
  });
});
