import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import type { Response } from 'express';
import * as path from 'path';
import { SectionPermissionGuard } from '../../../common/guards/section-permission.guard';
import { Section } from '../../../common/decorators/section.decorator';
import { CPInformesService, CP_INFORMES_DIR } from './informes.service';
import { CreateInformeDto } from './dto/create-informe.dto';
import { UpdateInformeDto } from './dto/update-informe.dto';
import { UpdatePlantillaDto } from './dto/update-plantilla.dto';

@Controller('contratacion-publica/informes')
@UseGuards(AuthGuard('jwt'), SectionPermissionGuard)
export class CPInformesController {
  constructor(private readonly service: CPInformesService) {}

  @Get('plantilla')
  @Section('CONTRATACION_PUBLICA', 'view')
  getPlantilla(@Req() req: any) {
    return this.service.getPlantilla(req.user.companyId);
  }

  @Post('plantilla')
  @Section('CONTRATACION_PUBLICA', 'write')
  upsertPlantilla(@Body() dto: UpdatePlantillaDto, @Req() req: any) {
    return this.service.upsertPlantilla(dto, req.user.companyId);
  }

  @Get('file/:fileName')
  @Section('CONTRATACION_PUBLICA', 'view')
  async getFile(
    @Param('fileName') fileName: string,
    @Req() req: any,
    @Res() res: Response,
  ) {
    const safeName = await this.service.getInformeFileName(
      fileName,
      req.user.companyId,
    );
    res.sendFile(path.join(CP_INFORMES_DIR, safeName));
  }

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

  @Get(':id/datos-autogenerados')
  @Section('CONTRATACION_PUBLICA', 'view')
  getDatosAutogenerados(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: any,
  ) {
    return this.service.getDatosAutogenerados(id, req.user.companyId);
  }

  @Post()
  @Section('CONTRATACION_PUBLICA', 'write')
  create(@Body() dto: CreateInformeDto, @Req() req: any) {
    return this.service.create(dto, req.user.companyId, req.user.userId);
  }

  @Patch(':id')
  @Section('CONTRATACION_PUBLICA', 'write')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateInformeDto,
    @Req() req: any,
  ) {
    return this.service.update(id, dto, req.user.companyId);
  }

  @Delete(':id')
  @Section('CONTRATACION_PUBLICA', 'write')
  remove(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
    return this.service.remove(id, req.user.companyId);
  }

  @Post(':id/generar-pdf')
  @Section('CONTRATACION_PUBLICA', 'write')
  generarPdf(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
    return this.service.generarPdf(id, req.user.companyId);
  }
}
