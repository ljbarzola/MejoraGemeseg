import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { CustodiasController } from './custodias.controller';
import { CustodiasService } from './custodias.service';
import { PdfService } from './pdf.service';
import { PermissionsModule } from '../permissions/permissions.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { CustodiasPersonalService } from './custodias-personal.service';

@Module({
  imports: [PrismaModule, PermissionsModule, NotificationsModule],
  controllers: [CustodiasController],
  providers: [CustodiasService, CustodiasPersonalService, PdfService],
  exports: [CustodiasService],
})
export class CustodiasModule {}
