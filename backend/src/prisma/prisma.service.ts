import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

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
    const useSsl =
      !isUnixSocket &&
      (databaseUrl.includes('supabase') ||
        databaseUrl.includes('pooler') ||
        databaseUrl.includes('cloudsql') ||
        process.env.DATABASE_SSL === 'true');
    const adapter = new PrismaPg({
      connectionString: databaseUrl,
      max: poolMax,
      idleTimeoutMillis: 10_000,
      ...(useSsl ? { ssl: { rejectUnauthorized: false } } : {}),
    });
    super({ adapter });
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
        return;
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
      }
    }
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
