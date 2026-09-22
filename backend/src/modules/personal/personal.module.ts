import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { PersonalController } from './personal.controller';
import { ContractFileController } from './contract-file.controller';
import { DriveController } from './drive.controller';
import { EntidadController } from './entidad.controller';
import { MovimientoPersonalController } from './movimiento-personal.controller';
import { CedulaMergeController } from './cedula-merge.controller';
import { SurveyController } from './survey.controller';
import { PublicSurveyController } from './public-survey.controller';
import { PersonalService } from './personal.service';
import { ContractService } from './services/contract.service';
import { DriveService } from './services/drive.service';
import { DocumentExtractionService } from './services/document-extraction.service';
import { ReclutamientoIaService } from './services/reclutamiento-ia.service';
import { SistemaVerificacionService } from './services/sistema-verificacion.service';
import { MovimientoPersonalService } from './services/movimiento-personal.service';
import { DocumentReviewService } from './services/document-review.service';
import { EntidadService } from './services/entidad.service';
import { RequisitoDocumentoService } from './services/requisito-documento.service';
import { AsignacionGuardiaService } from './services/asignacion-guardia.service';
import { CumplimientoEntidadService } from './services/cumplimiento-entidad.service';
import { AlertaVencimientoService } from './services/alerta-vencimiento.service';
import { GuardiaContactoService } from './services/guardia-contacto.service';
import { GuardiaFichaPersonalService } from './services/guardia-ficha-personal.service';
import { PersonalFieldDefinitionService } from './services/personal-field-definition.service';
import { AdministrativeStaffFichaService } from './services/administrative-staff-ficha.service';
import { CedulaMergeService } from './services/cedula-merge.service';
import { GuardiasExportService } from './services/guardias-export.service';
import { TrainingService } from './services/training.service';
import { PersonalAlertsService } from './services/personal-alerts.service';
import { ComplaintService } from './services/complaint.service';
import { ComplaintFieldDefinitionService } from './services/complaint-field-definition.service';
import { ComplaintStageService } from './services/complaint-stage.service';
import { SurveyService } from './services/survey.service';
import { NotificationConfigService } from './services/notification-config.service';
import { NotificationConfigController } from './notification-config.controller';
import { WhatsAppService } from './services/whatsapp.service';
import { PermissionsModule } from '../permissions/permissions.module';
import { MailModule } from '../mail/mail.module';

@Module({
  imports: [PrismaModule, PermissionsModule, MailModule],
  controllers: [
    PersonalController,
    ContractFileController,
    DriveController,
    EntidadController,
    MovimientoPersonalController,
    CedulaMergeController,
    SurveyController,
    PublicSurveyController,
    NotificationConfigController,
  ],
  providers: [
    PersonalService,
    ContractService,
    DriveService,
    DocumentExtractionService,
    ReclutamientoIaService,
    SistemaVerificacionService,
    MovimientoPersonalService,
    DocumentReviewService,
    EntidadService,
    RequisitoDocumentoService,
    AsignacionGuardiaService,
    CumplimientoEntidadService,
    AlertaVencimientoService,
    GuardiaContactoService,
    GuardiaFichaPersonalService,
    PersonalFieldDefinitionService,
    AdministrativeStaffFichaService,
    CedulaMergeService,
    GuardiasExportService,
    TrainingService,
    PersonalAlertsService,
    ComplaintService,
    ComplaintFieldDefinitionService,
    ComplaintStageService,
    SurveyService,
    NotificationConfigService,
    WhatsAppService,
  ],
  exports: [PersonalService, DriveService],
})
export class PersonalModule {}
