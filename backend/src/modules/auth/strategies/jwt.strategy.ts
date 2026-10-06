import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { UserRole } from '@prisma/client';
import { SessionCutoffService } from '../session-cutoff.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private readonly sessionCutoff: SessionCutoffService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey:
        process.env.JWT_SECRET ||
        (() => {
          throw new Error('JWT_SECRET required');
        })(),
    });
  }

  async validate(payload: {
    sub: number;
    email: string;
    role: UserRole;
    companyId: number | null;
    iat?: number;
  }) {
    // Sesión anterior a un cambio/restablecimiento de contraseña. El frontend
    // trata cualquier 401 como "Tu sesión expiró" y manda al login.
    if (await this.sessionCutoff.isTokenRevoked(payload.sub, payload.iat)) {
      throw new UnauthorizedException(
        'Tu contraseña cambió: vuelve a iniciar sesión.',
      );
    }
    return {
      userId: payload.sub,
      email: payload.email,
      role: payload.role,
      companyId: payload.companyId,
    };
  }
}
