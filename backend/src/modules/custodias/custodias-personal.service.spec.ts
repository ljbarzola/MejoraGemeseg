import { BadRequestException } from '@nestjs/common';
import { CustodiasPersonalService } from './custodias-personal.service';
import { PrismaService } from '../../prisma/prisma.service';
import { PermissionsService } from '../permissions/permissions.service';
import { NotificationsService } from '../notifications/notifications.service';

describe('CustodiasPersonalService', () => {
  let service: CustodiasPersonalService;
  let prisma: {
    employeeDriveFolder: { findUnique: jest.Mock; findFirst: jest.Mock; create: jest.Mock };
    guardiaFichaPersonal: { upsert: jest.Mock };
    user: { findUnique: jest.Mock };
  };
  let permissions: { getCompanyUserIdsWithWriteAccess: jest.Mock };
  let notifications: { create: jest.Mock };

  beforeEach(() => {
    prisma = {
      employeeDriveFolder: {
        findUnique: jest.fn().mockResolvedValue(null),
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 1, ...data })),
      },
      guardiaFichaPersonal: { upsert: jest.fn().mockResolvedValue({}) },
      user: { findUnique: jest.fn().mockResolvedValue({ fullName: 'Operador Uno' }) },
    };
    permissions = { getCompanyUserIdsWithWriteAccess: jest.fn().mockResolvedValue([7, 8]) };
    notifications = { create: jest.fn().mockResolvedValue({}) };
    service = new CustodiasPersonalService(
      prisma as unknown as PrismaService,
      permissions as unknown as PermissionsService,
      notifications as unknown as NotificationsService,
    );
  });

  it('crea a la persona en Guardias sin carpeta de Drive y avisa a RRHH', async () => {
    const r = await service.crear(1, 5, { nombre: '  Pérez   Gómez Juan ', cedula: '0912345678' });

    expect(prisma.employeeDriveFolder.create).toHaveBeenCalledWith({
      data: {
        employeeName: 'Pérez Gómez Juan',
        cedula: '0912345678',
        folderId: '',
        folderUrl: '',
        folderType: 'CUSTODIAS',
        companyId: 1,
      },
    });
    expect(r).toEqual({ name: 'Pérez Gómez Juan', cedula: '0912345678', sinCedula: false, status: 'Inscrito', yaExistia: false });
    // Un aviso por cada persona de RRHH con permiso de escritura, apuntando al Listado de Guardias.
    expect(notifications.create).toHaveBeenCalledTimes(2);
    expect(notifications.create.mock.calls[0][0]).toMatchObject({ userId: 7, link: '/rrhh/guardias' });
    // Sin datos opcionales no se crea ficha.
    expect(prisma.guardiaFichaPersonal.upsert).not.toHaveBeenCalled();
  });

  it('la cédula es opcional: sin ella la persona queda con una clave interna y el servidor no la devuelve', async () => {
    const r = await service.crear(1, 5, { nombre: 'Ana Mora' });

    const guardada = prisma.employeeDriveFolder.create.mock.calls[0][0].data;
    expect(guardada.cedula).toMatch(/^ID-OP-[0-9a-f]{12}$/);
    expect(r).toEqual({ name: 'Ana Mora', cedula: '', sinCedula: true, status: 'Inscrito', yaExistia: false });
    expect(notifications.create.mock.calls[0][0].message).toContain('sin cédula todavía');
    // Dos personas sin cédula reciben claves distintas.
    await service.crear(1, 5, { nombre: 'Luis Pérez' });
    expect(prisma.employeeDriveFolder.create.mock.calls[1][0].data.cedula).not.toBe(guardada.cedula);
  });

  it('sin cédula no duplica a un guardia que ya existe con ese nombre (sin importar mayúsculas)', async () => {
    prisma.employeeDriveFolder.findFirst.mockResolvedValue({ employeeName: 'ANA MORA', cedula: 'ID-AbCdEf123', folderType: 'CUSTODIAS' });
    const r = await service.crear(1, 5, { nombre: 'ana mora' });
    expect(r).toEqual({ name: 'ANA MORA', cedula: '', sinCedula: true, status: 'Inscrito', yaExistia: true });
    expect(prisma.employeeDriveFolder.create).not.toHaveBeenCalled();
    expect(notifications.create).not.toHaveBeenCalled();
    expect(prisma.employeeDriveFolder.findFirst.mock.calls[0][0].where).toMatchObject({
      companyId: 1, folderType: 'CUSTODIAS', employeeName: { equals: 'ana mora', mode: 'insensitive' },
    });
  });

  it('guarda los datos opcionales en la ficha personal de RRHH', async () => {
    await service.crear(1, 5, { nombre: 'Ana Mora', cedula: '0912345678', telefono: ' 0991112223 ', email: 'ana@x.com' });
    const arg = prisma.guardiaFichaPersonal.upsert.mock.calls[0][0];
    expect(arg.create).toMatchObject({ companyId: 1, cedula: '0912345678', telefono: '0991112223', email: 'ana@x.com', direccion: null });
  });

  it('si la cédula ya es un guardia, lo devuelve sin duplicar ni avisar', async () => {
    prisma.employeeDriveFolder.findUnique.mockResolvedValue({ employeeName: 'Ana Mora', cedula: '0912345678', folderType: 'CUSTODIAS' });
    const r = await service.crear(1, 5, { nombre: 'Otro Nombre', cedula: '0912345678' });
    expect(r).toMatchObject({ name: 'Ana Mora', cedula: '0912345678', yaExistia: true });
    expect(prisma.employeeDriveFolder.create).not.toHaveBeenCalled();
    expect(notifications.create).not.toHaveBeenCalled();
  });

  it('si el documento es de otro tipo de personal, no lo pisa y lo explica', async () => {
    prisma.employeeDriveFolder.findUnique.mockResolvedValue({ employeeName: 'Luis Admin', cedula: '0912345678', folderType: 'PERSONAL_ADMIN' });
    await expect(service.crear(1, 5, { nombre: 'Otro Nombre', cedula: '0912345678' })).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.employeeDriveFolder.create).not.toHaveBeenCalled();
  });

  it('acepta un documento que no es una cédula de 10 dígitos (pasaporte, otro país) y lo normaliza', async () => {
    const r = await service.crear(1, 5, { nombre: 'John Smith', cedula: ' ab-123456 ' });
    expect(prisma.employeeDriveFolder.create.mock.calls[0][0].data).toMatchObject({ cedula: 'AB-123456' });
    expect(r).toMatchObject({ cedula: 'AB-123456', yaExistia: false });
  });

  it('rechaza un documento demasiado corto, una clave interna y un nombre vacío', async () => {
    await expect(service.crear(1, 5, { nombre: 'Ana Mora', cedula: '123' })).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.crear(1, 5, { nombre: 'Ana Mora', cedula: 'ID-abc12345' })).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.crear(1, 5, { nombre: ' ', cedula: '0912345678' })).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.employeeDriveFolder.create).not.toHaveBeenCalled();
  });

  it('si falla el aviso, la persona igual queda creada', async () => {
    notifications.create.mockRejectedValue(new Error('caída'));
    const r = await service.crear(1, 5, { nombre: 'Ana Mora', cedula: '0912345678' });
    expect(r.yaExistia).toBe(false);
    expect(prisma.employeeDriveFolder.create).toHaveBeenCalled();
  });
});
