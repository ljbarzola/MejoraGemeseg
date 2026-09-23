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
  Query,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { SistemasDriveService } from './services/sistemas-drive.service';
import { SistemasService } from './sistemas.service';
import { SectionPermissionGuard } from '../../common/guards/section-permission.guard';
import { Section } from '../../common/decorators/section.decorator';
import { PermissionsService } from '../permissions/permissions.service';
import { SaveSistemasDriveConfigDto } from './dto/drive-config.dto';

@Controller('sistemas')
@UseGuards(AuthGuard('jwt'), SectionPermissionGuard)
export class SistemasConfigController {
  private readonly logger = new Logger(SistemasConfigController.name);

  constructor(
    private readonly driveService: SistemasDriveService,
    private readonly sistemasService: SistemasService,
    private readonly permissions: PermissionsService,
  ) {}

  @Get('drive-config')
  @Section('SISTEMAS', 'view')
  getDriveConfig(@Req() req: any, @Query('companyId') companyId?: string) {
    return this.driveService.getDriveConfig(
      this.resolveCompanyId(req.user, companyId),
    );
  }

  @Post('drive-config')
  @Section('SISTEMAS', 'write')
  saveDriveConfig(@Body() body: SaveSistemasDriveConfigDto, @Req() req: any) {
    return this.driveService.saveDriveConfig(
      this.resolveCompanyId(req.user, body.companyId),
      body.driveFolderId.trim(),
    );
  }

  /**
   * La carpeta es de una empresa. El admin de esa empresa usa la suya.
   * El super admin no tiene companyId: si se lo pasamos en null, Prisma
   * revienta el upsert y el filtro global lo muestra como
   * "Error interno del servidor".
   */
  private resolveCompanyId(
    user: { role: string; companyId: number | null },
    requested?: number | string,
  ): number {
    const parsed =
      requested === undefined || requested === null || requested === ''
        ? undefined
        : Number(requested);
    if (this.permissions.isSuperAdmin(user)) {
      if (!parsed || Number.isNaN(parsed)) {
        throw new BadRequestException(
          'Elige la empresa a la que pertenece esta carpeta de capturas.',
        );
      }
      return parsed;
    }
    if (!user.companyId) {
      throw new BadRequestException('Tu usuario no tiene empresa asociada.');
    }
    return user.companyId;
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
