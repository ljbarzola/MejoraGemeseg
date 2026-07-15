import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor() {
    const databaseUrl = process.env.DATABASE_URL || '';
    const isRemote = databaseUrl.includes('supabase') || databaseUrl.includes('pooler');
    const adapter = new PrismaPg({
      connectionString: databaseUrl,
      ...(isRemote ? { ssl: { rejectUnauthorized: false } } : {}),
    });
    super({ adapter });
  }

  async onModuleInit() {
    const maxRetries = 10;
    const retryDelay = 3000;
    for (let i = 1; i <= maxRetries; i++) {
      try {
        await this.$connect();
        console.log(`[Prisma] Conectado a la base de datos`);
        return;
      } catch (error) {
        console.log(`[Prisma] Intento ${i}/${maxRetries} - DB no disponible, reintentando en ${retryDelay / 1000}s...`);
        if (i === maxRetries) {
          console.error(`[Prisma] No se pudo conectar a la DB después de ${maxRetries} intentos`);
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