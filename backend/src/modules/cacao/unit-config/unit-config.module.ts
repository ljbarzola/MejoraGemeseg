import { Module } from '@nestjs/common';
import { CacaoUnitConfigService } from './unit-config.service';
import { CacaoUnitConfigController } from './unit-config.controller';
import { PermissionsModule } from '../../permissions/permissions.module';

@Module({
  imports: [PermissionsModule],
  controllers: [CacaoUnitConfigController],
  providers: [CacaoUnitConfigService],
  exports: [CacaoUnitConfigService],
})
export class CacaoUnitConfigModule {}
