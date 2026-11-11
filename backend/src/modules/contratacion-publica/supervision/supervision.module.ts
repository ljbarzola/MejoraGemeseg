import { Logger, Module, OnModuleInit } from '@nestjs/common';
import { PrismaModule } from '../../../prisma/prisma.module';
import { PrismaService } from '../../../prisma/prisma.service';
import { PermissionsModule } from '../../permissions/permissions.module';
import { SupervisionController } from './supervision.controller';
import { SupervisionService } from './supervision.service';
import { SupervisionExcelService } from './supervision-excel.service';
import { CP_SUPERVISION_DDL } from './supervision.schema';

@Module({
  imports: [PrismaModule, PermissionsModule],
  controllers: [SupervisionController],
  providers: [SupervisionService, SupervisionExcelService],
  exports: [SupervisionService],
})
export class CPSupervisionModule implements OnModuleInit {
  private readonly logger = new Logger(CPSupervisionModule.name);

  constructor(private readonly prisma: PrismaService) {}

  // Tablas nuevas que solo lee este código: un fallo aquí no tumba el servidor.
  async onModuleInit() {
    try {
      for (const sql of CP_SUPERVISION_DDL) await this.prisma.$executeRawUnsafe(sql);
    } catch (err) {
      this.logger.warn(`No se pudieron asegurar las tablas de supervisión: ${(err as Error).message}`);
    }
  }
}
