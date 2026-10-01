import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Put,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { AuthGuard } from '@nestjs/passport';
import { memoryStorage } from 'multer';
import { SectionPermissionGuard } from '../../../common/guards/section-permission.guard';
import { Section } from '../../../common/decorators/section.decorator';
import { PermissionsService } from '../../permissions/permissions.service';
import { Actor, EntregasService } from './entregas.service';
import {
  CreateEntregaDto,
  CreateSolicitudDto,
  EntregarDto,
  RechazarEntregaDto,
  SaveCarpetaEntregasDto,
  UpdateEntregaDto,
} from './dto/entregas.dto';

const SECCION = 'CONTRATACION_PUBLICA';

/** Lo que deja JwtStrategy.validate() en la petición. */
interface AuthedRequest {
  user: { userId: number; email: string; role: string; companyId: number };
}

/**
 * Entregas de documentos de otras áreas. Las personas de otras áreas entran con
 * "ver"; lo que cada una puede tocar lo decide el servicio (solo sus
 * documentos), no la sección. Aprobar, rechazar y armar la solicitud piden "escribir".
 */
@Controller('contratacion-publica/entregas')
@UseGuards(AuthGuard('jwt'), SectionPermissionGuard)
export class EntregasController {
  constructor(
    private readonly service: EntregasService,
    private readonly permissions: PermissionsService,
  ) {}

  private async actor(req: AuthedRequest): Promise<Actor> {
    return {
      userId: req.user.userId,
      companyId: req.user.companyId,
      puedeEscribir: await this.permissions.hasSectionAccess(
        req.user,
        SECCION,
        'write',
      ),
    };
  }

  // --- carpeta de Drive donde se guardan los archivos ---

  @Get('carpeta')
  @Section(SECCION, 'view')
  obtenerCarpeta(@Req() req: AuthedRequest) {
    return this.service.obtenerCarpeta(req.user.companyId);
  }

  @Put('carpeta')
  @Section(SECCION, 'write')
  guardarCarpeta(
    @Body() dto: SaveCarpetaEntregasDto,
    @Req() req: AuthedRequest,
  ) {
    return this.service.guardarCarpeta(req.user.companyId, dto.driveFolderId);
  }

  // --- solicitudes mensuales ---

  @Get('entidades/:entidadId/solicitudes')
  @Section(SECCION, 'view')
  async listar(
    @Param('entidadId', ParseIntPipe) entidadId: number,
    @Req() req: AuthedRequest,
  ) {
    return this.service.listarSolicitudes(entidadId, await this.actor(req));
  }

  @Post('entidades/:entidadId/solicitudes')
  @Section(SECCION, 'write')
  async crear(
    @Param('entidadId', ParseIntPipe) entidadId: number,
    @Body() dto: CreateSolicitudDto,
    @Req() req: AuthedRequest,
  ) {
    return this.service.crearSolicitud(entidadId, dto, await this.actor(req));
  }

  @Get('solicitudes/:id')
  @Section(SECCION, 'view')
  async obtener(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: AuthedRequest,
  ) {
    return this.service.obtenerSolicitud(id, await this.actor(req));
  }

  @Delete('solicitudes/:id')
  @Section(SECCION, 'write')
  async eliminar(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: AuthedRequest,
  ) {
    return this.service.eliminarSolicitud(id, await this.actor(req));
  }

  @Post('solicitudes/:id/enviar')
  @Section(SECCION, 'write')
  async enviar(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: AuthedRequest,
  ) {
    return this.service.enviarSolicitud(id, await this.actor(req));
  }

  @Post('solicitudes/:id/documentos')
  @Section(SECCION, 'write')
  async agregarDocumento(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CreateEntregaDto,
    @Req() req: AuthedRequest,
  ) {
    return this.service.agregarEntrega(id, dto, await this.actor(req));
  }

  // --- documentos de una solicitud ---

  @Patch('documentos/:id')
  @Section(SECCION, 'write')
  async actualizarDocumento(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateEntregaDto,
    @Req() req: AuthedRequest,
  ) {
    return this.service.actualizarEntrega(id, dto, await this.actor(req));
  }

  @Delete('documentos/:id')
  @Section(SECCION, 'write')
  async eliminarDocumento(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: AuthedRequest,
  ) {
    return this.service.eliminarEntrega(id, await this.actor(req));
  }

  @Post('documentos/:id/archivo')
  @Section(SECCION, 'view')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 15 * 1024 * 1024 },
    }),
  )
  async subirArchivo(
    @Param('id', ParseIntPipe) id: number,
    @UploadedFile() file: Express.Multer.File,
    @Req() req: AuthedRequest,
  ) {
    if (!file) throw new BadRequestException('No se recibió ningún archivo.');
    return this.service.subirArchivo(id, file, await this.actor(req));
  }

  @Post('documentos/:id/entregar')
  @Section(SECCION, 'view')
  async entregar(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: EntregarDto,
    @Req() req: AuthedRequest,
  ) {
    return this.service.entregar(id, dto, await this.actor(req));
  }

  @Post('documentos/:id/aprobar')
  @Section(SECCION, 'write')
  async aprobar(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: AuthedRequest,
  ) {
    return this.service.aprobar(id, await this.actor(req));
  }

  @Post('documentos/:id/rechazar')
  @Section(SECCION, 'write')
  async rechazar(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: RechazarEntregaDto,
    @Req() req: AuthedRequest,
  ) {
    return this.service.rechazar(id, dto, await this.actor(req));
  }
}
