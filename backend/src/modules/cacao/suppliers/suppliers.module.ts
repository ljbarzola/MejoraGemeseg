import { Module } from '@nestjs/common';
import { CacaoSuppliersController } from './suppliers.controller';
import { CacaoSuppliersService } from './suppliers.service';
import { PrismaModule } from '../../../prisma/prisma.module';
import { PermissionsModule } from '../../permissions/permissions.module';

@Module({
  imports: [PrismaModule, PermissionsModule],
  controllers: [CacaoSuppliersController],
  providers: [CacaoSuppliersService],
})
export class CacaoSuppliersModule {}
