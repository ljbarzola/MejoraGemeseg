import { BadRequestException, NotFoundException } from '@nestjs/common';
import { CustodiasService } from './custodias.service';
import { PrismaService } from '../../prisma/prisma.service';
import { CustodiasGuiaService } from './custodias-guia.service';

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
    cPPuestoGuardia: { findMany: jest.Mock };
    $queryRaw: jest.Mock;
  };
  let guias: { preparar: jest.Mock; rutaDeViaje: jest.Mock; clienteDirectorio: jest.Mock; firmaEfectiva: jest.Mock };

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
      // Guardias de los puestos de Operaciones: por defecto, ninguno.
      cPPuestoGuardia: { findMany: jest.fn().mockResolvedValue([]) },
      // Pagos registrados en Contabilidad: por defecto, ninguno.
      $queryRaw: jest.fn().mockResolvedValue([{ n: 0 }]),
    };
    // La revisión de cliente, ruta y guía vive en CustodiasGuiaService (con su propia base de configuración):
    // aquí se reemplaza por una versión mínima que solo devuelve lo que se le da.
    guias = {
      preparar: jest.fn(async (_companyId: number, p: any) => ({
        clienteId: p.clienteId === undefined ? (p.actual?.clienteId ?? null) : p.clienteId,
        cliente: p.clienteTexto?.trim(),
        rutaId: p.rutaId === undefined ? (p.actual?.rutaId ?? null) : p.rutaId,
        guia: {},
        columnas: null,
      })),
      rutaDeViaje: jest.fn().mockResolvedValue(null),
      clienteDirectorio: jest.fn().mockResolvedValue(null),
      firmaEfectiva: jest.fn().mockResolvedValue('LLEGADA'),
    };
    service = new CustodiasService(
      prisma as unknown as PrismaService,
      guias as unknown as CustodiasGuiaService,
    );
  });

  describe('getAvailableCustodios', () => {
    it('ofrece a todos los guardias; a quien no tiene documento lo marca «sin cédula» y no entrega la clave interna', async () => {
      prisma.employeeDriveFolder.findMany.mockResolvedValue([
        { employeeName: 'Ana Mora', cedula: '0912345678', lastSyncAt: null },
        { employeeName: 'John Smith', cedula: 'AB123456', lastSyncAt: null },
        { employeeName: 'Luis Corto', cedula: '12345', lastSyncAt: null },
        { employeeName: 'Sin Documento', cedula: 'ID-1AbCdEfGh', lastSyncAt: null },
        { employeeName: 'Temporal', cedula: 'TEMP-9', lastSyncAt: null },
      ]);
      const lista = await service.getAvailableCustodios(1);
      expect(lista).toHaveLength(5);
      expect(lista.filter((p) => p.sinCedula).map((p) => p.name).sort()).toEqual(['Sin Documento', 'Temporal']);
      // La clave interna (ID-…, TEMP-…) nunca sale del servidor.
      expect(lista.every((p) => !/^(ID|TEMP)-/i.test(p.cedula))).toBe(true);
      expect(lista.find((p) => p.name === 'John Smith')).toMatchObject({ cedula: 'AB123456', sinCedula: false });
    });

    it('ofrece también a las personas de los horarios de Operaciones, sin repetir a las de RRHH ni entregar su clave interna', async () => {
      prisma.employeeDriveFolder.findMany.mockResolvedValue([
        { employeeName: 'Mora Ana', cedula: '0912345678', lastSyncAt: null },
      ]);
      prisma.cPPuestoGuardia.findMany.mockResolvedValue([
        { cedula: '0912345678', nombreGuardia: 'ANA MORA' }, // ya está en RRHH (misma cédula)
        { cedula: 'SC-ABCDEF1234', nombreGuardia: 'ana mora' }, // ya está en RRHH (mismo nombre, otro orden/mayúsculas)
        { cedula: 'SC-1111111111', nombreGuardia: 'PEREZ LUIS' }, // solo en horarios, sin cédula
        { cedula: 'SC-2222222222', nombreGuardia: 'luis perez' }, // la misma persona en otro puesto
        { cedula: '0999999999', nombreGuardia: 'RUIZ SOFIA' }, // solo en horarios, con cédula
      ]);
      const lista = await service.getAvailableCustodios(1);
      expect(lista.map((p) => p.name).sort()).toEqual(['Mora Ana', 'PEREZ LUIS', 'RUIZ SOFIA']);
      expect(lista.find((p) => p.name === 'PEREZ LUIS')).toMatchObject({ cedula: '', sinCedula: true });
      expect(lista.find((p) => p.name === 'RUIZ SOFIA')).toMatchObject({ cedula: '0999999999', sinCedula: false });
      expect(lista.every((p) => !/^(ID|TEMP|SC)-/i.test(p.cedula))).toBe(true);
    });
  });

  describe('personas distintas en un viaje', () => {
    const base = { numeroGuia: 'G-9', tipoCustodia: 'hacienda' } as any;

    it('rechaza repetir a la misma persona por cédula, o por nombre cuando aún no tiene cédula', async () => {
      prisma.custodia.findUnique.mockResolvedValue(null);
      await expect(
        service.create({ ...base, choferName: 'A', choferCedula: '111', custodio1Name: 'B', custodio1Cedula: '111', custodio2Name: 'C' }, 1, 1),
      ).rejects.toBeInstanceOf(BadRequestException);
      // Sin cédula (opcional): el mismo nombre en dos puestos, aunque cambien las mayúsculas, es la misma persona.
      await expect(
        service.create({ ...base, choferName: 'Ana Mora', custodio1Name: 'ana mora', custodio2Name: 'Luis Pérez' }, 1, 1),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.custodia.create).not.toHaveBeenCalled();
    });

    it('acepta un viaje con tres personas distintas aunque ninguna tenga cédula', async () => {
      prisma.custodia.findUnique.mockResolvedValue(null);
      prisma.custodia.create.mockResolvedValue({ id: 1 });
      await service.create(
        { ...base, choferName: 'Ana Mora', custodio1Name: 'Luis Pérez', custodio2Name: 'Eva Cruz' }, 1, 1,
      );
      expect(prisma.custodia.create.mock.calls[0][0].data).toMatchObject({ choferCedula: '', custodio1Cedula: '', custodio2Cedula: '' });
    });
  });

  describe('custodios 3 y 4', () => {
    const base = {
      numeroGuia: 'G-9', tipoCustodia: 'hacienda',
      choferName: 'Ana Mora', custodio1Name: 'Luis Pérez', custodio2Name: 'Eva Cruz',
    } as any;

    it('guarda el custodio 3 y el 4, y exige el 3 para poner el 4', async () => {
      prisma.custodia.findUnique.mockResolvedValue(null);
      prisma.custodia.create.mockResolvedValue({ id: 1 });
      await service.create({ ...base, custodio3Name: ' Raúl Díaz ', custodio4Name: 'Sofía Paz', custodio4Cedula: '123' }, 1, 1);
      expect(prisma.custodia.create.mock.calls[0][0].data).toMatchObject({
        custodio3Name: 'Raúl Díaz', custodio3Cedula: '', custodio4Name: 'Sofía Paz', custodio4Cedula: '123',
      });
      await expect(service.create({ ...base, custodio4Name: 'Sofía Paz' }, 1, 1)).rejects.toBeInstanceOf(BadRequestException);
    });

    it('el custodio 3 tampoco puede ser alguien que ya va en el viaje', async () => {
      prisma.custodia.findUnique.mockResolvedValue(null);
      await expect(service.create({ ...base, custodio3Name: 'luis pérez' }, 1, 1)).rejects.toBeInstanceOf(BadRequestException);
    });

    it('al editar: quitar al 3 con el 4 puesto se rechaza; cambiarlos pide que no haya pagos', async () => {
      prisma.custodia.findFirst.mockResolvedValue(
        makeCustodia({ custodio3Name: 'Raúl Díaz', custodio4Name: 'Sofía Paz' }),
      );
      await expect(service.update(1, { custodio3Name: '' }, 1)).rejects.toBeInstanceOf(BadRequestException);
      prisma.$queryRaw.mockResolvedValue([{ n: 2 }]);
      await expect(service.update(1, { custodio4Name: 'Otra Persona' }, 1)).rejects.toBeInstanceOf(BadRequestException);
    });

    it('la guía revisada sincroniza las columnas de siempre (contenedores, hacienda y sacos)', async () => {
      prisma.custodia.findUnique.mockResolvedValue(null);
      prisma.custodia.create.mockResolvedValue({ id: 1 });
      guias.preparar.mockResolvedValueOnce({
        clienteId: 5, cliente: 'Cliente del Directorio', rutaId: 2, guia: { haciendas: [] },
        columnas: { contenedores: ['ABCD123'], nombreHacienda: 'La Esperanza', cantidadSacos: 80 },
      });
      await service.create({ ...base, guia: {}, clienteId: 5 }, 1, 1);
      expect(prisma.custodia.create.mock.calls[0][0].data).toMatchObject({
        cliente: 'Cliente del Directorio', clienteId: 5, rutaId: 2,
        contenedores: ['ABCD123'], nombreHacienda: 'La Esperanza', cantidadSacos: 80,
      });
    });
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
    // El dashboard es operativo: cuenta todos los viajes del mes (de cualquier estado) por tipo y por estado; solo
    // `viajes_finalizados` son los que llegaron. Antes contaba por tipo solo los finalizados (cuando mostraba dinero).
    it('counts every custodia del mes por tipo y por estado, finalizadas aparte, with no money', async () => {
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
      expect(stats.por_tipo.find((t) => t.tipo === 'PUERTO')?.cantidad).toBe(1); // en camino, igual cuenta como viaje
      expect(stats.por_tipo.find((t) => t.tipo === 'VIP')?.cantidad).toBe(1);
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
