import { UsersService } from './users.service';
import { PrismaService } from '../../prisma/prisma.service';

describe('UsersService.create — permisos por defecto', () => {
  let service: UsersService;
  let prisma: {
    user: { findUnique: jest.Mock };
    $transaction: jest.Mock;
  };
  let tx: {
    user: { create: jest.Mock };
    companySection: { findMany: jest.Mock };
    userPermission: { createMany: jest.Mock };
  };

  const baseDto = {
    fullName: 'Test User',
    email: 'test@example.com',
    password: 'password123',
  };

  beforeEach(() => {
    tx = {
      user: {
        create: jest.fn().mockResolvedValue({ id: 42, companyId: 1 }),
      },
      companySection: {
        findMany: jest.fn().mockResolvedValue([]), // sin secciones fijas extra para esta empresa
      },
      userPermission: {
        createMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
    };

    prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue(null), // sin duplicado de email
      },
      $transaction: jest.fn().mockImplementation((cb: any) => cb(tx)),
    };

    service = new UsersService(prisma as unknown as PrismaService);
  });

  it('crea filas de permiso DENEGADO para un Employee nuevo, excluyendo Inicio/Proyectos', async () => {
    await service.create({ ...baseDto, role: 'EMPLOYEE' } as any, 1);

    expect(tx.userPermission.createMany).toHaveBeenCalledTimes(1);
    const { data, skipDuplicates } = tx.userPermission.createMany.mock.calls[0][0];
    expect(skipDuplicates).toBe(true);
    expect(data.every((row: any) => row.userId === 42)).toBe(true);
    expect(data.every((row: any) => row.canView === false && row.canWrite === false)).toBe(
      true,
    );
    const sections = data.map((row: any) => row.section);
    expect(sections).not.toContain('DASHBOARD');
    expect(sections).not.toContain('PROJECTS');
    expect(sections).toContain('ADMIN');
    expect(sections).toContain('SISTEMAS');
    expect(sections).toContain('CACAO');
    expect(sections).toContain('CUSTODIAS');
    expect(sections).toContain('RRHH');
    expect(sections).toContain('VENTAS');
  });

  it('crea las mismas filas para un Manager nuevo', async () => {
    await service.create({ ...baseDto, role: 'MANAGER' } as any, 1);

    const { data } = tx.userPermission.createMany.mock.calls[0][0];
    expect(data.every((row: any) => row.canView === false)).toBe(true);
  });

  it('sin rol en el DTO (default EMPLOYEE) también queda denegado', async () => {
    await service.create({ ...baseDto } as any, 1);

    const { data } = tx.userPermission.createMany.mock.calls[0][0];
    expect(data.every((row: any) => row.canView === false)).toBe(true);
  });

  it('crea filas de permiso PERMITIDO explícito para un Admin nuevo', async () => {
    await service.create({ ...baseDto, role: 'ADMIN' } as any, 1);

    const { data } = tx.userPermission.createMany.mock.calls[0][0];
    expect(data.every((row: any) => row.canView === true && row.canWrite === true)).toBe(
      true,
    );
  });

  it('excluye las secciones que la empresa marcó como fijas para todos', async () => {
    tx.companySection.findMany.mockResolvedValue([
      { section: 'SISTEMAS' },
      { section: 'CACAO' },
    ]);

    await service.create({ ...baseDto, role: 'EMPLOYEE' } as any, 1);

    const { data } = tx.userPermission.createMany.mock.calls[0][0];
    const sections = data.map((row: any) => row.section);
    expect(sections).not.toContain('SISTEMAS');
    expect(sections).not.toContain('CACAO');
    expect(sections).toContain('RRHH'); // esta sí sigue denegada
  });

  it('no crea ninguna fila de permisos si el usuario no pertenece a ninguna empresa (super admin)', async () => {
    await service.create({ ...baseDto, role: 'ADMIN' } as any, null);

    expect(tx.userPermission.createMany).not.toHaveBeenCalled();
  });

  it('si ya existe un usuario con ese correo, no se llega a crear ni el usuario ni sus permisos', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 1, email: baseDto.email });

    await expect(
      service.create({ ...baseDto, role: 'EMPLOYEE' } as any, 1),
    ).rejects.toThrow('Ya existe un usuario con ese correo');

    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});

