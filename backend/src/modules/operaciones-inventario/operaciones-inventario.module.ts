import { Logger, Module, OnModuleInit } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { PrismaService } from '../../prisma/prisma.service';
import { PermissionsModule } from '../permissions/permissions.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { InventarioController } from './inventario.controller';
import { InventarioService } from './inventario.service';
import { INVENTARIO_DDL } from './inventario.schema';

@Module({
  imports: [PrismaModule, PermissionsModule, NotificationsModule],
  controllers: [InventarioController],
  providers: [InventarioService],
})
export class OperacionesInventarioModule implements OnModuleInit {
  private readonly logger = new Logger(OperacionesInventarioModule.name);

  constructor(private readonly prisma: PrismaService) {}

  // Las tablas son nuevas y solo las lee este código: un fallo aquí no tumba el servidor.
  async onModuleInit() {
    try {
      for (const sql of INVENTARIO_DDL) await this.prisma.$executeRawUnsafe(sql);
    } catch (err) {
      this.logger.warn(`No se pudieron asegurar las tablas del inventario: ${(err as Error).message}`);
    }
  }
}
