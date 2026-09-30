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
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { SectionPermissionGuard } from '../../../common/guards/section-permission.guard';
import { Section } from '../../../common/decorators/section.decorator';
import { CPPuestosService } from './puestos.service';
import { CreatePuestoDto } from './dto/create-puesto.dto';
import { UpdatePuestoDto } from './dto/update-puesto.dto';
import { AsignarGuardiaDto } from './dto/asignar-guardia.dto';
import { CPPatronRotacionService } from './patron-rotacion.service';
import {
  PatronRotacionConfigDto,
  PreviewPatronDto,
} from './dto/patron-rotacion.dto';

@Controller('contratacion-publica/puestos')
@UseGuards(AuthGuard('jwt'), SectionPermissionGuard)
export class CPPuestosController {
  constructor(
    private readonly service: CPPuestosService,
    private readonly patronRotacionService: CPPatronRotacionService,
  ) {}

  @Get()
  @Section('CONTRATACION_PUBLICA', 'view')
  findAllByContrato(
    @Query('contratoId', ParseIntPipe) contratoId: number,
    @Req() req: any,
  ) {
    return this.service.findAllByContrato(contratoId, req.user.companyId);
  }

  @Get(':id')
  @Section('CONTRATACION_PUBLICA', 'view')
  findOne(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
    return this.service.findOne(id, req.user.companyId);
  }

  @Post()
  @Section('CONTRATACION_PUBLICA', 'write')
  create(@Body() dto: CreatePuestoDto, @Req() req: any) {
    return this.service.create(dto, req.user.companyId);
  }

  @Patch(':id')
  @Section('CONTRATACION_PUBLICA', 'write')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdatePuestoDto,
    @Req() req: any,
  ) {
    return this.service.update(id, dto, req.user.companyId);
  }

  @Delete(':id')
  @Section('CONTRATACION_PUBLICA', 'write')
  remove(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
    return this.service.remove(id, req.user.companyId);
  }

  @Post(':id/guardias')
  @Section('CONTRATACION_PUBLICA', 'write')
  asignarGuardia(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AsignarGuardiaDto,
    @Req() req: any,
  ) {
    return this.service.asignarGuardia(id, dto, req.user.companyId);
  }

  @Delete(':id/guardias/:guardiaId')
  @Section('CONTRATACION_PUBLICA', 'write')
  removeGuardia(
    @Param('id', ParseIntPipe) id: number,
    @Param('guardiaId', ParseIntPipe) guardiaId: number,
    @Req() req: any,
  ) {
    return this.service.removeGuardia(id, guardiaId, req.user.companyId);
  }

  @Get(':id/patron-rotacion')
  @Section('CONTRATACION_PUBLICA', 'view')
  getPatronRotacion(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
    return this.patronRotacionService.getPatron(id, req.user.companyId);
  }

  @Put(':id/patron-rotacion')
  @Section('CONTRATACION_PUBLICA', 'write')
  guardarPatronRotacion(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: PatronRotacionConfigDto,
    @Req() req: any,
  ) {
    return this.patronRotacionService.guardarPatron(
      id,
      dto,
      req.user.companyId,
    );
  }

  @Post(':id/patron-rotacion/preview')
  @Section('CONTRATACION_PUBLICA', 'write')
  previewPatronRotacion(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: PreviewPatronDto,
    @Req() req: any,
  ) {
    return this.patronRotacionService.preview(id, dto, req.user.companyId);
  }
}
