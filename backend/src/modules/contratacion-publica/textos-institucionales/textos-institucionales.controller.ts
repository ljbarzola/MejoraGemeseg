import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { SectionPermissionGuard } from '../../../common/guards/section-permission.guard';
import { Section } from '../../../common/decorators/section.decorator';
import { CPTextosInstitucionalesService } from './textos-institucionales.service';
import { UpsertTextoDto } from './dto/upsert-texto.dto';

@Controller('contratacion-publica/textos-institucionales')
@UseGuards(AuthGuard('jwt'), SectionPermissionGuard)
export class CPTextosInstitucionalesController {
  constructor(private readonly service: CPTextosInstitucionalesService) {}

  @Get()
  @Section('CONTRATACION_PUBLICA', 'view')
  findAll(@Req() req: any) {
    return this.service.findAll(req.user.companyId);
  }

  @Get(':clave')
  @Section('CONTRATACION_PUBLICA', 'view')
  findOne(@Param('clave') clave: string, @Req() req: any) {
    return this.service.findOne(clave, req.user.companyId);
  }

  @Post()
  @Section('CONTRATACION_PUBLICA', 'write')
  upsert(@Body() dto: UpsertTextoDto, @Req() req: any) {
    return this.service.upsert(dto, req.user.companyId);
  }

  @Delete(':clave')
  @Section('CONTRATACION_PUBLICA', 'write')
  remove(@Param('clave') clave: string, @Req() req: any) {
    return this.service.remove(clave, req.user.companyId);
  }
}
