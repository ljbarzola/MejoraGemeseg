import { Logger, Module, OnModuleInit } from '@nestjs/common';
import { PrismaModule } from '../../../prisma/prisma.module';
import { PrismaService } from '../../../prisma/prisma.service';
import { PermissionsModule } from '../../permissions/permissions.module';
import { AgentsModule } from '../../agents/agents.module';
import { GoogleAuthService } from '../../../common/services/google-auth.service';
import { BitacorasController } from './bitacoras.controller';
import { BitacorasService } from './bitacoras.service';
import { BitacoraLectorService } from './bitacora-lector.service';
import { CP_BITACORAS_DDL } from './bitacoras.schema';

@Module({
  imports: [PrismaModule, PermissionsModule, AgentsModule],
  controllers: [BitacorasController],
  providers: [BitacorasService, BitacoraLectorService, GoogleAuthService],
})
export class CPBitacorasModule implements OnModuleInit {
  private readonly logger = new Logger(CPBitacorasModule.name);

  constructor(private readonly prisma: PrismaService) {}

  // Las tablas nuevas las lee solo el código nuevo, así que un fallo aquí no tumba el
  // servidor. Las dos columnas de CPCodigoTurno (tabla que sí existe) se aseguran en
  // PrismaService, donde un fallo sí impide arrancar.
  async onModuleInit() {
    try {
      for (const sql of CP_BITACORAS_DDL)
        await this.prisma.$executeRawUnsafe(sql);
    } catch (err) {
      this.logger.warn(
        `No se pudieron asegurar las tablas de bitácoras: ${(err as Error).message}`,
      );
    }
  }
}
