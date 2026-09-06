import { Controller, Get, Post, Patch, Delete, Body, Param, Req, UseGuards, ParseIntPipe } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { DriveService } from './services/drive.service';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '@prisma/client';
import { SaveDriveConfigDto } from './dto/drive.dto';
import { CreateDocumentTypeDto, UpdateDocumentTypeDto } from './dto/document-type.dto';
import { CreateJobPositionDto, UpdateJobPositionDto } from './dto/job-position.dto';
import { TestDriveConnectionDto } from './dto/verification.dto';

@Controller('personal')
@UseGuards(AuthGuard('jwt'))
export class DriveController {
  constructor(private readonly driveService: DriveService) {}

  @Get('drive/config')
  getConfig(@Req() req: any) {
    return this.driveService.getConfig(req.user.companyId);
  }

  @Post('drive/config')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.ADMIN)
  saveConfig(@Body() body: SaveDriveConfigDto, @Req() req: any) {
    return this.driveService.saveConfig(req.user.companyId, body.driveFolderId, body.driveFolderName);
  }

  @Post('drive/test')
  testConnection(@Body() body: TestDriveConnectionDto, @Req() req: any) {
    return this.driveService.testConnection(req.user.companyId, body.driveFolderId);
  }

  @Post('drive/sync')
  syncFolder(@Req() req: any) {
    return this.driveService.syncFolder(req.user.companyId, req.user.userId);
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
  createDocumentType(@Body() body: CreateDocumentTypeDto, @Req() req: any) {
    return this.driveService.createDocumentType(body, req.user.companyId);
  }

  @Patch('document-types/:id')
  updateDocumentType(@Param('id', ParseIntPipe) id: number, @Body() body: UpdateDocumentTypeDto, @Req() req: any) {
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
  createJobPosition(
    @Body() body: CreateJobPositionDto,
    @Req() req: any
  ) {
    return this.driveService.createJobPosition(body, req.user.companyId);
  }

  @Patch('reclutamiento/puestos/:id')
  updateJobPosition(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: UpdateJobPositionDto,
    @Req() req: any
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

  @Delete('drive/employee/:cedula')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.ADMIN)
  deleteDriveEmployee(@Param('cedula') cedula: string, @Req() req: any) {
    return this.driveService.deleteEmployeeByCedula(cedula, req.user.companyId);
  }
}