describe('UsersService — catálogo de ubicaciones (aislamiento por empresa)', () => {
  let service: UsersService;
  let prisma: {
    companyLocation: {
      findMany: jest.Mock;
      findFirst: jest.Mock;
      findUnique: jest.Mock;
      create: jest.Mock;
    };
    user: { findUnique: jest.Mock };
  };

  beforeEach(() => {
    prisma = {
      companyLocation: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
      },
      user: { findUnique: jest.fn() },
    };
    service = new UsersService(prisma as unknown as PrismaService);
  });

  it('getLocations siempre filtra por la empresa de quien pregunta', async () => {
    prisma.companyLocation.findMany.mockResolvedValue([]);
    await service.getLocations(7);
    expect(prisma.companyLocation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { companyId: 7 } }),
    );
  });

  it('getLocations sin companyId (super admin) es rechazado', async () => {
    await expect(service.getLocations(null)).rejects.toThrow(
      'Requiere una empresa asociada',
    );
  });

  it('createLocation rechaza un nombre repetido en la MISMA empresa sin distinguir mayúsculas', async () => {
    prisma.companyLocation.findFirst.mockResolvedValue({ id: 1, nombre: 'Quito' });

    await expect(service.createLocation(1, 'quito')).rejects.toThrow(
      'Ya existe una ubicación con ese nombre',
    );
    expect(prisma.companyLocation.create).not.toHaveBeenCalled();
  });

  it('createLocation permite el MISMO nombre en una empresa distinta', async () => {
    prisma.companyLocation.findFirst.mockResolvedValue(null); // no hay duplicado en ESTA empresa
    prisma.companyLocation.create.mockResolvedValue({ id: 2, companyId: 2, nombre: 'Quito' });

    const result = await service.createLocation(2, 'Quito');

    expect(prisma.companyLocation.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ companyId: 2 }) }),
    );
    expect(prisma.companyLocation.create).toHaveBeenCalledWith({
      data: { companyId: 2, nombre: 'Quito' },
    });
    expect(result).toEqual({ id: 2, companyId: 2, nombre: 'Quito' });
  });

  it('update rechaza un locationId que pertenece a otra empresa', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 5, companyId: 1, email: 'a@a.com' });
    prisma.companyLocation.findUnique.mockResolvedValue({ id: 99, companyId: 2, nombre: 'Otra' });

    await expect(
      service.update(5, { locationId: 99 } as any),
    ).rejects.toThrow('Ubicación inválida para esta empresa');
  });

  it('update acepta un locationId que sí pertenece a la empresa del usuario', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 5, companyId: 1, email: 'a@a.com' });
    prisma.companyLocation.findUnique.mockResolvedValue({ id: 10, companyId: 1, nombre: 'Quito' });
    (prisma as any).user.update = jest.fn().mockResolvedValue({ id: 5, locationId: 10 });

    await service.update(5, { locationId: 10 } as any);

    expect((prisma as any).user.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ locationId: 10 }) }),
    );
  });
});

describe('UsersService — preferencias personales', () => {
  let service: UsersService;
  let prisma: { userPreference: { findUnique: jest.Mock; upsert: jest.Mock } };

  beforeEach(() => {
    prisma = {
      userPreference: {
        findUnique: jest.fn(),
        upsert: jest.fn(),
      },
    };
    service = new UsersService(prisma as unknown as PrismaService);
  });

  it('devuelve null cuando la persona nunca guardó la preferencia', async () => {
    prisma.userPreference.findUnique.mockResolvedValue(null);

    await expect(
      service.getPreference(7, 'columnas:ventas-clientes'),
    ).resolves.toEqual({ value: null });
    expect(prisma.userPreference.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId_key: { userId: 7, key: 'columnas:ventas-clientes' } },
      }),
    );
  });

  it('guarda siempre bajo el userId recibido (upsert por usuario + clave)', async () => {
    prisma.userPreference.upsert.mockResolvedValue({ value: ['phone'] });

    await expect(
      service.setPreference(7, 'columnas:ventas-clientes', ['phone']),
    ).resolves.toEqual({ value: ['phone'] });
    expect(prisma.userPreference.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId_key: { userId: 7, key: 'columnas:ventas-clientes' } },
        create: {
          userId: 7,
          key: 'columnas:ventas-clientes',
          value: ['phone'],
        },
        update: { value: ['phone'] },
      }),
    );
  });

  it('rechaza claves que no son de columnas', async () => {
    await expect(service.getPreference(7, 'otra:cosa')).rejects.toThrow(
      'Preferencia no válida',
    );
    await expect(service.setPreference(7, 'columnas:', [])).rejects.toThrow(
      'Preferencia no válida',
    );
    expect(prisma.userPreference.upsert).not.toHaveBeenCalled();
  });
});

describe('UsersService.onModuleInit — tabla UserPreference', () => {
  it('ejecuta cada sentencia del DDL idempotente, una por llamada', async () => {
    const prisma = { $executeRawUnsafe: jest.fn().mockResolvedValue(0) };
    const service = new UsersService(prisma as unknown as PrismaService);

    await service.onModuleInit();

    expect(prisma.$executeRawUnsafe).toHaveBeenCalledTimes(3);
    expect(prisma.$executeRawUnsafe.mock.calls[0][0]).toContain(
      'CREATE TABLE IF NOT EXISTS "UserPreference"',
    );
  });

  it('si la base rechaza el DDL, el servicio arranca igual (no lanza)', async () => {
    const prisma = {
      $executeRawUnsafe: jest.fn().mockRejectedValue(new Error('sin permiso')),
    };
    const service = new UsersService(prisma as unknown as PrismaService);

    await expect(service.onModuleInit()).resolves.toBeUndefined();
  });
});
