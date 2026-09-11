import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  Req,
  UseGuards,
  ParseIntPipe,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { DriveService } from './services/drive.service';
import { DocumentReviewService } from './services/document-review.service';
import { DocumentExtractionService } from './services/document-extraction.service';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { SectionPermissionGuard } from '../../common/guards/section-permission.guard';
import { Section } from '../../common/decorators/section.decorator';
import { UserRole } from '@prisma/client';
import {
  SaveDriveConfigDto,
  TestDriveConnectionDto,
  MoverGuardiaEntidadDto,
} from './dto/drive.dto';
import {
  CreateDocumentTypeDto,
  UpdateDocumentTypeDto,
} from './dto/document-type.dto';
import {
  CreateJobPositionDto,
  UpdateJobPositionDto,
  ReassignReclutamientoFileDto,
  SaveCandidatoDatosDto,
} from './dto/job-position.dto';
import { ReviewDocumentDto } from './dto/document-review.dto';
import {
  UpdateDocumentExpiryDto,
  ReassignDocumentTypeDto,
} from './dto/document-type.dto';

@Controller('personal')
@UseGuards(AuthGuard('jwt'))
export class DriveController {
  constructor(
    private readonly driveService: DriveService,
    private readonly documentReviewService: DocumentReviewService,
    private readonly documentExtractionService: DocumentExtractionService,
  ) {}

  @Get('drive/config')
  getConfig(@Req() req: any, @Query('type') type?: string) {
    return this.driveService.getConfig(req.user.companyId, type);
  }

  @Post('drive/config')
  saveConfig(@Body() body: SaveDriveConfigDto, @Req() req: any) {
    return this.driveService.saveConfig(
      req.user.companyId,
      body.driveFolderId,
      body.type,
    );
  }

  @Post('drive/test')
  testConnection(@Body() body: TestDriveConnectionDto, @Req() req: any) {
    return this.driveService.testConnection(
      req.user.companyId,
      body.driveFolderId,
      body.type,
    );
  }

  @Post('drive/sync')
  syncFolder(@Req() req: any) {
    return this.driveService.syncFolder(req.user.companyId, req.user.userId);
  }

  // Sync de la carpeta Público/Privado/Entidad/Guardia (módulo de
  // Entidades/Cumplimiento) — reemplaza el uso plano Custodios/Personal para
  // esta misma carpeta configurada con type='CUMPLIMIENTO'.
  @Post('drive/sync-entidades')
  syncEntidadesFolder(@Req() req: any) {
    return this.driveService.syncEntidadesFolder(
      req.user.companyId,
      req.user.userId,
    );
  }

  @Post('drive/sync-personal-admin')
  syncPersonalAdminFolder(@Req() req: any) {
    return this.driveService.syncPersonalAdminFolder(
      req.user.companyId,
      req.user.userId,
    );
  }

  @Get('drive/compliance/:cedula')
  getCompliance(@Param('cedula') cedula: string, @Req() req: any) {
    return this.driveService.getCompliance(cedula, req.user.companyId);
  }

  // REVISIÓN DOCUMENTAL (aprobar/rechazar con motivo + traza)
  // El acceso se gobierna por la sección RRHH, no por rol.
  @Post('drive/documents/review')
  @UseGuards(AuthGuard('jwt'), SectionPermissionGuard)
  @Section('RRHH', 'write')
  reviewDocument(@Body() body: ReviewDocumentDto, @Req() req: any) {
    return this.documentReviewService.review(
      body,
      req.user.companyId,
      req.user.userId,
    );
  }

  @Get('drive/documents/review-history')
  @UseGuards(AuthGuard('jwt'), SectionPermissionGuard)
  @Section('RRHH', 'view')
  getDocumentReviewHistory(@Req() req: any, @Query('cedula') cedula?: string) {
    return this.documentReviewService.getHistory(req.user.companyId, cedula);
  }

  @Get('drive/documents/reviews/:cedula')
  @UseGuards(AuthGuard('jwt'), SectionPermissionGuard)
  @Section('RRHH', 'view')
  getDocumentReviews(@Param('cedula') cedula: string, @Req() req: any) {
    return this.documentReviewService.findByCedula(cedula, req.user.companyId);
  }

