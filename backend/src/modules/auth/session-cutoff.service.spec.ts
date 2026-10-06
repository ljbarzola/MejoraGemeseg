import { PrismaService } from '../../prisma/prisma.service';
import { SessionCutoffService } from './session-cutoff.service';
import { JwtStrategy } from './strategies/jwt.strategy';

const SEG = (iso: string) => Math.floor(new Date(iso).getTime() / 1000);

function build(cutoff: {
  findUnique?: jest.Mock;
  upsert?: jest.Mock;
  $executeRawUnsafe?: jest.Mock;
}) {
  const prisma = {
    $executeRawUnsafe: cutoff.$executeRawUnsafe ?? jest.fn().mockResolvedValue(0),
    userSessionCutoff: {
      findUnique: cutoff.findUnique ?? jest.fn().mockResolvedValue(null),
      upsert: cutoff.upsert ?? jest.fn().mockResolvedValue({}),
    },
  };
  return {
    prisma,
    service: new SessionCutoffService(prisma as unknown as PrismaService),
  };
}

describe('SessionCutoffService.onModuleInit — tabla UserSessionCutoff', () => {
  it('ejecuta cada sentencia del DDL idempotente, una por llamada', async () => {
    const { prisma, service } = build({});
    await service.onModuleInit();
    expect(prisma.$executeRawUnsafe).toHaveBeenCalledTimes(2);
    expect(prisma.$executeRawUnsafe.mock.calls[0][0]).toContain(
      'CREATE TABLE IF NOT EXISTS "UserSessionCutoff"',
    );
  });

  it('si la base rechaza el DDL, el servicio arranca igual (no lanza)', async () => {
    const { service } = build({
      $executeRawUnsafe: jest.fn().mockRejectedValue(new Error('sin permiso')),
    });
    await expect(service.onModuleInit()).resolves.toBeUndefined();
  });
});

describe('SessionCutoffService.isTokenRevoked', () => {
  const corte = '2026-10-06T12:00:00.000Z';

  it('sin fila de corte la sesión sigue abierta', async () => {
    const { service } = build({});
    await expect(
      service.isTokenRevoked(1, SEG('2026-09-01T00:00:00Z')),
    ).resolves.toBe(false);
  });

  it('rechaza un token emitido ANTES del corte', async () => {
    const { service } = build({
      findUnique: jest.fn().mockResolvedValue({ validAfter: new Date(corte) }),
    });
    await expect(
      service.isTokenRevoked(1, SEG('2026-10-06T11:59:59Z')),
    ).resolves.toBe(true);
  });

  it('acepta un token emitido en el mismo segundo del corte o después', async () => {
    const { service } = build({
      findUnique: jest.fn().mockResolvedValue({ validAfter: new Date(corte) }),
    });
    await expect(service.isTokenRevoked(1, SEG(corte))).resolves.toBe(false);
    await expect(
      service.isTokenRevoked(1, SEG('2026-10-06T12:00:05Z')),
    ).resolves.toBe(false);
  });

  it('un token sin iat no se rechaza', async () => {
    const { prisma, service } = build({});
    await expect(service.isTokenRevoked(1, undefined)).resolves.toBe(false);
    expect(prisma.userSessionCutoff.findUnique).not.toHaveBeenCalled();
  });

  it('FALLA ABIERTO: si la consulta o la tabla fallan, el token se acepta', async () => {
    const { service } = build({
      findUnique: jest
        .fn()
        .mockRejectedValue(new Error('relation "UserSessionCutoff" does not exist')),
    });
    await expect(
      service.isTokenRevoked(1, SEG('2020-01-01T00:00:00Z')),
    ).resolves.toBe(false);
  });

  it('consulta la base una sola vez dentro de la ventana de caché', async () => {
    const findUnique = jest.fn().mockResolvedValue(null);
    const { service } = build({ findUnique });
    await service.isTokenRevoked(1, 1);
    await service.isTokenRevoked(1, 2);
    await service.isTokenRevoked(1, 3);
    expect(findUnique).toHaveBeenCalledTimes(1);
  });
});

describe('SessionCutoffService.markAllSessionsClosed', () => {
  it('guarda el corte y esta instancia deja de aceptar tokens anteriores al instante', async () => {
    const { prisma, service } = build({});
    const antes = Math.floor(Date.now() / 1000);

    await expect(service.markAllSessionsClosed(7)).resolves.toBe(true);

    expect(prisma.userSessionCutoff.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 7 } }),
    );
    // Sin esperar los 30 s de caché: el cierre vale ya en esta instancia.
    await expect(service.isTokenRevoked(7, antes - 10)).resolves.toBe(true);
    // Un token emitido después de marcar (el nuevo de esta sesión) sobrevive.
    await expect(
      service.isTokenRevoked(7, Math.floor(Date.now() / 1000)),
    ).resolves.toBe(false);
  });

  it('si no se pudo guardar no lanza y avisa con false', async () => {
    const { service } = build({
      upsert: jest.fn().mockRejectedValue(new Error('tabla ausente')),
    });
    await expect(service.markAllSessionsClosed(7)).resolves.toBe(false);
  });
});

describe('JwtStrategy.validate', () => {
  beforeAll(() => {
    process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';
  });

  const payload = {
    sub: 3,
    email: 'a@b.c',
    role: 'EMPLOYEE' as never,
    companyId: 1,
    iat: 100,
  };

  it('deja pasar la sesión y devuelve el usuario cuando no hay corte', async () => {
    const strategy = new JwtStrategy({
      isTokenRevoked: jest.fn().mockResolvedValue(false),
    } as unknown as SessionCutoffService);
    await expect(strategy.validate(payload)).resolves.toEqual({
      userId: 3,
      email: 'a@b.c',
      role: 'EMPLOYEE',
      companyId: 1,
    });
  });

  it('responde 401 si la sesión es anterior a un cambio de contraseña', async () => {
    const strategy = new JwtStrategy({
      isTokenRevoked: jest.fn().mockResolvedValue(true),
    } as unknown as SessionCutoffService);
    await expect(strategy.validate(payload)).rejects.toThrow(
      'Tu contraseña cambió',
    );
  });
});
