import { Body, Controller, Get, Param, ParseIntPipe, Post, Query, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { SectionPermissionGuard } from '../../../common/guards/section-permission.guard';
import { Section } from '../../../common/decorators/section.decorator';
import { PrismaService } from '../../../prisma/prisma.service';
import { ActorAusencia, AusenciasService } from './ausencias.service';
import {
  AnularAusenciaDto,
  CrearAusenciaDto,
  CubrirAusenciaDto,
  ListarAusenciasQueryDto,
  SugerenciasAusenciaQueryDto,
} from './dto/ausencias.dto';

const SECCION = 'OPERACIONES';

interface AuthedRequest {
  user: { userId: number; email: string; role: string; companyId: number };
}

/**
 * Faltas de guardias registradas al momento («No llegó» desde Hoy en los puestos). Ver = listar y pedir
 * sugerencias de reemplazo; escribir = registrar, asignar quién cubre y anular.
 */
@Controller('contratacion-publica/ausencias')
@UseGuards(AuthGuard('jwt'), SectionPermissionGuard)
export class AusenciasController {
  constructor(
    private readonly service: AusenciasService,
    private readonly prisma: PrismaService,
  ) {}

  private async actor(req: AuthedRequest): Promise<ActorAusencia> {
    const u = await this.prisma.user.findUnique({ where: { id: req.user.userId }, select: { fullName: true } });
    return { userId: req.user.userId, companyId: req.user.companyId, nombre: u?.fullName ?? req.user.email };
  }

  @Get()
  @Section(SECCION, 'view')
  listar(@Req() req: AuthedRequest, @Query() q: ListarAusenciasQueryDto) {
    return this.service.listar(req.user.companyId, q);
  }

  @Get('sugerencias')
  @Section(SECCION, 'view')
  sugerencias(@Req() req: AuthedRequest, @Query() q: SugerenciasAusenciaQueryDto) {
    return this.service.sugerencias(req.user.companyId, q.puestoId, q.cedula, q.fecha);
  }

  @Post()
  @Section(SECCION, 'write')
  async crear(@Req() req: AuthedRequest, @Body() dto: CrearAusenciaDto) {
    return this.service.crear(await this.actor(req), dto);
  }

  @Post(':id/cubrir')
  @Section(SECCION, 'write')
  async cubrir(@Req() req: AuthedRequest, @Param('id', ParseIntPipe) id: number, @Body() dto: CubrirAusenciaDto) {
    return this.service.cubrir(await this.actor(req), id, dto);
  }

  @Post(':id/anular')
  @Section(SECCION, 'write')
  async anular(@Req() req: AuthedRequest, @Param('id', ParseIntPipe) id: number, @Body() dto: AnularAusenciaDto) {
    return this.service.anular(await this.actor(req), id, dto);
  }
}