  @Get('drive/tree')
  getTree(@Req() req: any) {
    return this.driveService.getTree(req.user.companyId);
  }

  // Fecha de emisión/vencimiento de un documento ya sincronizado desde Drive
  // (módulo de cumplimiento por entidad). Vive aquí, junto al resto de
  // mutaciones sobre EmployeeDocument, en vez de en EntidadController.
  @Patch('drive/documents/:driveFileId/expiry')
  @UseGuards(AuthGuard('jwt'), SectionPermissionGuard)
  @Section('RRHH', 'write')
  setDocumentExpiry(
    @Param('driveFileId') driveFileId: string,
    @Body() body: UpdateDocumentExpiryDto,
    @Req() req: any,
  ) {
    return this.driveService.setDocumentExpiry(
      driveFileId,
      body,
      req.user.companyId,
      req.user.userId,
    );
  }

  // Lectura asistida por IA de fecha de emisión/vencimiento (Fase B de
  // cumplimiento por entidad). Solo PROPONE valores extraídos del PDF — nunca
  // guarda nada. RRHH debe revisar/corregir y confirmar explícitamente vía
  // PATCH .../expiry (arriba) para persistirlos. Ver DocumentExtractionService.
  @Post('drive/documents/:driveFileId/extract-expiry')
  @UseGuards(AuthGuard('jwt'), SectionPermissionGuard)
  @Section('RRHH', 'write')
  extractDocumentExpiry(
    @Param('driveFileId') driveFileId: string,
    @Req() req: any,
  ) {
    return this.documentExtractionService.extractExpiry(
      driveFileId,
      req.user.companyId,
    );
  }

  // RRHH reclasifica un archivo "adicional" (unmatchedFile) como el documento
  // requerido que en realidad es. Ver DriveService.reassignDocumentType.
  @Patch('drive/documents/:driveFileId/reassign-type')
  @UseGuards(AuthGuard('jwt'), SectionPermissionGuard)
  @Section('RRHH', 'write')
  reassignDocumentType(
    @Param('driveFileId') driveFileId: string,
    @Body() body: ReassignDocumentTypeDto,
    @Req() req: any,
  ) {
    return this.driveService.reassignDocumentType(
      driveFileId,
      body.documentTypeId,
      req.user.companyId,
    );
  }

  @Get('document-types')
  getDocumentTypes(@Req() req: any) {
    return this.driveService.getDocumentTypes(req.user.companyId);
  }

  @Post('document-types')
  createDocumentType(@Body() body: CreateDocumentTypeDto, @Req() req: any) {
    return this.driveService.createDocumentType(body, req.user.companyId);
  }

  @Patch('document-types/:id')
  updateDocumentType(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: UpdateDocumentTypeDto,
    @Req() req: any,
  ) {
    return this.driveService.updateDocumentType(id, body, req.user.companyId);
  }

