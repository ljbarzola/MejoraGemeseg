import { Module } from '@nestjs/common';
import { CacaoPuntosController } from './puntos.controller';
import { CacaoPuntosService } from './puntos.service';
import { PrismaModule } from '../../../prisma/prisma.module';
import { PermissionsModule } from '../../permissions/permissions.module';

@Module({
  imports: [PrismaModule, PermissionsModule],
  controllers: [CacaoPuntosController],
  providers: [CacaoPuntosService],
  exports: [CacaoPuntosService],
})
export class CacaoPuntosModule {}
