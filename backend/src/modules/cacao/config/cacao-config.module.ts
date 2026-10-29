import { Module } from '@nestjs/common';
import { CacaoConfigController } from './cacao-config.controller';
import { CacaoConfigService } from './cacao-config.service';
import { PrismaModule } from '../../../prisma/prisma.module';
import { PermissionsModule } from '../../permissions/permissions.module';

@Module({
  imports: [PrismaModule, PermissionsModule],
  controllers: [CacaoConfigController],
  providers: [CacaoConfigService],
  exports: [CacaoConfigService],
})
export class CacaoConfigModule {}
