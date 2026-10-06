import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { USER_SESSION_CUTOFF_DDL } from './session-cutoff.schema';

/**
 * Cierre de sesiones abiertas en otros dispositivos.
 *
 * El JWT no se valida contra la base (dura 7 días). Cuando alguien cambia o
 * restablece su contraseña se guarda aquí un "valen desde": los tokens
 * emitidos antes de ese instante se rechazan. Mientras nadie llame a
 * `markAllSessionsClosed`, no hay fila y las sesiones siguen abiertas.
 *
 * FALLA ABIERTO: si la tabla no existe, la consulta falla o no hay fila, el
 * token se acepta. Un fallo de este mecanismo nunca debe sacar a la gente de
 * la app; lo único que se pierde es el cierre de sesiones.
 */
@Injectable()
export class SessionCutoffService implements OnModuleInit {
  private readonly logger = new Logger(SessionCutoffService.name);

  /**
   * Cada petición autenticada pasa por aquí; sin caché sería una consulta por
   * petición contra una base chica con pool de 3. Con 30 s, otra instancia de
   * Cloud Run tarda hasta 30 s en enterarse del cierre (aceptable).
   */
  static readonly CACHE_TTL_MS = 30_000;
  private readonly cache = new Map<
    number,
    { validAfterSec: number | null; expiresAt: number }
  >();

  constructor(private readonly prisma: PrismaService) {}

  // El despliegue no corre migraciones: se asegura aquí la tabla (ver
  // session-cutoff.schema.ts). Si falla, el servicio arranca igual.
  async onModuleInit() {
    try {
      for (const sql of USER_SESSION_CUTOFF_DDL) {
        await this.prisma.$executeRawUnsafe(sql);
      }
    } catch (err) {
      this.logger.warn(
        `No se pudo asegurar la tabla UserSessionCutoff: ${(err as Error).message}`,
      );
    }
  }

  /**
   * ¿Este token (emitido en `iat`, segundos Unix) fue invalidado por un
   * cambio de contraseña posterior? Sin `iat` o sin corte registrado → no.
   */
  async isTokenRevoked(userId: number, iat?: number): Promise<boolean> {
    if (typeof iat !== 'number') return false;
    const validAfterSec = await this.getValidAfterSec(userId);
    return validAfterSec !== null && iat < validAfterSec;
  }

  /**
   * Cierra todas las sesiones emitidas hasta este momento. El token nuevo que
   * se entregue DESPUÉS de llamar a esto queda válido (iat >= corte, que se
   * trunca al segundo igual que `iat`).
   *
   * Nunca lanza: si no se pudo guardar, se registra y la contraseña ya
   * cambiada sigue cambiada (devuelve false para que el llamador lo sepa).
   */
  async markAllSessionsClosed(userId: number): Promise<boolean> {
    const validAfterSec = Math.floor(Date.now() / 1000);
    try {
      const validAfter = new Date(validAfterSec * 1000);
      await this.prisma.userSessionCutoff.upsert({
        where: { userId },
        create: { userId, validAfter },
        update: { validAfter },
      });
      this.cache.set(userId, {
        validAfterSec,
        expiresAt: Date.now() + SessionCutoffService.CACHE_TTL_MS,
      });
      return true;
    } catch (err) {
      this.logger.error(
        `No se pudieron cerrar las sesiones del usuario ${userId}: ${(err as Error).message}`,
      );
      return false;
    }
  }

  private async getValidAfterSec(userId: number): Promise<number | null> {
    const hit = this.cache.get(userId);
    if (hit && hit.expiresAt > Date.now()) return hit.validAfterSec;

    let validAfterSec: number | null = null;
    try {
      const row = await this.prisma.userSessionCutoff.findUnique({
        where: { userId },
        select: { validAfter: true },
      });
      validAfterSec = row ? Math.floor(row.validAfter.getTime() / 1000) : null;
    } catch (err) {
      // Falla abierto, y se cachea el "no sé" el mismo tiempo para no volver
      // a golpear la base (y el log) en cada petición.
      this.logger.warn(
        `No se pudo consultar el corte de sesiones (se acepta el token): ${(err as Error).message}`,
      );
    }
    this.cache.set(userId, {
      validAfterSec,
      expiresAt: Date.now() + SessionCutoffService.CACHE_TTL_MS,
    });
    return validAfterSec;
  }
}
