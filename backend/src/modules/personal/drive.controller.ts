import { Controller, Get, Post, Patch, Delete, Body, Param, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { DriveService } from './services/drive.service';

@Controller('personal')
@UseGuards(AuthGuard('jwt'))
export class DriveController {
  constructor(private readonly driveService: DriveService) {}

  @Get('drive/config')
  getConfig(@Req() req: any) {
    return this.driveService.getConfig(req.user.companyId);
  }

  @Post('drive/config')
  saveConfig(@Body() body: { driveFolderId: string; driveFolderName: string }, @Req() req: any) {
    return this.driveService.saveConfig(req.user.companyId, body.driveFolderId, body.driveFolderName);
  }

  @Post('drive/test')
  testConnection(@Req() req: any) {
    return this.driveService.testConnection(req.user.companyId);
  }

  @Post('drive/sync')
  syncFolder(@Req() req: any) {
    return this.driveService.syncFolder(req.user.companyId);
  }

  @Get('drive/compliance/:cedula')
  getCompliance(@Param('cedula') cedula: string, @Req() req: any) {
    return this.driveService.getCompliance(cedula, req.user.companyId);
  }

  @Get('drive/tree')
  getTree(@Req() req: any) {
    return this.driveService.getTree(req.user.companyId);
  }

  @Get('document-types')
  getDocumentTypes(@Req() req: any) {
    return this.driveService.getDocumentTypes(req.user.companyId);
  }

  @Post('document-types')
  createDocumentType(@Body() body: { name: string; folder: string; required?: boolean }, @Req() req: any) {
    return this.driveService.createDocumentType(body, req.user.companyId);
  }

  @Patch('document-types/:id')
  updateDocumentType(@Param('id') id: string, @Body() body: { name?: string; required?: boolean }, @Req() req: any) {
    return this.driveService.updateDocumentType(+id, body, req.user.companyId);
  }

  @Delete('document-types/:id')
  deleteDocumentType(@Param('id') id: string, @Req() req: any) {
    return this.driveService.deleteDocumentType(+id, req.user.companyId);
  }

  // RECLUTAMIENTO & PUESTOS
  @Get('reclutamiento/puestos')
  getJobPositions(@Req() req: any) {
    return this.driveService.getJobPositions(req.user.companyId);
  }

  @Post('reclutamiento/puestos')
  createJobPosition(
    @Body() body: { puesto: string; descripcion?: string; camposRequeridos?: string[]; archivosRequeridos?: string[] },
    @Req() req: any
  ) {
    return this.driveService.createJobPosition(body, req.user.companyId);
  }

  @Delete('reclutamiento/puestos/:id')
  deleteJobPosition(@Param('id') id: string, @Req() req: any) {
    return this.driveService.deleteJobPosition(+id, req.user.companyId);
  }

  @Post('reclutamiento/sync')
  syncReclutamientoCandidates(@Req() req: any) {
    return this.driveService.syncReclutamientoCandidates(req.user.companyId);
  }
}
