import { Module } from '@nestjs/common';
import { CPTextosInstitucionalesController } from './textos-institucionales.controller';
import { CPTextosInstitucionalesService } from './textos-institucionales.service';
import { PrismaModule } from '../../../prisma/prisma.module';
import { PermissionsModule } from '../../permissions/permissions.module';

@Module({
  imports: [PrismaModule, PermissionsModule],
  controllers: [CPTextosInstitucionalesController],
  providers: [CPTextosInstitucionalesService],
  exports: [CPTextosInstitucionalesService],
})
export class CPTextosInstitucionalesModule {}
