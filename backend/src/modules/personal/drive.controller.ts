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
  Res,
  UseGuards,
  ParseIntPipe,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import type { Response } from 'express';
import { AuthGuard } from '@nestjs/passport';
import { DriveService } from './services/drive.service';
import { DocumentReviewService } from './services/document-review.service';
import { DocumentExtractionService } from './services/document-extraction.service';
import { ReclutamientoIaService } from './services/reclutamiento-ia.service';
import { SectionPermissionGuard } from '../../common/guards/section-permission.guard';
import { Section, NoSectionCheck } from '../../common/decorators/section.decorator';
import { PermissionsService } from '../permissions/permissions.service';
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
  AplicarAnalisisDto,
  ConflictosSeparacionDto,
  RevisarArchivosDto,
} from './dto/job-position.dto';
import { ReviewDocumentDto } from './dto/document-review.dto';
import {
  UpdateDocumentExpiryDto,
  ReassignDocumentTypeDto,
  ApproveAdditionalDocumentDto,
} from './dto/document-type.dto';

@Controller('personal')
@UseGuards(AuthGuard('jwt'), SectionPermissionGuard)
@Section('RRHH', 'view')
export class DriveController {
  constructor(
    private readonly driveService: DriveService,
    private readonly documentReviewService: DocumentReviewService,
    private readonly documentExtractionService: DocumentExtractionService,
    private readonly reclutamientoIaService: ReclutamientoIaService,
    private readonly permissionsService: PermissionsService,
  ) {}

  // El controller entero exige @Section('RRHH','view'), pero esta ruta
  // también la usa Ventas (type=VENTAS_CONTRATOS) para leer el enlace de
  // Drive de los contratos — de ahí NoSectionCheck() y la validación manual
  // según el `type` recibido.
  @Get('drive/config')
  @NoSectionCheck()
  async getConfig(@Req() req: any, @Query('type') type?: string) {
    const section = type === 'VENTAS_CONTRATOS' ? 'VENTAS' : 'RRHH';
    const allowed = await this.permissionsService.hasSectionAccess(
      req.user,
      section,
      'view',
    );
    if (!allowed) {
      throw new ForbiddenException(`No tienes acceso a ${section}`);
    }
    return this.driveService.getConfig(req.user.companyId, type);
  }

  @Post('drive/config')
  @Section('RRHH', 'write')
  saveConfig(@Body() body: SaveDriveConfigDto, @Req() req: any) {
    return this.driveService.saveConfig(
      req.user.companyId,
      body.driveFolderId,
      body.type,
    );
  }

  @Post('drive/test')
  @Section('RRHH', 'write')
  testConnection(@Body() body: TestDriveConnectionDto, @Req() req: any) {
    return this.driveService.testConnection(
      req.user.companyId,
      body.driveFolderId,
      body.type,
    );
  }

  // Sync de la carpeta Público/Privado/Entidad/Guardia (módulo de
  // Entidades/Cumplimiento) — reemplaza el uso plano Custodios/Personal para
  // esta misma carpeta configurada con type='CUMPLIMIENTO'.
  @Post('drive/sync-entidades')
  @Section('RRHH', 'write')
  syncEntidadesFolder(@Req() req: any) {
    return this.driveService.syncEntidadesFolder(
      req.user.companyId,
      req.user.userId,
    );
  }

  @Post('drive/sync-personal-admin')
  @Section('RRHH', 'write')
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

  // RRHH aprueba un archivo "adicional" dándole un nombre propio, sin
  // asociarlo a un tipo de documento requerido. Ver
  // DriveService.approveAsAdditionalDocument.
  @Patch('drive/documents/:driveFileId/approve-additional')
  @UseGuards(AuthGuard('jwt'), SectionPermissionGuard)
  @Section('RRHH', 'write')
  approveAsAdditionalDocument(
    @Param('driveFileId') driveFileId: string,
    @Body() body: ApproveAdditionalDocumentDto,
    @Req() req: any,
  ) {
    return this.driveService.approveAsAdditionalDocument(
      driveFileId,
      body.label,
      req.user.companyId,
    );
  }

