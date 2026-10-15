import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { USER_PHONE_DDL } from './user-phone.schema';

/** Default pg pool size. Cloud SQL db-f1-micro allows ~25 connections; Cloud Run max-instances=10 would blow that with pg's default of 10. */
const DEFAULT_POOL_MAX = 3;

export function resolveDatabasePoolMax(
  raw: string | undefined = process.env.DATABASE_POOL_MAX,
): number {
  if (raw === undefined || raw.trim() === '') return DEFAULT_POOL_MAX;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 1) return DEFAULT_POOL_MAX;
  return Math.min(Math.floor(n), 25);
}

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly poolMax: number;

  constructor() {
    const databaseUrl = process.env.DATABASE_URL || '';
    const poolMax = resolveDatabasePoolMax();
    const isUnixSocket =
      databaseUrl.includes('host=/cloudsql/') ||
      databaseUrl.includes('host=%2Fcloudsql%2F');
    // SSL para cualquier conexión remota. La base es Cloud SQL (`gemeseg-db`);
    // el socket Unix de Cloud Run ya va cifrado y no lo necesita.
    const useSsl =
      !isUnixSocket &&
      (databaseUrl.includes('cloudsql') ||
        databaseUrl.includes('pooler') ||
        process.env.DATABASE_SSL === 'true');
    const adapter = new PrismaPg({
      connectionString: databaseUrl,
      max: poolMax,
      idleTimeoutMillis: 10_000,
      ...(useSsl ? { ssl: { rejectUnauthorized: false } } : {}),
    });
    // El hash de la contraseña no sale de ninguna consulta salvo que se pida a
    // propósito (`omit: { password: false }`, solo en auth.service.ts). Antes
    // cualquier `include` sin `select` lo devolvía: GET /users lo mandaba al
    // navegador de cualquier empleado.
    super({ adapter, omit: { user: { password: true } } });
    this.poolMax = poolMax;
  }

  async onModuleInit() {
    const maxRetries = 10;
    const retryDelay = 3000;
    for (let i = 1; i <= maxRetries; i++) {
      try {
        await this.$connect();
        console.log(
          `[Prisma] Conectado a la base de datos (pool max=${this.poolMax})`,
        );
      } catch (error) {
        console.log(
          `[Prisma] Intento ${i}/${maxRetries} - DB no disponible, reintentando en ${retryDelay / 1000}s...`,
        );
        if (i === maxRetries) {
          console.error(
            `[Prisma] No se pudo conectar a la DB después de ${maxRetries} intentos`,
          );
          throw error;
        }
        await new Promise((resolve) => setTimeout(resolve, retryDelay));
        continue;
      }
      await this.asegurarColumnas();
      return;
    }
  }

  // Columnas nuevas de tablas que ya existen en producción (ver user-phone.schema.ts).
  // Si fallan, el servidor NO debe arrancar: medio arrancado rompería el login.
  private async asegurarColumnas() {
    for (const ddl of USER_PHONE_DDL) {
      try {
        await this.$executeRawUnsafe(ddl);
      } catch {
        // Dos instancias arrancando a la vez pueden chocar al crear la misma columna:
        // se reintenta una vez (IF NOT EXISTS lo hace inocuo si la otra ya la creó).
        await new Promise((resolve) => setTimeout(resolve, 500));
        await this.$executeRawUnsafe(ddl);
      }
    }
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
