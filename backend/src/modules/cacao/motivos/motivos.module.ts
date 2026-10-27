import { Module } from '@nestjs/common';
import { CacaoMotivosController } from './motivos.controller';
import { CacaoMotivosService } from './motivos.service';
import { PrismaModule } from '../../../prisma/prisma.module';
import { PermissionsModule } from '../../permissions/permissions.module';

@Module({
  imports: [PrismaModule, PermissionsModule],
  controllers: [CacaoMotivosController],
  providers: [CacaoMotivosService],
  exports: [CacaoMotivosService],
})
export class CacaoMotivosModule {}
