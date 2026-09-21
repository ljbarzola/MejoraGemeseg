import { Module } from '@nestjs/common';
import { CacaoLotsController } from './lots.controller';
import { CacaoLotsService } from './lots.service';
import { PrismaModule } from '../../../prisma/prisma.module';
import { PermissionsModule } from '../../permissions/permissions.module';

@Module({
  imports: [PrismaModule, PermissionsModule],
  controllers: [CacaoLotsController],
  providers: [CacaoLotsService],
})
export class CacaoLotsModule {}
