import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { PersonalController } from './personal.controller';
import { DriveController } from './drive.controller';
import { PersonalService } from './personal.service';
import { KanbanService } from './services/kanban.service';
import { CandidateService } from './services/candidate.service';
import { ContractService } from './services/contract.service';
import { CertificationService } from './services/certification.service';
import { LogService } from './services/log.service';
import { DriveService } from './services/drive.service';
import { VerificationService } from './services/verification.service';

@Module({
  imports: [PrismaModule],
  controllers: [PersonalController, DriveController],
  providers: [PersonalService, KanbanService, CandidateService, ContractService, CertificationService, LogService, DriveService, VerificationService],
  exports: [PersonalService],
})
export class PersonalModule {}