  @Delete('document-types/:id')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.ADMIN)
  deleteDocumentType(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
    return this.driveService.deleteDocumentType(id, req.user.companyId);
  }

  // RECLUTAMIENTO & PUESTOS
  @Get('reclutamiento/puestos')
  getJobPositions(@Req() req: any) {
    return this.driveService.getJobPositions(req.user.companyId);
  }

  @Post('reclutamiento/puestos')
  createJobPosition(@Body() body: CreateJobPositionDto, @Req() req: any) {
    return this.driveService.createJobPosition(body, req.user.companyId);
  }

  @Patch('reclutamiento/puestos/:id')
  updateJobPosition(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: UpdateJobPositionDto,
    @Req() req: any,
  ) {
    return this.driveService.updateJobPosition(id, body, req.user.companyId);
  }

  @Delete('reclutamiento/puestos/:id')
  deleteJobPosition(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
    return this.driveService.deleteJobPosition(id, req.user.companyId);
  }

  @Post('reclutamiento/sync')
  syncReclutamientoCandidates(@Req() req: any) {
    return this.driveService.syncReclutamientoCandidates(req.user.companyId);
  }

  @Post('reclutamiento/sync-puestos')
  syncJobPositionsFromDrive(@Req() req: any) {
    return this.driveService.syncJobPositionsFromDrive(req.user.companyId);
  }

  // RRHH reclasifica un archivo "adicional" de un candidato de Reclutamiento
  // como el documento requerido que en realidad es. Ver
  // DriveService.reassignReclutamientoFile.
  @Patch('reclutamiento/documentos/:driveFileId/reassign')
  @UseGuards(AuthGuard('jwt'), SectionPermissionGuard)
  @Section('RRHH', 'write')
  reassignReclutamientoFile(
    @Param('driveFileId') driveFileId: string,
    @Body() body: ReassignReclutamientoFileDto,
    @Req() req: any,
  ) {
    return this.driveService.reassignReclutamientoFile(
      driveFileId,
      body.archivoNombre,
      req.user.companyId,
    );
  }

  // RRHH carga/edita los datos del postulante (camposRequeridos del puesto)
  // de un candidato de Reclutamiento. Ver DriveService.saveCandidatoDatos.
  @Patch('reclutamiento/candidatos/:folderId/datos')
  @UseGuards(AuthGuard('jwt'), SectionPermissionGuard)
  @Section('RRHH', 'write')
  saveCandidatoDatos(
    @Param('folderId') folderId: string,
    @Body() body: SaveCandidatoDatosDto,
    @Req() req: any,
  ) {
    return this.driveService.saveCandidatoDatos(
      folderId,
      body.datos,
      req.user.companyId,
    );
  }

  // Contrata a un postulante: mueve su carpeta de Reclutamiento a "Sin
  // Asignar" dentro de Guardias y de inmediato corre la sincronización de
  // Guardias, para que aparezca ya en Listado de Guardias sin que RRHH tenga
  // que ir a apretar "Sincronizar Drive" a mano. Ver DriveService.contratarCandidato.
  @Post('reclutamiento/candidatos/:folderId/contratar')
  @UseGuards(AuthGuard('jwt'), SectionPermissionGuard)
  @Section('RRHH', 'write')
  async contratarCandidato(@Param('folderId') folderId: string, @Req() req: any) {
    const contratacion = await this.driveService.contratarCandidato(
      req.user.companyId,
      folderId,
    );
    const sync = await this.driveService.syncEntidadesFolder(
      req.user.companyId,
      req.user.userId,
    );
    return { contratacion, sync };
  }

  @Delete('drive/employee/:cedula')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.ADMIN)
  deleteDriveEmployee(@Param('cedula') cedula: string, @Req() req: any) {
    return this.driveService.deleteEmployeeByCedula(cedula, req.user.companyId);
  }

  // Mueve la carpeta de un guardia a la carpeta de archivo (FolderConfig
  // type='GUARDIAS_ARCHIVO') una vez que su salida está completada. No borra
  // documentos — RRHH-write basta, no requiere ser ADMIN.
  @Post('drive/guardia/:cedula/archivar-carpeta')
  @UseGuards(AuthGuard('jwt'), SectionPermissionGuard)
  @Section('RRHH', 'write')
  archivarCarpetaGuardia(@Param('cedula') cedula: string, @Req() req: any) {
    return this.driveService.archivarCarpetaGuardia(
      req.user.companyId,
      cedula,
    );
  }

  // Asigna/mueve a un guardia a una entidad (mueve su carpeta en Drive y
  // sincroniza de inmediato, mismo patrón que contratarCandidato de arriba)
  // para que no haya que apretar "Sincronizar Drive" a mano después.
  @Post('drive/guardia/:cedula/mover-entidad')
  @UseGuards(AuthGuard('jwt'), SectionPermissionGuard)
  @Section('RRHH', 'write')
  async moverGuardiaAEntidad(
    @Param('cedula') cedula: string,
    @Body() dto: MoverGuardiaEntidadDto,
    @Req() req: any,
  ) {
    const movimiento = await this.driveService.moverGuardiaAEntidad(
      req.user.companyId,
      cedula,
      dto.entidadId,
    );
    const sync = await this.driveService.syncEntidadesFolder(
      req.user.companyId,
      req.user.userId,
    );
    return { movimiento, sync };
  }
}
