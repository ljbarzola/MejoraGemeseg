import { Logger, Module, OnModuleInit } from '@nestjs/common';
import { CPInformesController } from './informes.controller';
import { CPInformesService } from './informes.service';
import { PrismaModule } from '../../../prisma/prisma.module';
import { PrismaService } from '../../../prisma/prisma.service';
import { PermissionsModule } from '../../permissions/permissions.module';

@Module({
  imports: [PrismaModule, PermissionsModule],
  controllers: [CPInformesController],
  providers: [CPInformesService],
  exports: [CPInformesService],
})
export class CPInformesModule implements OnModuleInit {
  private readonly logger = new Logger(CPInformesModule.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * La plantilla que ya estaba cargada (una por empresa) pasa a ser la «Plantilla principal» de la nueva
   * lista, con su mismo archivo guardado. Solo si la empresa todavía no tiene ninguna en la lista.
   */
  async onModuleInit() {
    try {
      await this.prisma.$executeRawUnsafe(`
        INSERT INTO "CPPlantillaInformeArchivo" ("companyId", "nombre", "docxPath", "storedKey")
        SELECT p."companyId", 'Plantilla principal', p."docxPath", 'cp/plantilla-informe/empresa-' || p."companyId" || '.docx'
        FROM "CPPlantillaInforme" p
        WHERE p."docxPath" IS NOT NULL
          AND NOT EXISTS (SELECT 1 FROM "CPPlantillaInformeArchivo" a WHERE a."companyId" = p."companyId")
      `);
    } catch (err) {
      this.logger.warn(`No se pudo pasar la plantilla anterior a la lista: ${(err as Error).message}`);
    }
  }
}
