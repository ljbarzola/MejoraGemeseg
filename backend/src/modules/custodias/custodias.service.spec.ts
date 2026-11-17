import { BadRequestException, NotFoundException } from '@nestjs/common';
import { CustodiasService } from './custodias.service';
import { PrismaService } from '../../prisma/prisma.service';

function makeCustodia(overrides: Partial<any> = {}) {
  return {
    id: 1,
    numeroGuia: 'G-001',
    tipoCustodia: 'HACIENDA',
    estado: 'LLEGO',
    choferName: 'Juan Chofer',
    choferCedula: '1111111111',
    custodio1Name: 'Ana Custodio',
    custodio1Cedula: '2222222222',
    custodio2Name: 'Luis Custodio',
    custodio2Cedula: '3333333333',
    cliente: 'Cliente X',
    placa: 'ABC-123',
    direccionSalida: 'Origen',
    direccionLlegada: 'Destino',
    fechaHoraSalida: new Date('2026-08-01T10:00:00Z'),
    fechaHoraLlegada: new Date('2026-08-01T14:00:00Z'),
    createdAt: new Date('2026-08-01T09:00:00Z'),
    companyId: 1,
    ...overrides,
  };
}

describe('CustodiasService', () => {
  let service: CustodiasService;
  let prisma: {
    custodia: {
      findUnique: jest.Mock;
      findFirst: jest.Mock;
      findMany: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
      count: jest.Mock;
    };
    employeeDriveFolder: { findMany: jest.Mock; findFirst: jest.Mock };
    $queryRaw: jest.Mock;
  };

  beforeEach(() => {
    prisma = {
      custodia: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
        count: jest.fn(),
      },
      employeeDriveFolder: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn(),
      },
      // Pagos registrados en Contabilidad: por defecto, ninguno.
      $queryRaw: jest.fn().mockResolvedValue([{ n: 0 }]),
    };
    service = new CustodiasService(prisma as unknown as PrismaService);
  });

  describe('create', () => {
    it('rejects a duplicate numeroGuia', async () => {
      prisma.custodia.findUnique.mockResolvedValue(makeCustodia());

      await expect(
        service.create(
          { numeroGuia: 'G-001', tipoCustodia: 'hacienda' } as any,
          1,
          1,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.custodia.create).not.toHaveBeenCalled();
    });

    it('normalizes tipoCustodia to upper snake case', async () => {
      prisma.custodia.findUnique.mockResolvedValue(null);
      prisma.custodia.create.mockResolvedValue(makeCustodia());

      await service.create(
        {
          numeroGuia: 'G-002',
          tipoCustodia: 'puerto viejo',
          choferName: 'Chofer',
          custodio1Name: 'C1',
          custodio2Name: 'C2',
        },
        1,
        1,
      );

      expect(prisma.custodia.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ tipoCustodia: 'PUERTO_VIEJO' }),
        }),
      );
    });
  });

  describe('updateEstado', () => {
    it('rejects an invalid estado without touching the database', async () => {
      await expect(
        service.updateEstado(1, 'EN_PROCESO', 1),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.custodia.findFirst).not.toHaveBeenCalled();
      expect(prisma.custodia.update).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when the custodia does not belong to the company', async () => {
      prisma.custodia.findFirst.mockResolvedValue(null);

      await expect(
        service.updateEstado(1, 'EN_CAMINO', 1),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.custodia.update).not.toHaveBeenCalled();
    });

    it('avanza al paso siguiente', async () => {
      prisma.custodia.findFirst.mockResolvedValue(
        makeCustodia({ estado: 'LISTO_PARA_CUSTODIAR' }),
      );
      prisma.custodia.update.mockResolvedValue(
        makeCustodia({ estado: 'EN_CAMINO' }),
      );

      const result = await service.updateEstado(1, 'EN_CAMINO', 1);

      expect(prisma.custodia.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { estado: 'EN_CAMINO', fechaHoraSalida: expect.any(Date) },
      });
      expect(result.estado).toBe('EN_CAMINO');
    });

    it('«Salió» guarda la hora que se eligió, y «Llegó» la suya', async () => {
      prisma.custodia.findFirst.mockResolvedValue(makeCustodia({ estado: 'LISTO_PARA_CUSTODIAR' }));
      prisma.custodia.update.mockResolvedValue(makeCustodia());
      await service.updateEstado(1, 'EN_CAMINO', 1, '2026-07-01T13:00:00.000Z');
      expect(prisma.custodia.update.mock.calls[0][0].data).toEqual({
        estado: 'EN_CAMINO',
        fechaHoraSalida: new Date('2026-07-01T13:00:00.000Z'),
      });

      prisma.custodia.findFirst.mockResolvedValue(makeCustodia({ estado: 'EN_CAMINO' }));
      await service.updateEstado(1, 'LLEGO', 1, '2026-08-01T18:00:00.000Z');
      expect(prisma.custodia.update.mock.calls[1][0].data).toEqual({
        estado: 'LLEGO',
        fechaHoraLlegada: new Date('2026-08-01T18:00:00.000Z'),
      });
    });

    it('sin hora elegida toma el momento de marcar', async () => {
      prisma.custodia.findFirst.mockResolvedValue(makeCustodia({ estado: 'EN_CAMINO', fechaHoraSalida: null }));
      prisma.custodia.update.mockResolvedValue(makeCustodia());
      await service.updateEstado(1, 'LLEGO', 1);
      const marcada: Date = prisma.custodia.update.mock.calls[0][0].data.fechaHoraLlegada;
      expect(Math.abs(marcada.getTime() - Date.now())).toBeLessThan(5000);
    });

    it('rechaza una hora futura y una llegada anterior a la salida', async () => {
      prisma.custodia.findFirst.mockResolvedValue(makeCustodia({ estado: 'LISTO_PARA_CUSTODIAR' }));
      await expect(
        service.updateEstado(1, 'EN_CAMINO', 1, new Date(Date.now() + 3600 * 1000).toISOString()),
      ).rejects.toBeInstanceOf(BadRequestException);

      prisma.custodia.findFirst.mockResolvedValue(makeCustodia({ estado: 'EN_CAMINO' })); // salió 2026-08-01 10:00Z
      await expect(
        service.updateEstado(1, 'LLEGO', 1, '2026-08-01T09:00:00.000Z'),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.custodia.update).not.toHaveBeenCalled();
    });

    it('volver al inicio borra la hora de llegada pero deja la de salida', async () => {
      prisma.custodia.findFirst.mockResolvedValue(makeCustodia({ estado: 'LLEGO' }));
      prisma.custodia.update.mockResolvedValue(makeCustodia());
      await service.updateEstado(1, 'LISTO_PARA_CUSTODIAR', 1);
      expect(prisma.custodia.update.mock.calls[0][0].data).toEqual({
        estado: 'LISTO_PARA_CUSTODIAR',
        fechaHoraLlegada: null,
      });
    });

    it('vuelve al inicio desde En camino y desde Llegó', async () => {
      for (const estado of ['EN_CAMINO', 'LLEGO']) {
        prisma.custodia.findFirst.mockResolvedValue(makeCustodia({ estado }));
        prisma.custodia.update.mockResolvedValue(
          makeCustodia({ estado: 'LISTO_PARA_CUSTODIAR' }),
        );
        await service.updateEstado(1, 'LISTO_PARA_CUSTODIAR', 1);
      }
      expect(prisma.custodia.update).toHaveBeenCalledTimes(2);
    });

    it('no deja saltarse un paso, retroceder de a uno ni repetir el estado', async () => {
      const casos: [string, string][] = [
        ['LISTO_PARA_CUSTODIAR', 'LLEGO'],
        ['LLEGO', 'EN_CAMINO'],
        ['EN_CAMINO', 'EN_CAMINO'],
        ['LISTO_PARA_CUSTODIAR', 'LISTO_PARA_CUSTODIAR'],
      ];
      for (const [desde, hacia] of casos) {
        prisma.custodia.findFirst.mockResolvedValue(makeCustodia({ estado: desde }));
        await expect(service.updateEstado(1, hacia, 1)).rejects.toBeInstanceOf(
          BadRequestException,
        );
      }
      expect(prisma.custodia.update).not.toHaveBeenCalled();
    });
  });

  describe('viaje con pagos registrados en Contabilidad', () => {
    beforeEach(() => {
      prisma.custodia.findFirst.mockResolvedValue(makeCustodia({ estado: 'LLEGO' }));
      prisma.$queryRaw.mockResolvedValue([{ n: 3 }]);
    });

    it('no se elimina, no vuelve al inicio y no cambia de tipo ni de personal', async () => {
      await expect(service.remove(1, 1)).rejects.toBeInstanceOf(BadRequestException);
      await expect(service.updateEstado(1, 'LISTO_PARA_CUSTODIAR', 1)).rejects.toBeInstanceOf(BadRequestException);
      await expect(service.update(1, { tipoCustodia: 'VIP' }, 1)).rejects.toBeInstanceOf(BadRequestException);
      await expect(service.update(1, { choferName: 'Otro Chofer' }, 1)).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.custodia.delete).not.toHaveBeenCalled();
      expect(prisma.custodia.update).not.toHaveBeenCalled();
    });

    it('sí deja corregir lo que no mueve el pago (cliente, placa, direcciones)', async () => {
      prisma.custodia.update.mockResolvedValue(makeCustodia());
      await service.update(1, { cliente: 'Nuevo cliente', placa: 'ZZZ-1' }, 1);
      expect(prisma.custodia.update).toHaveBeenCalledTimes(1);
    });
  });

  describe('update', () => {
    it('cambia solo lo que llega y no toca el estado', async () => {
      prisma.custodia.findFirst.mockResolvedValue(makeCustodia());
      prisma.custodia.update.mockResolvedValue(makeCustodia());

      await service.update(1, { cliente: '  Otro cliente ', placa: 'XYZ-9' }, 1);

      const data = prisma.custodia.update.mock.calls[0][0].data;
      expect(data).toEqual(
        expect.objectContaining({ cliente: 'Otro cliente', placa: 'XYZ-9' }),
      );
      expect(data.estado).toBeUndefined();
      expect(data.choferName).toBeUndefined();
    });

    it('rechaza una guía que ya usa otro viaje, pero deja la propia', async () => {
      prisma.custodia.findFirst.mockResolvedValue(makeCustodia());
      prisma.custodia.findUnique.mockResolvedValue(makeCustodia({ id: 2, numeroGuia: 'G-009' }));
      await expect(
        service.update(1, { numeroGuia: 'G-009' }, 1),
      ).rejects.toBeInstanceOf(BadRequestException);

      prisma.custodia.update.mockResolvedValue(makeCustodia());
      await service.update(1, { numeroGuia: 'G-001' }, 1);
      expect(prisma.custodia.update).toHaveBeenCalledTimes(1);
    });

    it('al dejar de ser hacienda se borran la hacienda y los sacos', async () => {
      prisma.custodia.findFirst.mockResolvedValue(
        makeCustodia({ nombreHacienda: 'La Esperanza', cantidadSacos: 50 }),
      );
      prisma.custodia.update.mockResolvedValue(makeCustodia());
      await service.update(1, { tipoCustodia: 'VIP' }, 1);
      const data = prisma.custodia.update.mock.calls[0][0].data;
      expect(data.tipoCustodia).toBe('VIP');
      expect(data.nombreHacienda).toBeNull();
      expect(data.cantidadSacos).toBeNull();
    });

    it('no deja a la misma persona dos veces ni vaciar un nombre', async () => {
      prisma.custodia.findFirst.mockResolvedValue(makeCustodia());
      await expect(
        service.update(1, { custodio1Cedula: '1111111111' }, 1),
      ).rejects.toBeInstanceOf(BadRequestException);
      await expect(
        service.update(1, { choferName: '  ' }, 1),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.custodia.update).not.toHaveBeenCalled();
    });

    it('avisa si el viaje no es de la empresa', async () => {
      prisma.custodia.findFirst.mockResolvedValue(null);
      await expect(service.update(1, { placa: 'X' }, 1)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('getDashboardStats', () => {
    it('counts every custodia por estado and only counts finalizadas per type, with no money', async () => {
      prisma.custodia.findMany.mockResolvedValue([
        makeCustodia({ id: 1, tipoCustodia: 'HACIENDA', estado: 'LLEGO' }),
        makeCustodia({ id: 2, tipoCustodia: 'PUERTO', estado: 'EN_CAMINO' }),
        makeCustodia({
          id: 3,
          tipoCustodia: 'VIP',
          estado: 'LISTO_PARA_CUSTODIAR',
        }),
      ]);

      const stats = await service.getDashboardStats(1, '2026-08');

      expect(stats.kpis.total_viajes).toBe(3);
      expect(stats.kpis.viajes_finalizados).toBe(1);
      expect(stats.kpis).not.toHaveProperty('total_nomina_usd'); // el dinero vive en Contabilidad
      expect(stats.por_tipo.find((t) => t.tipo === 'HACIENDA')?.cantidad).toBe(1);
      expect(stats.por_tipo.find((t) => t.tipo === 'PUERTO')?.cantidad).toBe(0);
      expect(stats.por_estado).toEqual(
        expect.arrayContaining([
          { estado: 'LISTO_PARA_CUSTODIAR', cantidad: 1 },
          { estado: 'EN_CAMINO', cantidad: 1 },
          { estado: 'LLEGO', cantidad: 1 },
        ]),
      );
    });
  });

  describe('remove', () => {
    it('throws NotFoundException instead of deleting when the custodia is not found', async () => {
      prisma.custodia.findFirst.mockResolvedValue(null);

      await expect(service.remove(1, 1)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(prisma.custodia.delete).not.toHaveBeenCalled();
    });
  });
});
