import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { SectionPermissionGuard } from '../../../common/guards/section-permission.guard';
import { Section } from '../../../common/decorators/section.decorator';
import { CPEntidadesService } from './entidades.service';
import {
  CreateEntidadDto,
  CrearEntidadDesdeCarpetaDto,
} from './dto/create-entidad.dto';
import { UpdateEntidadDto } from './dto/update-entidad.dto';

@Controller('contratacion-publica/entidades')
@UseGuards(AuthGuard('jwt'), SectionPermissionGuard)
export class CPEntidadesController {
  constructor(private readonly service: CPEntidadesService) {}

  // `?archivadas=true` incluye las archivadas (checkbox "Mostrar archivadas").
  @Get()
  @Section('CONTRATACION_PUBLICA', 'view')
  findAll(@Req() req: any, @Query('archivadas') archivadas?: string) {
    return this.service.findAll(req.user.companyId, archivadas === 'true');
  }

  // Compara la lista de entidades con la carpeta de Drive y devuelve las
  // diferencias; no crea nada (solo enlaza por nombre exacto), pero escribe en
  // la base, por eso pide "write".
  @Post('sincronizar-drive')
  @Section('CONTRATACION_PUBLICA', 'write')
  sincronizarDrive(@Req() req: any) {
    return this.service.sincronizarConDrive(req.user.companyId);
  }

  @Post('desde-carpeta')
  @Section('CONTRATACION_PUBLICA', 'write')
  crearDesdeCarpeta(@Body() dto: CrearEntidadDesdeCarpetaDto, @Req() req: any) {
    return this.service.crearEntidadDesdeCarpeta(dto.folderId, req.user.companyId);
  }

  @Post(':id/drive/crear-carpeta')
  @Section('CONTRATACION_PUBLICA', 'write')
  crearCarpeta(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
    return this.service.crearCarpeta(id, req.user.companyId);
  }

  @Post(':id/archivar')
  @Section('CONTRATACION_PUBLICA', 'write')
  archivar(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
    return this.service.archivar(id, req.user.companyId);
  }

  @Post(':id/reactivar')
  @Section('CONTRATACION_PUBLICA', 'write')
  reactivar(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
    return this.service.reactivar(id, req.user.companyId);
  }

  @Post(':id/drive/usar-nombre-de-drive')
  @Section('CONTRATACION_PUBLICA', 'write')
  usarNombreDeDrive(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
    return this.service.usarNombreDeDrive(id, req.user.companyId);
  }

  @Post(':id/drive/usar-nombre-del-sistema')
  @Section('CONTRATACION_PUBLICA', 'write')
  usarNombreDelSistema(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: any,
  ) {
    return this.service.usarNombreDelSistema(id, req.user.companyId);
  }

  @Post(':id/drive/recrear-carpeta')
  @Section('CONTRATACION_PUBLICA', 'write')
  recrearCarpeta(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
    return this.service.recrearCarpeta(id, req.user.companyId);
  }

  @Get(':id')
  @Section('CONTRATACION_PUBLICA', 'view')
  findOne(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
    return this.service.findOne(id, req.user.companyId);
  }

  @Post()
  @Section('CONTRATACION_PUBLICA', 'write')
  create(@Body() dto: CreateEntidadDto, @Req() req: any) {
    return this.service.create(dto, req.user.companyId);
  }

  @Patch(':id')
  @Section('CONTRATACION_PUBLICA', 'write')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateEntidadDto,
    @Req() req: any,
  ) {
    return this.service.update(id, dto, req.user.companyId);
  }
}
