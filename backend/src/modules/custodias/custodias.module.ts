import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { CustodiasController } from './custodias.controller';
import { CustodiasService } from './custodias.service';
import { PdfService } from './pdf.service';

@Module({
  imports: [PrismaModule],
  controllers: [CustodiasController],
  providers: [CustodiasService, PdfService],
  exports: [CustodiasService],
})
export class CustodiasModule {}