  @Get('document-types')
  getDocumentTypes(@Req() req: any) {
    return this.driveService.getDocumentTypes(req.user.companyId);
  }

  @Post('document-types')
  @Section('RRHH', 'write')
  createDocumentType(@Body() body: CreateDocumentTypeDto, @Req() req: any) {
    return this.driveService.createDocumentType(body, req.user.companyId);
  }

  @Patch('document-types/:id')
  @Section('RRHH', 'write')
  updateDocumentType(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: UpdateDocumentTypeDto,
    @Req() req: any,
  ) {
    return this.driveService.updateDocumentType(id, body, req.user.companyId);
  }

  @Delete('document-types/:id')
  @UseGuards(AuthGuard('jwt'), SectionPermissionGuard)
  @Section('RRHH', 'write')
  deleteDocumentType(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
    return this.driveService.deleteDocumentType(id, req.user.companyId);
  }

  // RECLUTAMIENTO & PUESTOS
  @Get('reclutamiento/puestos')
  getJobPositions(@Req() req: any) {
    return this.driveService.getJobPositions(req.user.companyId);
  }

  @Post('reclutamiento/puestos')
  @Section('RRHH', 'write')
  createJobPosition(@Body() body: CreateJobPositionDto, @Req() req: any) {
    return this.driveService.createJobPosition(body, req.user.companyId);
  }

  @Patch('reclutamiento/puestos/:id')
  @Section('RRHH', 'write')
  updateJobPosition(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: UpdateJobPositionDto,
    @Req() req: any,
  ) {
    return this.driveService.updateJobPosition(id, body, req.user.companyId);
  }

  @Delete('reclutamiento/puestos/:id')
  @Section('RRHH', 'write')
  deleteJobPosition(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
    return this.driveService.deleteJobPosition(id, req.user.companyId);
  }

  @Post('reclutamiento/sync')
  @Section('RRHH', 'write')
  syncReclutamientoCandidates(@Req() req: any) {
    return this.driveService.syncReclutamientoCandidates(req.user.companyId);
  }

  @Post('reclutamiento/sync-puestos')
  @Section('RRHH', 'write')
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

  // Sirve al navegador el PDF de un postulante. Hace falta un proxy porque los
  // archivos de Drive viven detrás de la service account: el front no los puede
  // pedir directo. Se valida que el archivo esté REALMENTE dentro de la carpeta
  // indicada antes de servirlo, para que este endpoint no se convierta en un
  // lector universal de cualquier id de Drive que alguien adivine.
  @Get('reclutamiento/candidatos/:folderId/pdf/:driveFileId')
  @UseGuards(AuthGuard('jwt'), SectionPermissionGuard)
  @Section('RRHH', 'view')
  async getCandidatoPdf(
    @Param('folderId') folderId: string,
    @Param('driveFileId') driveFileId: string,
    @Res() res: Response,
  ) {
    const archivos = await this.driveService.listFilesInFolder(folderId);
    if (!archivos.some((f: any) => f.id === driveFileId)) {
      throw new BadRequestException(
        'Ese archivo no pertenece a la carpeta de este postulante.',
      );
    }
    const buffer = await this.driveService.downloadFileBuffer(driveFileId);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Length', buffer.length);
    res.send(buffer);
  }

  // Igual que getCandidatoPdf de arriba, pero sirviendo el mimeType real del
  // archivo en vez de forzar 'application/pdf'. La usa el modal de "Confirmar
  // y separar" para mostrar la vista previa del archivo YA existente cuando
  // hay conflicto con lo que se está por crear — ese archivo puede ser una
  // imagen (.jpg/.png) si el postulante lo subió suelto, no solo un PDF.
  @Get('reclutamiento/candidatos/:folderId/archivo/:driveFileId')
  @UseGuards(AuthGuard('jwt'), SectionPermissionGuard)
  @Section('RRHH', 'view')
  async getCandidatoArchivo(
    @Param('folderId') folderId: string,
    @Param('driveFileId') driveFileId: string,
    @Res() res: Response,
  ) {
    const archivos = await this.driveService.listFilesInFolder(folderId);
    const archivo = archivos.find((f: any) => f.id === driveFileId);
    if (!archivo) {
      throw new BadRequestException(
        'Ese archivo no pertenece a la carpeta de este postulante.',
      );
    }
    const buffer = await this.driveService.downloadFileBuffer(driveFileId);
    res.setHeader(
      'Content-Type',
      (archivo as any).mimeType || 'application/octet-stream',
    );
    res.setHeader('Content-Length', buffer.length);
    res.send(buffer);
  }

