import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { USER_PREFERENCE_DDL } from '../users/user-preference.schema';
import { USER_SESSION_CUTOFF_DDL } from './session-cutoff.schema';
import { SessionCutoffService } from './session-cutoff.service';

/**
 * Cambio de contraseña obligatorio para administradores (2026-10-14).
 *
 * Hasta esa fecha `GET /users` devolvía el hash de la contraseña de todos los
 * usuarios de la empresa a cualquier empleado. Un hash expuesto se puede
 * intentar romper sin conexión, así que los administradores (la cuenta más
 * valiosa) deben cambiarla al entrar.
 *
 * Sin columna nueva ni migración (el despliegue no corre migraciones): la
 * bandera es una fila de "UserPreference" con una clave que el cliente no puede
 * escribir (la API de preferencias solo acepta `columnas:` y
 * `notificaciones:`). Valores: ["pendiente"] / ["hecha"].
 *
 * Al arrancar se marca a los administradores creados ANTES de la fecha de corte
 * y se les cierran las sesiones abiertas. `ON CONFLICT DO NOTHING … RETURNING`
 * devuelve solo las filas realmente insertadas, así que aunque arranquen varias
 * instancias de Cloud Run a la vez, el cierre de sesiones ocurre una sola vez
 * por persona y nunca se vuelve a marcar a quien ya cambió la contraseña.
 *
 * FALLA ABIERTO: si algo falla se registra y el servicio arranca igual.
 */
export const CLAVE_CAMBIO_CONTRASENA = 'seguridad:cambio-contrasena-2026-10';
// Solo administradores creados antes de este día: los que se creen después ya
// nacen con una contraseña que nadie les expuso.
export const CAMBIO_CONTRASENA_CREADOS_ANTES_DE = new Date(
  '2026-10-15T00:00:00.000Z',
);

@Injectable()
export class PasswordRotationService implements OnModuleInit {
  private readonly logger = new Logger(PasswordRotationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly sessionCutoff: SessionCutoffService,
  ) {}

  async onModuleInit() {
    try {
      // Cada servicio asegura su tabla en su propio arranque, pero no hay
      // garantía de orden entre ellos: se repite aquí (es idempotente).
      for (const sql of [...USER_PREFERENCE_DDL, ...USER_SESSION_CUTOFF_DDL]) {
        await this.prisma.$executeRawUnsafe(sql);
      }

      const ahora = new Date();
      const insertados = await this.prisma.$queryRaw<{ userId: number }[]>`
        INSERT INTO "UserPreference" ("userId", "key", "value", "updatedAt")
        SELECT u."id", ${CLAVE_CAMBIO_CONTRASENA}, '["pendiente"]'::jsonb, ${ahora}
        FROM "User" u
        WHERE u."role" = 'ADMIN'
          AND u."isActive" = true
          AND u."password" IS NOT NULL
          AND u."createdAt" < ${CAMBIO_CONTRASENA_CREADOS_ANTES_DE}
        ON CONFLICT ("userId", "key") DO NOTHING
        RETURNING "userId"`;

      for (const { userId } of insertados) {
        await this.sessionCutoff.markAllSessionsClosed(userId);
      }
      if (insertados.length > 0) {
        this.logger.warn(
          `Cambio de contraseña obligatorio: ${insertados.length} administrador(es) marcados y con las sesiones cerradas.`,
        );
      }
    } catch (err) {
      this.logger.warn(
        `No se pudo marcar el cambio de contraseña obligatorio: ${(err as Error).message}`,
      );
    }
  }

  /** La persona cambió su contraseña: la bandera pasa a "hecha". */
  async marcarHecha(userId: number): Promise<void> {
    try {
      await this.prisma.userPreference.updateMany({
        where: { userId, key: CLAVE_CAMBIO_CONTRASENA },
        data: { value: ['hecha'] },
      });
    } catch (err) {
      this.logger.warn(
        `No se pudo marcar como hecho el cambio de contraseña de ${userId}: ${(err as Error).message}`,
      );
    }
  }
}
