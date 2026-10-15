import {
  BadRequestException,
  HttpException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../../prisma/prisma.service';
import { GmailMailService } from '../mail/gmail-mail.service';
import { AuthService } from './auth.service';
import { SessionCutoffService } from './session-cutoff.service';
import { AuthThrottleService } from './auth-throttle.service';
import { PasswordRotationService } from './password-rotation.service';

function mocksNuevos() {
  const throttle = {
    asegurarNoBloqueado: jest.fn().mockResolvedValue(undefined),
    registrarIntento: jest.fn().mockResolvedValue(undefined),
    reiniciar: jest.fn().mockResolvedValue(undefined),
  };
  const rotation = { marcarHecha: jest.fn().mockResolvedValue(undefined) };
  return { throttle, rotation };
}

describe('AuthService.changePassword', () => {
  let hashActual: string;

  beforeAll(async () => {
    hashActual = await bcrypt.hash('ClaveActual1', 4);
  });

  function build(user: Record<string, unknown> | null, cerradas = true) {
    const prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue(user),
        update: jest.fn().mockResolvedValue({}),
      },
    };
    const sessionCutoff = {
      markAllSessionsClosed: jest.fn().mockResolvedValue(cerradas),
    };
    const jwt = { sign: jest.fn().mockReturnValue('token-nuevo') };
    const { throttle, rotation } = mocksNuevos();
    const service = new AuthService(
      prisma as unknown as PrismaService,
      jwt as unknown as JwtService,
      {} as GmailMailService,
      sessionCutoff as unknown as SessionCutoffService,
      throttle as unknown as AuthThrottleService,
      rotation as unknown as PasswordRotationService,
    );
    return { prisma, sessionCutoff, jwt, service, throttle, rotation };
  }

  const usuario = () => ({
    id: 5,
    email: 'ana@gemeseg.com',
    role: 'EMPLOYEE',
    companyId: 1,
    isActive: true,
    password: hashActual,
  });

  it('contraseña actual incorrecta → 400 (no 401) y no toca nada', async () => {
    const { prisma, sessionCutoff, service } = build(usuario());
    const err = await service
      .changePassword(5, { currentPassword: 'mala', newPassword: 'NuevaClave1' })
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(BadRequestException);
    expect((err as Error).message).toContain('no es correcta');
    expect(prisma.user.update).not.toHaveBeenCalled();
    expect(sessionCutoff.markAllSessionsClosed).not.toHaveBeenCalled();
  });

  it('nueva igual a la actual → 400', async () => {
    const { prisma, service } = build(usuario());
    await expect(
      service.changePassword(5, {
        currentPassword: 'ClaveActual1',
        newPassword: 'ClaveActual1',
      }),
    ).rejects.toThrow('distinta a la actual');
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('cuenta sin contraseña (solo Google) → 400 que explica qué hacer', async () => {
    const { service } = build({ ...usuario(), password: null });
    await expect(
      service.changePassword(5, {
        currentPassword: 'x',
        newPassword: 'NuevaClave1',
      }),
    ).rejects.toThrow('Olvidaste tu contraseña');
  });

  it('usuario inexistente o inactivo → 401', async () => {
    await expect(
      build(null).service.changePassword(5, {
        currentPassword: 'x',
        newPassword: 'NuevaClave1',
      }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(
      build({ ...usuario(), isActive: false }).service.changePassword(5, {
        currentPassword: 'x',
        newPassword: 'NuevaClave1',
      }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('éxito: guarda el hash nuevo, cierra las demás sesiones y entrega token nuevo', async () => {
    const { prisma, sessionCutoff, jwt, service } = build(usuario());

    const res = await service.changePassword(5, {
      currentPassword: 'ClaveActual1',
      newPassword: 'NuevaClave1',
    });

    const guardado = (
      prisma.user.update.mock.calls[0][0] as { data: { password: string } }
    ).data.password;
    expect(guardado).not.toBe('NuevaClave1');
    await expect(bcrypt.compare('NuevaClave1', guardado)).resolves.toBe(true);
    expect(sessionCutoff.markAllSessionsClosed).toHaveBeenCalledWith(5);
    // El token se firma DESPUÉS del corte: así el nuevo sobrevive.
    expect(
      sessionCutoff.markAllSessionsClosed.mock.invocationCallOrder[0],
    ).toBeLessThan(jwt.sign.mock.invocationCallOrder[0]);
    expect(res.token).toBe('token-nuevo');
    expect(res.message).toContain('demás dispositivos');
  });

  it('si no se pudo registrar el corte, la contraseña cambia y el mensaje no promete cerrar sesiones', async () => {
    const { prisma, service } = build(usuario(), false);
    const res = await service.changePassword(5, {
      currentPassword: 'ClaveActual1',
      newPassword: 'NuevaClave1',
    });
    expect(prisma.user.update).toHaveBeenCalled();
    expect(res.message).not.toContain('demás dispositivos');
    expect(res.sesionesCerradas).toBe(false);
  });
});

describe('AuthService.changePassword — límite de intentos y bandera de cambio obligatorio', () => {
  let hashActual: string;
  beforeAll(async () => {
    hashActual = await bcrypt.hash('ClaveActual1', 4);
  });

  function build() {
    const prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue({
          id: 5,
          email: 'ana@gemeseg.com',
          role: 'ADMIN',
          companyId: 1,
          isActive: true,
          password: hashActual,
        }),
        update: jest.fn().mockResolvedValue({}),
      },
    };
    const sessionCutoff = { markAllSessionsClosed: jest.fn().mockResolvedValue(true) };
    const { throttle, rotation } = mocksNuevos();
    const service = new AuthService(
      prisma as unknown as PrismaService,
      { sign: jest.fn().mockReturnValue('t') } as unknown as JwtService,
      {} as GmailMailService,
      sessionCutoff as unknown as SessionCutoffService,
      throttle as unknown as AuthThrottleService,
      rotation as unknown as PasswordRotationService,
    );
    return { prisma, service, throttle, rotation };
  }

  it('la consulta pide el hash a propósito (omit global)', async () => {
    const { prisma, service } = build();
    await service.changePassword(5, {
      currentPassword: 'ClaveActual1',
      newPassword: 'NuevaClave1',
    });
    expect(prisma.user.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ omit: { password: false } }),
    );
  });

  it('contraseña actual incorrecta suma un intento (clave por usuario)', async () => {
    const { service, throttle } = build();
    await service
      .changePassword(5, { currentPassword: 'mala', newPassword: 'NuevaClave1' })
      .catch(() => undefined);
    expect(throttle.registrarIntento).toHaveBeenCalledWith('cambio:5');
  });

  it('bloqueado: ni siquiera compara la contraseña', async () => {
    const { prisma, service, throttle } = build();
    throttle.asegurarNoBloqueado.mockRejectedValue(
      new HttpException('Demasiados intentos', 429),
    );
    await expect(
      service.changePassword(5, {
        currentPassword: 'ClaveActual1',
        newPassword: 'NuevaClave1',
      }),
    ).rejects.toBeInstanceOf(HttpException);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('éxito: reinicia el contador y marca el cambio obligatorio como hecho', async () => {
    const { service, throttle, rotation } = build();
    await service.changePassword(5, {
      currentPassword: 'ClaveActual1',
      newPassword: 'NuevaClave1',
    });
    expect(throttle.reiniciar).toHaveBeenCalledWith('cambio:5');
    expect(rotation.marcarHecha).toHaveBeenCalledWith(5);
  });
});

describe('AuthService.login — límite de intentos', () => {
  let hash: string;
  beforeAll(async () => {
    hash = await bcrypt.hash('ClaveBuena1', 4);
  });

  function build(user: Record<string, unknown> | null) {
    const prisma = { user: { findUnique: jest.fn().mockResolvedValue(user) } };
    const { throttle, rotation } = mocksNuevos();
    const service = new AuthService(
      prisma as unknown as PrismaService,
      { sign: jest.fn().mockReturnValue('tok') } as unknown as JwtService,
      {} as GmailMailService,
      {} as unknown as SessionCutoffService,
      throttle as unknown as AuthThrottleService,
      rotation as unknown as PasswordRotationService,
    );
    return { prisma, service, throttle };
  }

  const usuario = () => ({
    id: 1,
    email: 'ana@gemeseg.com',
    fullName: 'Ana',
    position: null,
    role: 'EMPLOYEE',
    companyId: 1,
    password: hash,
  });

  it('la clave del límite es el correo en minúsculas y sin espacios', async () => {
    const { service, throttle } = build(usuario());
    await service.login({ email: '  Ana@Gemeseg.com ', password: 'ClaveBuena1' });
    expect(throttle.asegurarNoBloqueado).toHaveBeenCalledWith('login:ana@gemeseg.com');
  });

  it('contraseña incorrecta: suma un intento y responde 401', async () => {
    const { service, throttle } = build(usuario());
    await expect(
      service.login({ email: 'ana@gemeseg.com', password: 'mala' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(throttle.registrarIntento).toHaveBeenCalledWith('login:ana@gemeseg.com');
    expect(throttle.reiniciar).not.toHaveBeenCalled();
  });

  it('correo que no existe: también suma (el 429 no delata qué cuentas existen)', async () => {
    const { service, throttle } = build(null);
    await expect(
      service.login({ email: 'nadie@gemeseg.com', password: 'x' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(throttle.registrarIntento).toHaveBeenCalledWith('login:nadie@gemeseg.com');
  });

  it('login correcto: reinicia el contador y pide el hash a propósito', async () => {
    const { prisma, service, throttle } = build(usuario());
    const res = await service.login({ email: 'ana@gemeseg.com', password: 'ClaveBuena1' });
    expect(res.token).toBe('tok');
    expect(throttle.reiniciar).toHaveBeenCalledWith('login:ana@gemeseg.com');
    expect(prisma.user.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ omit: { password: false } }),
    );
  });

  it('bloqueado: responde 429 sin consultar la base de usuarios', async () => {
    const { prisma, service, throttle } = build(usuario());
    throttle.asegurarNoBloqueado.mockRejectedValue(
      new HttpException('Demasiados intentos. Intenta de nuevo en 15 minutos.', 429),
    );
    await expect(
      service.login({ email: 'ana@gemeseg.com', password: 'ClaveBuena1' }),
    ).rejects.toMatchObject({ status: 429 });
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });
});
