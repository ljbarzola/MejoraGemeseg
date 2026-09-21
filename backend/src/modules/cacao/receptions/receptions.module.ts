import { Module } from '@nestjs/common';
import { CacaoReceptionsController } from './receptions.controller';
import { CacaoReceptionsService } from './receptions.service';
import { PrismaModule } from '../../../prisma/prisma.module';
import { CacaoUnitConfigModule } from '../unit-config/unit-config.module';
import { PermissionsModule } from '../../permissions/permissions.module';

@Module({
  imports: [PrismaModule, CacaoUnitConfigModule, PermissionsModule],
  controllers: [CacaoReceptionsController],
  providers: [CacaoReceptionsService],
})
export class CacaoReceptionsModule {}
