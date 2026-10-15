import {
  CAMBIO_CONTRASENA_CREADOS_ANTES_DE,
  CLAVE_CAMBIO_CONTRASENA,
  PasswordRotationService,
} from './password-rotation.service';
import { PrismaService } from '../../prisma/prisma.service';
import { SessionCutoffService } from './session-cutoff.service';

describe('PasswordRotationService', () => {
  let prisma: {
    $queryRaw: jest.Mock;
    $executeRawUnsafe: jest.Mock;
    userPreference: { updateMany: jest.Mock };
  };
  let cutoff: { markAllSessionsClosed: jest.Mock };
  let service: PasswordRotationService;

  beforeEach(() => {
    prisma = {
      $queryRaw: jest.fn().mockResolvedValue([]),
      $executeRawUnsafe: jest.fn().mockResolvedValue(0),
      userPreference: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    };
    cutoff = { markAllSessionsClosed: jest.fn().mockResolvedValue(true) };
    service = new PasswordRotationService(
      prisma as unknown as PrismaService,
      cutoff as unknown as SessionCutoffService,
    );
  });

  it('la clave es de servidor: la API de preferencias del cliente no la acepta', () => {
    const patron = /^(columnas|notificaciones):[a-z0-9-]{1,60}$/; // PREFERENCE_KEY_PATTERN
    expect(patron.test(CLAVE_CAMBIO_CONTRASENA)).toBe(false);
  });

  it('al arrancar marca solo administradores y cierra las sesiones de los recién marcados', async () => {
    prisma.$queryRaw.mockResolvedValue([{ userId: 4 }, { userId: 7 }]);

    await service.onModuleInit();

    const [plantilla, ...valores] = prisma.$queryRaw.mock.calls[0] as [
      TemplateStringsArray,
      ...unknown[],
    ];
    const sql = plantilla.join('?');
    expect(sql).toContain(`u."role" = 'ADMIN'`);
    expect(sql).toContain('u."isActive" = true');
    expect(sql).toContain('u."password" IS NOT NULL');
    expect(sql).toContain('ON CONFLICT ("userId", "key") DO NOTHING');
    expect(sql).toContain('RETURNING "userId"');
    expect(valores).toContain(CLAVE_CAMBIO_CONTRASENA);
    expect(valores).toContain(CAMBIO_CONTRASENA_CREADOS_ANTES_DE);
    expect(cutoff.markAllSessionsClosed).toHaveBeenCalledTimes(2);
    expect(cutoff.markAllSessionsClosed).toHaveBeenCalledWith(4);
    expect(cutoff.markAllSessionsClosed).toHaveBeenCalledWith(7);
  });

  it('en un segundo arranque no hay filas nuevas y no se cierra ninguna sesión', async () => {
    prisma.$queryRaw.mockResolvedValue([]);
    await service.onModuleInit();
    expect(cutoff.markAllSessionsClosed).not.toHaveBeenCalled();
  });

  it('asegura las tablas necesarias antes de insertar', async () => {
    await service.onModuleInit();
    const ddl = prisma.$executeRawUnsafe.mock.calls.map((c) => c[0] as string).join('\n');
    expect(ddl).toContain('"UserPreference"');
    expect(ddl).toContain('"UserSessionCutoff"');
  });

  it('si algo falla al arrancar, el servicio arranca igual', async () => {
    prisma.$queryRaw.mockRejectedValue(new Error('tabla no existe'));
    await expect(service.onModuleInit()).resolves.toBeUndefined();
    expect(cutoff.markAllSessionsClosed).not.toHaveBeenCalled();
  });

  it('marcarHecha actualiza solo la fila de esa persona y esa clave', async () => {
    await service.marcarHecha(4);
    expect(prisma.userPreference.updateMany).toHaveBeenCalledWith({
      where: { userId: 4, key: CLAVE_CAMBIO_CONTRASENA },
      data: { value: ['hecha'] },
    });
  });

  it('marcarHecha nunca lanza', async () => {
    prisma.userPreference.updateMany.mockRejectedValue(new Error('boom'));
    await expect(service.marcarHecha(4)).resolves.toBeUndefined();
  });
});
