import { Module } from '@nestjs/common';
import { CacaoSuppliersController } from './suppliers.controller';
import { CacaoSuppliersService } from './suppliers.service';
import { PrismaModule } from '../../../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [CacaoSuppliersController],
  providers: [CacaoSuppliersService],
})
export class CacaoSuppliersModule {}
