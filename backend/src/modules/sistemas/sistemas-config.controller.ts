import {
  Body,
  Controller,
  Get,
  Post,
  Req,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { SistemasDriveService } from './services/sistemas-drive.service';
import { SistemasService } from './sistemas.service';
import { SectionPermissionGuard } from '../../common/guards/section-permission.guard';
import { Section } from '../../common/decorators/section.decorator';

@Controller('sistemas')
@UseGuards(AuthGuard('jwt'), SectionPermissionGuard)
export class SistemasConfigController {
  private readonly logger = new Logger(SistemasConfigController.name);

  constructor(
    private readonly driveService: SistemasDriveService,
    private readonly sistemasService: SistemasService,
  ) {}

  @Get('drive-config')
  @Section('SISTEMAS', 'view')
  getDriveConfig(@Req() req: any) {
    return this.driveService.getDriveConfig(req.user.companyId);
  }

  @Post('drive-config')
  @Section('SISTEMAS', 'write')
  saveDriveConfig(@Body() body: { driveFolderId: string }, @Req() req: any) {
    if (!body.driveFolderId?.trim()) {
      throw new BadRequestException('El ID de la carpeta de Drive es requerido.');
    }
    return this.driveService.saveDriveConfig(req.user.companyId, body.driveFolderId.trim());
  }

  @Post('drive-config/test')
  @Section('SISTEMAS', 'view')
  testDriveConnection(@Body() body: { driveFolderId: string }) {
    if (!body.driveFolderId?.trim()) {
      throw new BadRequestException('El ID de la carpeta de Drive es requerido.');
    }
    return this.driveService.testConnection(body.driveFolderId.trim());
  }

  // Sin guard de sección a propósito: lo usa el adjunto de "Reportar a Sistemas"
  // (ReportarProblemaButton.tsx), abierto a cualquier usuario autenticado igual
  // que la creación del ticket (POST /sistemas/tickets) — no es un endpoint de
  // configuración de Sistemas.
  @Post('upload')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 10 * 1024 * 1024 },
    }),
  )
  async uploadFile(
    @UploadedFile() file: Express.Multer.File,
    @Req() req: any,
  ) {
    if (!file) throw new BadRequestException('No se recibió ningún archivo');
    return this.driveService.uploadFile(req.user.companyId, file);
  }

  @Get('dashboard/stats')
  @Section('SISTEMAS', 'view')
  getDashboardStats(@Req() req: any) {
    return this.sistemasService.getStats(req.user.companyId);
  }
}
