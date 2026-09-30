import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { SectionPermissionGuard } from '../../../common/guards/section-permission.guard';
import { Section } from '../../../common/decorators/section.decorator';
import { CPEntidadesService } from './entidades.service';
import { CreateEntidadDto } from './dto/create-entidad.dto';
import { UpdateEntidadDto } from './dto/update-entidad.dto';

@Controller('contratacion-publica/entidades')
@UseGuards(AuthGuard('jwt'), SectionPermissionGuard)
export class CPEntidadesController {
  constructor(private readonly service: CPEntidadesService) {}

  @Get()
  @Section('CONTRATACION_PUBLICA', 'view')
  findAll(@Req() req: any) {
    return this.service.findAll(req.user.companyId);
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

  @Delete(':id')
  @Section('CONTRATACION_PUBLICA', 'write')
  remove(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
    return this.service.remove(id, req.user.companyId);
  }
}
