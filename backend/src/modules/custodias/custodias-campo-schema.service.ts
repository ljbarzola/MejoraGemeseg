import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CUSTODIA_CAMPO_APARTE_DDL } from '../../prisma/custodia-campo.schema';

/**
 * Cosas aditivas de las custodias en campo que dependen de las tablas de `CustodiasSchemaService` (celulares y
 * sus códigos): la numeración de las guías, «vincular de nuevo» un celular y «quitar de la lista». Los módulos de
 * Nest arrancan a la vez, así que primero se espera a que esas tablas existan (en producción ya están y es
 * inmediato). Si algo falla, el servidor sigue: solo esas funciones fallarían.
 */
@Injectable()
export class CustodiasCampoSchemaService implements OnModuleInit {
  private readonly logger = new Logger(CustodiasCampoSchemaService.name);

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    try {
      for (let intento = 0; intento < 40; intento++) {
        const filas = await this.prisma.$queryRawUnsafe<{ listo: boolean }[]>(
          `SELECT (to_regclass('"CustodiaDispositivo"') IS NOT NULL
                   AND to_regclass('"CustodiaDispositivoCodigo"') IS NOT NULL) AS "listo"`,
        );
        if (filas[0]?.listo) break;
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
      for (const sql of CUSTODIA_CAMPO_APARTE_DDL) {
        await this.prisma.$executeRawUnsafe(sql);
      }
    } catch (err) {
      this.logger.warn(`No se pudo asegurar la numeración de guías ni los celulares: ${(err as Error).message}`);
    }
  }
}
