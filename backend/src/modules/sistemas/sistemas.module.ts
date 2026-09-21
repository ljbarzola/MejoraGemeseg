import { Module } from '@nestjs/common';
import { SistemasController } from './sistemas.controller';
import { SistemasConfigController } from './sistemas-config.controller';
import { SistemasService } from './sistemas.service';
import { SistemasDriveService } from './services/sistemas-drive.service';
import { PrismaModule } from '../../prisma/prisma.module';
import { PermissionsModule } from '../permissions/permissions.module';

@Module({
  imports: [PrismaModule, PermissionsModule],
  controllers: [SistemasController, SistemasConfigController],
  providers: [SistemasService, SistemasDriveService],
})
export class SistemasModule {}