  // Devuelve la última propuesta de análisis guardada (si hay una), SIN
  // llamar a Vertex AI. Se consulta al abrir el modal de revisión: si RRHH lo
  // cerró para revisar otra cosa y vuelve, encuentra la misma propuesta en
  // vez de tener que repetir el análisis. `GET`, no `POST` — es una simple
  // lectura, no dispara ningún trabajo nuevo.
  @Get('reclutamiento/candidatos/:folderId/analisis-pendiente')
  @UseGuards(AuthGuard('jwt'), SectionPermissionGuard)
  @Section('RRHH', 'view')
  obtenerAnalisisPendiente(
    @Param('folderId') folderId: string,
    @Req() req: any,
    @Query('driveFileId') driveFileId?: string,
  ) {
    return this.reclutamientoIaService.obtenerPropuestaPendiente(
      folderId,
      req.user.companyId,
      driveFileId,
    );
  }

  // Análisis asistido del "archivo único": la IA PROPONE qué documento
  // requerido está en qué páginas del PDF. No escribe nada en Drive — todo lo
  // que toca archivos pasa por el endpoint de aplicar, de abajo. También
  // guarda la propuesta como pendiente (ver obtenerAnalisisPendiente arriba).
  // Ver ReclutamientoIaService.
  @Post('reclutamiento/candidatos/:folderId/analizar')
  @UseGuards(AuthGuard('jwt'), SectionPermissionGuard)
  @Section('RRHH', 'write')
  analizarArchivoUnico(
    @Param('folderId') folderId: string,
    @Req() req: any,
    @Query('driveFileId') driveFileId?: string,
  ) {
    return this.reclutamientoIaService.analizar(
      folderId,
      req.user.companyId,
      driveFileId,
    );
  }

  // Archivos subidos por separado: ¿el de la casilla "Cédula" es una cédula?
  // Y, para los que quedaron como adicionales, una frase de qué documento es.
  // No parte ni renombra nada.
  @Post('reclutamiento/candidatos/:folderId/revisar-archivos')
  @UseGuards(AuthGuard('jwt'), SectionPermissionGuard)
  @Section('RRHH', 'write')
  revisarArchivos(
    @Param('folderId') folderId: string,
    @Body() body: RevisarArchivosDto,
    @Req() req: any,
  ) {
    return this.reclutamientoIaService.revisarArchivos(
      folderId,
      req.user.companyId,
      body.requeridos || [],
      body.adicionales || [],
    );
  }

  @Get('reclutamiento/candidatos/:folderId/revision-archivos')
  @UseGuards(AuthGuard('jwt'), SectionPermissionGuard)
  @Section('RRHH', 'view')
  obtenerRevisionArchivos(
    @Param('folderId') folderId: string,
    @Req() req: any,
  ) {
    return this.reclutamientoIaService.obtenerRevisionArchivos(
      folderId,
      req.user.companyId,
    );
  }

  // Antes de aplicar: ¿alguno de estos requisitos ya tiene un archivo
  // guardado en la carpeta? El modal de "Confirmar y separar" lo llama justo
  // antes de mandar aplicar-analisis, para preguntar reemplazar/mantener
  // documento por documento en vez de pisar en silencio lo que ya había.
  @Post('reclutamiento/candidatos/:folderId/conflictos-separacion')
  @UseGuards(AuthGuard('jwt'), SectionPermissionGuard)
  @Section('RRHH', 'write')
  detectarConflictosSeparacion(
    @Param('folderId') folderId: string,
    @Body() body: ConflictosSeparacionDto,
    @Req() req: any,
  ) {
    return this.reclutamientoIaService.detectarConflictos(
      folderId,
      req.user.companyId,
      body.requisitos || [],
    );
  }

