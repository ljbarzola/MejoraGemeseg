import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CUSTODIAS_CONFIG_DDL } from './custodias.schema';

/**
 * Crea al arrancar las tablas de configuración y envío de las custodias en campo (el despliegue no corre
 * migraciones). Si falla, el servidor sigue: solo esas pantallas fallarían, no el resto de la app.
 */
@Injectable()
export class CustodiasSchemaService implements OnModuleInit {
  private readonly logger = new Logger(CustodiasSchemaService.name);

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    try {
      for (const sql of CUSTODIAS_CONFIG_DDL) {
        await this.prisma.$executeRawUnsafe(sql);
      }
    } catch (err) {
      this.logger.warn(
        `No se pudieron asegurar las tablas de configuración de Custodias: ${(err as Error).message}`,
      );
    }
  }
}
