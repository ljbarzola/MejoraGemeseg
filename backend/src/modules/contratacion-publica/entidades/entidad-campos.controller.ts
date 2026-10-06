import {
  Body,
  Controller,
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
import { CPEntidadCamposService } from './entidad-campos.service';
import {
  CreateEntidadCampoDto,
  ReordenarCamposDto,
  UpdateEntidadCampoDto,
} from './dto/entidad-campo.dto';

@Controller('contratacion-publica/entidad-campos')
@UseGuards(AuthGuard('jwt'), SectionPermissionGuard)
export class CPEntidadCamposController {
  constructor(private readonly service: CPEntidadCamposService) {}

  @Get()
  @Section('CONTRATACION_PUBLICA', 'view')
  listar(@Req() req: any) {
    return this.service.listar(req.user.companyId);
  }

  @Post()
  @Section('CONTRATACION_PUBLICA', 'write')
  crear(@Body() dto: CreateEntidadCampoDto, @Req() req: any) {
    return this.service.crear(dto, req.user.companyId);
  }

  @Post('reordenar')
  @Section('CONTRATACION_PUBLICA', 'write')
  reordenar(@Body() dto: ReordenarCamposDto, @Req() req: any) {
    return this.service.reordenar(dto.ids, req.user.companyId);
  }

  @Patch(':id')
  @Section('CONTRATACION_PUBLICA', 'write')
  actualizar(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateEntidadCampoDto,
    @Req() req: any,
  ) {
    return this.service.actualizar(id, dto, req.user.companyId);
  }
}
