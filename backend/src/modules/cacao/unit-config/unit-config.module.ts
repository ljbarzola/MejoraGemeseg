import { Module } from '@nestjs/common';
import { CacaoUnitConfigService } from './unit-config.service';
import { CacaoUnitConfigController } from './unit-config.controller';

@Module({
  controllers: [CacaoUnitConfigController],
  providers: [CacaoUnitConfigService],
  exports: [CacaoUnitConfigService],
})
export class CacaoUnitConfigModule {}
