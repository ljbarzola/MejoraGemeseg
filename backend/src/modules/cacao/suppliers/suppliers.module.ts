import { Module } from '@nestjs/common';
import { CacaoSuppliersController } from './suppliers.controller';
import { CacaoSuppliersService } from './suppliers.service';
import { CacaoSupplierAdvancesController } from './advances.controller';
import { CacaoSupplierAdvancesService } from './advances.service';
import { PrismaModule } from '../../../prisma/prisma.module';
import { PermissionsModule } from '../../permissions/permissions.module';

@Module({
  imports: [PrismaModule, PermissionsModule],
  controllers: [CacaoSuppliersController, CacaoSupplierAdvancesController],
  providers: [CacaoSuppliersService, CacaoSupplierAdvancesService],
})
export class CacaoSuppliersModule {}
