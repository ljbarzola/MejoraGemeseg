import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { PersonalController } from './personal.controller';
import { ContractFileController } from './contract-file.controller';
import { DriveController } from './drive.controller';
import { EntidadController } from './entidad.controller';
import { MovimientoPersonalController } from './movimiento-personal.controller';
import { CedulaMergeController } from './cedula-merge.controller';
import { PersonalService } from './personal.service';
import { KanbanService } from './services/kanban.service';
import { CandidateService } from './services/candidate.service';
import { ContractService } from './services/contract.service';
import { CertificationService } from './services/certification.service';
import { LogService } from './services/log.service';
import { DriveService } from './services/drive.service';
import { DocumentExtractionService } from './services/document-extraction.service';
import { SistemaVerificacionService } from './services/sistema-verificacion.service';
import { MovimientoPersonalService } from './services/movimiento-personal.service';
import { DocumentReviewService } from './services/document-review.service';
import { EntidadService } from './services/entidad.service';
import { RequisitoDocumentoService } from './services/requisito-documento.service';
import { AsignacionGuardiaService } from './services/asignacion-guardia.service';
import { CumplimientoEntidadService } from './services/cumplimiento-entidad.service';
import { GmailMailService } from './services/gmail-mail.service';
import { AlertaVencimientoService } from './services/alerta-vencimiento.service';
import { GuardiaContactoService } from './services/guardia-contacto.service';
import { GuardiaFichaPersonalService } from './services/guardia-ficha-personal.service';
import { PersonalFieldDefinitionService } from './services/personal-field-definition.service';
import { AdministrativeStaffFichaService } from './services/administrative-staff-ficha.service';
import { CedulaMergeService } from './services/cedula-merge.service';
import { PermissionsModule } from '../permissions/permissions.module';

@Module({
  imports: [PrismaModule, PermissionsModule],
  controllers: [
    PersonalController,
    ContractFileController,
    DriveController,
    EntidadController,
    MovimientoPersonalController,
    CedulaMergeController,
  ],
  providers: [
    PersonalService,
    KanbanService,
    CandidateService,
    ContractService,
    CertificationService,
    LogService,
    DriveService,
    DocumentExtractionService,
    SistemaVerificacionService,
    MovimientoPersonalService,
    DocumentReviewService,
    EntidadService,
    RequisitoDocumentoService,
    AsignacionGuardiaService,
    CumplimientoEntidadService,
    GmailMailService,
    AlertaVencimientoService,
    GuardiaContactoService,
    GuardiaFichaPersonalService,
    PersonalFieldDefinitionService,
    AdministrativeStaffFichaService,
    CedulaMergeService,
  ],
  exports: [PersonalService],
})
export class PersonalModule {}
