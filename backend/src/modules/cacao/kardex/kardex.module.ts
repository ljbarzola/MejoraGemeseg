import { Module } from '@nestjs/common';
import { CacaoKardexController } from './kardex.controller';
import { CacaoKardexService } from './kardex.service';
import { PrismaModule } from '../../../prisma/prisma.module';
import { PermissionsModule } from '../../permissions/permissions.module';

@Module({
  imports: [PrismaModule, PermissionsModule],
  controllers: [CacaoKardexController],
  providers: [CacaoKardexService],
})
export class CacaoKardexModule {}
