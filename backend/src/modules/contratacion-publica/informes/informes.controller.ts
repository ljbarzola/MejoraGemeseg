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
import { memoryStorage } from 'multer';
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

  // Varias plantillas Word por empresa (marcadores como [Entidad], [PeriodoDel]…); cada informe elige una.
  @Get('plantillas')
  @Section('CONTRATACION_PUBLICA', 'view')
  listarPlantillas(@Req() req: any) {
    return this.service.listarPlantillas(req.user.companyId);
  }

  @Post('plantillas')
  @Section('CONTRATACION_PUBLICA', 'write')
  @UseInterceptors(FileInterceptor('archivo', { storage: memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } }))
  crearPlantilla(@UploadedFile() archivo: Express.Multer.File, @Body('nombre') nombre: string | undefined, @Req() req: any) {
    return this.service.crearPlantilla(req.user.companyId, nombre, archivo?.buffer, archivo?.originalname);
  }

  @Put('plantillas/:id')
  @Section('CONTRATACION_PUBLICA', 'write')
  @UseInterceptors(FileInterceptor('archivo', { storage: memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } }))
  actualizarPlantilla(
    @Param('id', ParseIntPipe) id: number,
    @UploadedFile() archivo: Express.Multer.File | undefined,
    @Body('nombre') nombre: string | undefined,
    @Req() req: any,
  ) {
    return this.service.actualizarPlantilla(id, req.user.companyId, nombre, archivo?.buffer, archivo?.originalname);
  }

  @Delete('plantillas/:id')
  @Section('CONTRATACION_PUBLICA', 'write')
  eliminarPlantilla(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
    return this.service.eliminarPlantilla(id, req.user.companyId);
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

  /** El informe armado en Word, editable (la persona lo revisa, lo ajusta y lo firma). */
  @Get(':id/docx')
  @Section('CONTRATACION_PUBLICA', 'view')
  async descargarDocx(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: any,
    @Res() res: Response,
  ) {
    const { buffer, nombre } = await this.service.generarDocx(id, req.user.companyId);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', `attachment; filename="${nombre}"`);
    res.end(buffer);
  }

  @Post(':id/generar-pdf')
  @Section('CONTRATACION_PUBLICA', 'write')
  generarPdf(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
    return this.service.generarPdf(id, req.user.companyId);
  }
}
