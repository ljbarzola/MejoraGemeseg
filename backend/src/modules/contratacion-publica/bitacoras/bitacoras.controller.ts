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
  Query,
  Req,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { AuthGuard } from '@nestjs/passport';
import type { Response } from 'express';
import { memoryStorage } from 'multer';
import { SectionPermissionGuard } from '../../../common/guards/section-permission.guard';
import { Section } from '../../../common/decorators/section.decorator';
import { PrismaService } from '../../../prisma/prisma.service';
import { ActorBitacora, BitacorasService } from './bitacoras.service';
import {
  ActualizarHallazgoDto,
  DashboardBitacorasQueryDto,
  GuardarLecturaDto,
  ListarBitacorasQueryDto,
  SubirBitacoraDto,
} from './dto/bitacoras.dto';

const SECCION = 'CONTRATACION_PUBLICA';

interface AuthedRequest {
  user: { userId: number; email: string; role: string; companyId: number };
}

/**
 * Bitácoras de guardianía: foto de la hoja → el agente revisor la lee → el
 * sistema la compara con el horario del puesto. Ver bitacoras.service.ts.
 * Ver = listar, abrir y mirar el resumen; escribir = subir, corregir lo leído,
 * resolver hallazgos y borrar.
 */
@Controller('contratacion-publica/bitacoras')
@UseGuards(AuthGuard('jwt'), SectionPermissionGuard)
export class BitacorasController {
  constructor(
    private readonly service: BitacorasService,
    private readonly prisma: PrismaService,
  ) {}

  private async actor(req: AuthedRequest): Promise<ActorBitacora> {
    const u = await this.prisma.user.findUnique({
      where: { id: req.user.userId },
      select: { fullName: true },
    });
    return {
      userId: req.user.userId,
      companyId: req.user.companyId,
      nombre: u?.fullName ?? req.user.email,
    };
  }

  @Get('opciones')
  @Section(SECCION, 'view')
  opciones(@Req() req: AuthedRequest) {
    return this.service.opcionesParaSubir(req.user.companyId);
  }

  @Get('agente')
  @Section(SECCION, 'view')
  agente() {
    return this.service.estadoDelAgente();
  }

  @Get('dashboard')
  @Section(SECCION, 'view')
  dashboard(@Query() q: DashboardBitacorasQueryDto, @Req() req: AuthedRequest) {
    return this.service.dashboard(req.user.companyId, q);
  }

  @Get()
  @Section(SECCION, 'view')
  listar(@Query() q: ListarBitacorasQueryDto, @Req() req: AuthedRequest) {
    return this.service.listar(req.user.companyId, q);
  }

  // La lectura con IA tarda (unos segundos a medio minuto): la respuesta llega
  // cuando ya terminó, con la bitácora leída y comparada.
  @Post()
  @Section(SECCION, 'write')
  @UseInterceptors(
    FileInterceptor('archivo', {
      storage: memoryStorage(),
      limits: { fileSize: 25 * 1024 * 1024 },
    }),
  )
  async subir(
    @UploadedFile()
    archivo:
      { buffer: Buffer; mimetype: string; originalname: string } | undefined,
    @Body() dto: SubirBitacoraDto,
    @Req() req: AuthedRequest,
  ) {
    const puestoId = /^\d+$/.test(dto.puestoId)
      ? parseInt(dto.puestoId, 10)
      : NaN;
    if (!Number.isInteger(puestoId))
      throw new BadRequestException('Elige el puesto de la bitácora.');
    return this.service.subir(archivo, puestoId, await this.actor(req));
  }

  @Patch('hallazgos/:hallazgoId')
  @Section(SECCION, 'write')
  async hallazgo(
    @Param('hallazgoId', ParseIntPipe) hallazgoId: number,
    @Body() dto: ActualizarHallazgoDto,
    @Req() req: AuthedRequest,
  ) {
    return this.service.actualizarHallazgo(
      hallazgoId,
      dto,
      await this.actor(req),
    );
  }

  @Get(':id')
  @Section(SECCION, 'view')
  obtener(@Param('id', ParseIntPipe) id: number, @Req() req: AuthedRequest) {
    return this.service.obtener(id, req.user.companyId);
  }

  @Get(':id/archivo')
  @Section(SECCION, 'view')
  async archivo(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: AuthedRequest,
    @Res() res: Response,
  ) {
    const a = await this.service.archivo(id, req.user.companyId);
    res.setHeader('Content-Type', a.mime);
    res.setHeader(
      'Content-Disposition',
      `inline; filename="${encodeURIComponent(a.nombre)}"`,
    );
    res.setHeader('Cache-Control', 'private, max-age=300');
    res.send(a.buffer);
  }

  @Put(':id/lectura')
  @Section(SECCION, 'write')
  async guardarLectura(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: GuardarLecturaDto,
    @Req() req: AuthedRequest,
  ) {
    return this.service.guardarLectura(id, dto, await this.actor(req));
  }

  @Post(':id/releer')
  @Section(SECCION, 'write')
  async releer(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: AuthedRequest,
  ) {
    return this.service.releer(id, await this.actor(req));
  }

  @Delete(':id')
  @Section(SECCION, 'write')
  eliminar(@Param('id', ParseIntPipe) id: number, @Req() req: AuthedRequest) {
    return this.service.eliminar(id, req.user.companyId);
  }
}
