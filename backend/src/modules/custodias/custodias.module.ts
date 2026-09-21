import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { CustodiasController } from './custodias.controller';
import { CustodiasService } from './custodias.service';
import { PdfService } from './pdf.service';
import { PermissionsModule } from '../permissions/permissions.module';

@Module({
  imports: [PrismaModule, PermissionsModule],
  controllers: [CustodiasController],
  providers: [CustodiasService, PdfService],
  exports: [CustodiasService],
})
export class CustodiasModule {}
