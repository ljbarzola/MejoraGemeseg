import { Module } from '@nestjs/common';
import { CacaoShipmentsController } from './shipments.controller';
import { CacaoShipmentsService } from './shipments.service';
import { PrismaModule } from '../../../prisma/prisma.module';
import { CacaoUnitConfigModule } from '../unit-config/unit-config.module';
import { CacaoConfigModule } from '../config/cacao-config.module';
import { PermissionsModule } from '../../permissions/permissions.module';

@Module({
  imports: [
    PrismaModule,
    CacaoUnitConfigModule,
    CacaoConfigModule,
    PermissionsModule,
  ],
  controllers: [CacaoShipmentsController],
  providers: [CacaoShipmentsService],
})
export class CacaoShipmentsModule {}
