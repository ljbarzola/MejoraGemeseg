import { HttpException } from '@nestjs/common';
import { AuthThrottleService } from './auth-throttle.service';
import { PrismaService } from '../../prisma/prisma.service';

describe('AuthThrottleService', () => {
  let prisma: {
    $queryRaw: jest.Mock;
    $executeRaw: jest.Mock;
    $executeRawUnsafe: jest.Mock;
  };
  let service: AuthThrottleService;

  beforeEach(() => {
    prisma = {
      $queryRaw: jest.fn(),
      $executeRaw: jest.fn().mockResolvedValue(1),
      $executeRawUnsafe: jest.fn().mockResolvedValue(0),
    };
    service = new AuthThrottleService(prisma as unknown as PrismaService);
  });

  it('claveCorreo normaliza mayúsculas y espacios', () => {
    expect(AuthThrottleService.claveCorreo('login', '  Ana@Gemeseg.COM ')).toBe(
      'login:ana@gemeseg.com',
    );
  });

  describe('asegurarNoBloqueado', () => {
    it('sin fila: no bloquea', async () => {
      prisma.$queryRaw.mockResolvedValue([]);
      await expect(service.asegurarNoBloqueado('login:a')).resolves.toBeUndefined();
    });

    it('bloqueo vigente: 429 con los minutos que faltan', async () => {
      prisma.$queryRaw.mockResolvedValue([
        { lockedUntil: new Date(Date.now() + 10 * 60_000) },
      ]);
      const err = await service.asegurarNoBloqueado('login:a').catch((e: unknown) => e);
      expect(err).toBeInstanceOf(HttpException);
      expect((err as HttpException).getStatus()).toBe(429);
      expect((err as HttpException).message).toMatch(/10 minutos/);
    });

    it('un solo minuto restante se dice en singular', async () => {
      prisma.$queryRaw.mockResolvedValue([{ lockedUntil: new Date(Date.now() + 20_000) }]);
      await expect(service.asegurarNoBloqueado('login:a')).rejects.toThrow(/1 minuto\./);
    });

    it('bloqueo ya vencido: deja pasar', async () => {
      prisma.$queryRaw.mockResolvedValue([{ lockedUntil: new Date(Date.now() - 1000) }]);
      await expect(service.asegurarNoBloqueado('login:a')).resolves.toBeUndefined();
    });

    it('si la consulta falla (tabla inexistente) FALLA ABIERTO: no bloquea a nadie', async () => {
      prisma.$queryRaw.mockRejectedValue(new Error('relation "AuthAttempt" does not exist'));
      await expect(service.asegurarNoBloqueado('login:a')).resolves.toBeUndefined();
    });
  });

  describe('registrarIntento / reiniciar', () => {
    it('hace un solo INSERT … ON CONFLICT atómico con los topes 5 y ventana de 15 min', async () => {
      await service.registrarIntento('login:a');
      expect(prisma.$executeRaw).toHaveBeenCalledTimes(1);
      const [plantilla, ...valores] = prisma.$executeRaw.mock.calls[0] as [
        TemplateStringsArray,
        ...unknown[],
      ];
      expect(plantilla.join('?')).toContain('ON CONFLICT ("key") DO UPDATE');
      expect(valores).toContain('login:a');
      expect(valores).toContain(AuthThrottleService.MAX_INTENTOS);
      expect(AuthThrottleService.MAX_INTENTOS).toBe(5);
      expect(AuthThrottleService.VENTANA_MIN).toBe(15);
      expect(AuthThrottleService.BLOQUEO_MIN).toBe(15);
    });

    it('un error al registrar nunca se propaga (falla abierto)', async () => {
      prisma.$executeRaw.mockRejectedValue(new Error('boom'));
      await expect(service.registrarIntento('login:a')).resolves.toBeUndefined();
      await expect(service.reiniciar('login:a')).resolves.toBeUndefined();
    });

    it('reiniciar borra la fila de la clave', async () => {
      await service.reiniciar('login:a');
      const [plantilla, ...valores] = prisma.$executeRaw.mock.calls[0] as [
        TemplateStringsArray,
        ...unknown[],
      ];
      expect(plantilla.join('?')).toContain('DELETE FROM "AuthAttempt"');
      expect(valores).toEqual(['login:a']);
    });
  });

  it('onModuleInit crea la tabla y, si falla, el servicio arranca igual', async () => {
    await service.onModuleInit();
    expect(prisma.$executeRawUnsafe).toHaveBeenCalledWith(
      expect.stringContaining('CREATE TABLE IF NOT EXISTS "AuthAttempt"'),
    );
    prisma.$executeRawUnsafe.mockRejectedValue(new Error('sin permisos'));
    await expect(service.onModuleInit()).resolves.toBeUndefined();
  });
});
