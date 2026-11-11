import { Logger, Module, OnModuleInit } from '@nestjs/common';
import { PrismaModule } from '../../../prisma/prisma.module';
import { PrismaService } from '../../../prisma/prisma.service';
import { PermissionsModule } from '../../permissions/permissions.module';
import { NotificationsModule } from '../../notifications/notifications.module';
import { AusenciasController } from './ausencias.controller';
import { AusenciasService } from './ausencias.service';
import { CP_AUSENCIAS_DDL } from './ausencias.schema';

@Module({
  imports: [PrismaModule, PermissionsModule, NotificationsModule],
  controllers: [AusenciasController],
  providers: [AusenciasService],
})
export class CPAusenciasModule implements OnModuleInit {
  private readonly logger = new Logger(CPAusenciasModule.name);

  constructor(private readonly prisma: PrismaService) {}

  // La tabla es nueva y solo la lee este código: un fallo aquí no tumba el servidor.
  async onModuleInit() {
    try {
      for (const sql of CP_AUSENCIAS_DDL) await this.prisma.$executeRawUnsafe(sql);
    } catch (err) {
      this.logger.warn(`No se pudo asegurar la tabla de faltas: ${(err as Error).message}`);
    }
  }
}
