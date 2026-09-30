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
import { CPCodigosTurnoService } from './codigos-turno.service';
import { CreateCodigoTurnoDto } from './dto/create-codigo-turno.dto';
import { UpdateCodigoTurnoDto } from './dto/update-codigo-turno.dto';

@Controller('contratacion-publica/codigos-turno')
@UseGuards(AuthGuard('jwt'), SectionPermissionGuard)
export class CPCodigosTurnoController {
  constructor(private readonly service: CPCodigosTurnoService) {}

  @Get()
  @Section('CONTRATACION_PUBLICA', 'view')
  findAll(@Req() req: any) {
    return this.service.findAll(req.user.companyId);
  }

  @Post()
  @Section('CONTRATACION_PUBLICA', 'write')
  create(@Body() dto: CreateCodigoTurnoDto, @Req() req: any) {
    return this.service.create(dto, req.user.companyId);
  }

  @Patch(':id')
  @Section('CONTRATACION_PUBLICA', 'write')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateCodigoTurnoDto,
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
