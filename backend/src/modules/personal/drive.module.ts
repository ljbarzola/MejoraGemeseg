import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { DriveController } from './drive.controller';
import { DriveService } from './services/drive.service';

@Module({
  imports: [PrismaModule],
  controllers: [DriveController],
  providers: [DriveService],
  exports: [DriveService],
})
export class DriveModule {}
