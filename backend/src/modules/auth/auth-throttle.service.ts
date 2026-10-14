import {
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AUTH_ATTEMPT_DDL } from './auth-throttle.schema';

/**
 * Límite de intentos para login, "olvidé mi contraseña" y cambiar contraseña.
 *
 * La clave es el CORREO (o el id de usuario al cambiar contraseña), no la IP:
 * el backend no tiene `trust proxy` configurado y una IP que viene de un
 * encabezado se puede falsificar para saltarse el límite. A cambio, alguien
 * puede bloquear 15 minutos a otra persona escribiendo mal su correo a
 * propósito; es el costo aceptado de no depender de la IP.
 *
 * FALLA ABIERTO, igual que SessionCutoffService: si la tabla no existe o la
 * consulta falla, no se bloquea a nadie. Este mecanismo nunca debe dejar a la
 * gente fuera de la app por un error propio.
 */
@Injectable()
export class AuthThrottleService implements OnModuleInit {
  private readonly logger = new Logger(AuthThrottleService.name);

  static readonly MAX_INTENTOS = 5;
  static readonly VENTANA_MIN = 15;
  static readonly BLOQUEO_MIN = 15;

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    try {
      for (const sql of AUTH_ATTEMPT_DDL) {
        await this.prisma.$executeRawUnsafe(sql);
      }
    } catch (err) {
      this.logger.warn(
        `No se pudo asegurar la tabla AuthAttempt: ${(err as Error).message}`,
      );
    }
  }

  /** Normaliza el correo para que MAYÚSCULAS o espacios no den otra clave. */
  static claveCorreo(prefijo: string, correo: string): string {
    return `${prefijo}:${(correo ?? '').trim().toLowerCase()}`;
  }

  /** Lanza 429 si la clave está bloqueada ahora mismo. */
  async asegurarNoBloqueado(clave: string): Promise<void> {
    let bloqueadoHasta: Date | null = null;
    try {
      const filas = await this.prisma.$queryRaw<
        { lockedUntil: Date | null }[]
      >`SELECT "lockedUntil" FROM "AuthAttempt" WHERE "key" = ${clave}`;
      bloqueadoHasta = filas[0]?.lockedUntil ?? null;
    } catch (err) {
      this.logger.warn(
        `No se pudo consultar el límite de intentos (se permite): ${(err as Error).message}`,
      );
      return;
    }
    if (bloqueadoHasta && bloqueadoHasta.getTime() > Date.now()) {
      const minutos = Math.max(
        1,
        Math.ceil((bloqueadoHasta.getTime() - Date.now()) / 60_000),
      );
      throw new HttpException(
        `Demasiados intentos. Intenta de nuevo en ${minutos} ${minutos === 1 ? 'minuto' : 'minutos'}.`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  /**
   * Suma un intento. Si dentro de la ventana de 15 minutos llega a 5, bloquea
   * 15 minutos. Es un solo `INSERT … ON CONFLICT` para que varias instancias
   * no se pisen el contador.
   */
  async registrarIntento(clave: string): Promise<void> {
    const ahora = new Date();
    const inicioVentana = new Date(
      ahora.getTime() - AuthThrottleService.VENTANA_MIN * 60_000,
    );
    const hastaBloqueo = new Date(
      ahora.getTime() + AuthThrottleService.BLOQUEO_MIN * 60_000,
    );
    const max = AuthThrottleService.MAX_INTENTOS;
    try {
      await this.prisma.$executeRaw`
        INSERT INTO "AuthAttempt" ("key", "count", "windowStart", "lockedUntil")
        VALUES (${clave}, 1, ${ahora}, NULL)
        ON CONFLICT ("key") DO UPDATE SET
          "count" = CASE WHEN "AuthAttempt"."windowStart" < ${inicioVentana}
                         THEN 1 ELSE "AuthAttempt"."count" + 1 END,
          "windowStart" = CASE WHEN "AuthAttempt"."windowStart" < ${inicioVentana}
                               THEN ${ahora} ELSE "AuthAttempt"."windowStart" END,
          "lockedUntil" = CASE
            WHEN (CASE WHEN "AuthAttempt"."windowStart" < ${inicioVentana}
                       THEN 1 ELSE "AuthAttempt"."count" + 1 END) >= ${max}
            THEN ${hastaBloqueo}
            ELSE "AuthAttempt"."lockedUntil" END`;
    } catch (err) {
      this.logger.warn(
        `No se pudo registrar el intento (se permite): ${(err as Error).message}`,
      );
    }
  }

  /** Un intento correcto borra el contador. */
  async reiniciar(clave: string): Promise<void> {
    try {
      await this.prisma
        .$executeRaw`DELETE FROM "AuthAttempt" WHERE "key" = ${clave}`;
    } catch (err) {
      this.logger.warn(
        `No se pudo reiniciar el límite de intentos: ${(err as Error).message}`,
      );
    }
  }
}
