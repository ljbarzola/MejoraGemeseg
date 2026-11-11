import {
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
import { memoryStorage } from 'multer';
import type { Response } from 'express';
import { SectionPermissionGuard } from '../../../common/guards/section-permission.guard';
import { Section } from '../../../common/decorators/section.decorator';
import { PrismaService } from '../../../prisma/prisma.service';
import { ActorSupervision, SupervisionService } from './supervision.service';
import { SupervisionExcelService } from './supervision-excel.service';
import {
  CrearCronogramaDto,
  EditarPuntoDto,
  ListarVisitasQueryDto,
  RegistrarVisitaDto,
  ReemplazarDiasDto,
} from './dto/supervision.dto';

const SECCION = 'OPERACIONES';

interface AuthedRequest {
  user: { userId: number; email: string; role: string; companyId: number };
}

/**
 * Supervisión: el cronograma de visitas a los puntos de servicio (qué días se planea visitar cada puesto y
 * quién supervisa) y el registro de las visitas que se hicieron. Ver = consultar; escribir = armar el
 * cronograma y registrar visitas.
 */
@Controller('contratacion-publica/supervision')
@UseGuards(AuthGuard('jwt'), SectionPermissionGuard)
export class SupervisionController {
  constructor(
    private readonly service: SupervisionService,
    private readonly excel: SupervisionExcelService,
    private readonly prisma: PrismaService,
  ) {}

  private async actor(req: AuthedRequest): Promise<ActorSupervision> {
    const u = await this.prisma.user.findUnique({ where: { id: req.user.userId }, select: { fullName: true } });
    return { userId: req.user.userId, companyId: req.user.companyId, nombre: u?.fullName ?? req.user.email };
  }

  @Get('candidatos')
  @Section(SECCION, 'view')
  candidatos(@Req() req: AuthedRequest) {
    return this.service.candidatos(req.user.companyId);
  }

  @Get('cronogramas')
  @Section(SECCION, 'view')
  listar(@Req() req: AuthedRequest, @Query('contratoId') contratoId?: string) {
    const id = Number(contratoId);
    return this.service.listarCronogramas(req.user.companyId, Number.isInteger(id) && id > 0 ? id : undefined);
  }

  @Post('cronogramas')
  @Section(SECCION, 'write')
  async crear(@Req() req: AuthedRequest, @Body() dto: CrearCronogramaDto) {
    return this.service.crearCronograma(await this.actor(req), dto);
  }

  @Get('cronogramas/:id')
  @Section(SECCION, 'view')
  obtener(@Req() req: AuthedRequest, @Param('id', ParseIntPipe) id: number) {
    return this.service.obtener(id, req.user.companyId);
  }

  @Delete('cronogramas/:id')
  @Section(SECCION, 'write')
  eliminar(@Req() req: AuthedRequest, @Param('id', ParseIntPipe) id: number) {
    return this.service.eliminarCronograma(id, req.user.companyId);
  }

  @Patch('cronogramas/:id/puntos/:puntoId')
  @Section(SECCION, 'write')
  editarPunto(
    @Req() req: AuthedRequest,
    @Param('id', ParseIntPipe) id: number,
    @Param('puntoId', ParseIntPipe) puntoId: number,
    @Body() dto: EditarPuntoDto,
  ) {
    return this.service.editarPunto(id, puntoId, req.user.companyId, dto);
  }

  @Put('cronogramas/:id/puntos/:puntoId/dias')
  @Section(SECCION, 'write')
  reemplazarDias(
    @Req() req: AuthedRequest,
    @Param('id', ParseIntPipe) id: number,
    @Param('puntoId', ParseIntPipe) puntoId: number,
    @Body() dto: ReemplazarDiasDto,
  ) {
    return this.service.reemplazarDias(id, puntoId, req.user.companyId, dto.fechas);
  }

  @Get('cronogramas/:id/excel')
  @Section(SECCION, 'view')
  async descargarExcel(@Req() req: AuthedRequest, @Param('id', ParseIntPipe) id: number, @Res() res: Response) {
    const c = await this.service.obtener(id, req.user.companyId);
    const buffer = await this.excel.generar(c);
    const limpio = (t: string) =>
      t.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9-]+/g, '_').replace(/^_+|_+$/g, '');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="Cronograma_supervision_${limpio(c.contratoNumero)}_${c.fechaInicio}_${c.fechaFin}.xlsx"`);
    res.end(buffer);
  }

  @Get('mis-visitas-hoy')
  @Section(SECCION, 'view')
  async misVisitasHoy(@Req() req: AuthedRequest) {
    return this.service.misVisitasHoy(await this.actor(req));
  }

  @Get('sin-visita')
  @Section(SECCION, 'view')
  sinVisita(@Req() req: AuthedRequest, @Query('dias') dias?: string) {
    return this.service.sinVisita(req.user.companyId, Number(dias) || 7);
  }

  @Get('visitas')
  @Section(SECCION, 'view')
  listarVisitas(@Req() req: AuthedRequest, @Query() q: ListarVisitasQueryDto) {
    return this.service.listarVisitas(req.user.companyId, q);
  }

  @Post('visitas')
  @Section(SECCION, 'write')
  @UseInterceptors(FileInterceptor('foto', { storage: memoryStorage(), limits: { fileSize: 8 * 1024 * 1024 } }))
  async registrarVisita(
    @Req() req: AuthedRequest,
    @Body() dto: RegistrarVisitaDto,
    @UploadedFile() foto?: Express.Multer.File,
  ) {
    return this.service.registrarVisita(await this.actor(req), dto, foto);
  }

  @Get('visitas/:id/foto')
  @Section(SECCION, 'view')
  async foto(@Req() req: AuthedRequest, @Param('id', ParseIntPipe) id: number, @Res() res: Response) {
    const { buffer, tipo } = await this.service.fotoDeVisita(id, req.user.companyId);
    res.setHeader('Content-Type', tipo);
    res.setHeader('Cache-Control', 'private, max-age=3600');
    res.end(buffer);
  }

  @Delete('visitas/:id')
  @Section(SECCION, 'write')
  async eliminarVisita(@Req() req: AuthedRequest, @Param('id', ParseIntPipe) id: number) {
    return this.service.eliminarVisita(await this.actor(req), id);
  }
}