  // RRHH confirmó/corrigió la propuesta: se parte el PDF en un archivo por
  // documento dentro de la misma carpeta, conservando el original. A partir de
  // aquí el postulante queda igual que uno que subió todo por separado.
  @Post('reclutamiento/candidatos/:folderId/aplicar-analisis')
  @UseGuards(AuthGuard('jwt'), SectionPermissionGuard)
  @Section('RRHH', 'write')
  aplicarAnalisis(
    @Param('folderId') folderId: string,
    @Body() body: AplicarAnalisisDto,
    @Req() req: any,
  ) {
    return this.reclutamientoIaService.aplicar(
      folderId,
      req.user.companyId,
      body.asignaciones,
      body.driveFileId,
      body.resoluciones,
    );
  }

  // Contrata a un postulante: mueve su carpeta de Reclutamiento al destino que
  // declara su vacante (Guardias/"Sin Asignar" o Personal Administrativo) y de
  // inmediato corre la sincronización DE ESE destino, para que aparezca ya en
  // su listado sin que RRHH tenga que ir a apretar "Sincronizar Drive" a mano.
  // Ver DriveService.contratarCandidato.
  @Post('reclutamiento/candidatos/:folderId/contratar')
  @UseGuards(AuthGuard('jwt'), SectionPermissionGuard)
  @Section('RRHH', 'write')
  async contratarCandidato(
    @Param('folderId') folderId: string,
    @Req() req: any,
  ) {
    const contratacion = await this.driveService.contratarCandidato(
      req.user.companyId,
      folderId,
      req.user.userId,
    );
    const sync =
      contratacion.tipoContratacion === 'ADMINISTRATIVO'
        ? await this.driveService.syncPersonalAdminFolder(
            req.user.companyId,
            req.user.userId,
          )
        : await this.driveService.syncEntidadesFolder(
            req.user.companyId,
            req.user.userId,
          );
    return { contratacion, sync };
  }

  @Delete('drive/employee/:cedula')
  @UseGuards(AuthGuard('jwt'), SectionPermissionGuard)
  @Section('RRHH', 'write')
  deleteDriveEmployee(@Param('cedula') cedula: string, @Req() req: any) {
    return this.driveService.deleteEmployeeByCedula(cedula, req.user.companyId);
  }

  // Quita de la lista a un guardia que ya está fuera. La carpeta de Drive
  // se queda; un archivo marcador evita que el sync lo vuelva a crear.
  @Delete('drive/guardia/:cedula/lista')
  @UseGuards(AuthGuard('jwt'), SectionPermissionGuard)
  @Section('RRHH', 'write')
  quitarGuardiaFueraDeLista(@Param('cedula') cedula: string, @Req() req: any) {
    return this.driveService.quitarGuardiaFueraDeLista(
      cedula,
      req.user.companyId,
    );
  }

  // Mueve la carpeta de un guardia a la carpeta de archivo (FolderConfig
  // type='GUARDIAS_ARCHIVO') una vez que su salida está completada. No borra
  // documentos — RRHH-write basta, no requiere ser ADMIN.
  @Post('drive/guardia/:cedula/archivar-carpeta')
  @UseGuards(AuthGuard('jwt'), SectionPermissionGuard)
  @Section('RRHH', 'write')
  archivarCarpetaGuardia(@Param('cedula') cedula: string, @Req() req: any) {
    return this.driveService.archivarCarpetaGuardia(req.user.companyId, cedula);
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
      dto.confirmCrearCarpeta,
    );
    // Si el servicio pide confirmación (entidad sin carpeta, sin candidata
    // encontrada), todavía no se movió nada — no corre el sync, que asume
    // que ya hubo un movimiento real para reflejar.
    if ('requiereConfirmacion' in movimiento) {
      return movimiento;
    }
    const sync = await this.driveService.syncEntidadesFolder(
      req.user.companyId,
      req.user.userId,
    );
    return { movimiento, sync };
  }
}
