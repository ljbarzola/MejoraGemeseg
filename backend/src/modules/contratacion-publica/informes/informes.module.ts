import { Module } from '@nestjs/common';
import { CPInformesController } from './informes.controller';
import { CPInformesService } from './informes.service';
import { PrismaModule } from '../../../prisma/prisma.module';
import { PermissionsModule } from '../../permissions/permissions.module';

@Module({
  imports: [PrismaModule, PermissionsModule],
  controllers: [CPInformesController],
  providers: [CPInformesService],
  exports: [CPInformesService],
})
export class CPInformesModule {}
