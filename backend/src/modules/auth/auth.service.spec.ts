import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../../prisma/prisma.service';
import { GmailMailService } from '../mail/gmail-mail.service';
import { AuthService } from './auth.service';
import { SessionCutoffService } from './session-cutoff.service';

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
    const service = new AuthService(
      prisma as unknown as PrismaService,
      jwt as unknown as JwtService,
      {} as GmailMailService,
      sessionCutoff as unknown as SessionCutoffService,
    );
    return { prisma, sessionCutoff, jwt, service };
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
