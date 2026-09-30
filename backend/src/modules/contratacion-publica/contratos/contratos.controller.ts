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
  UseInterceptors,
  UploadedFile,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import type { Response } from 'express';
import * as path from 'path';
import { SectionPermissionGuard } from '../../../common/guards/section-permission.guard';
import { Section } from '../../../common/decorators/section.decorator';
import { CPContratosService, CP_ADJUNTOS_DIR } from './contratos.service';
import { CreateContratoDto } from './dto/create-contrato.dto';
import { UpdateContratoDto } from './dto/update-contrato.dto';
import { CreateAdendaDto } from './dto/create-adenda.dto';
import { RenovarContratoDto } from './dto/renovar-contrato.dto';

@Controller('contratacion-publica/contratos')
@UseGuards(AuthGuard('jwt'), SectionPermissionGuard)
export class CPContratosController {
  constructor(private readonly service: CPContratosService) {}

  @Get()
  @Section('CONTRATACION_PUBLICA', 'view')
  findAll(
    @Req() req: any,
    @Query('estado') estado?: string,
    @Query('entidadId') entidadId?: string,
  ) {
    return this.service.findAll(req.user.companyId, {
      estado,
      entidadId: entidadId ? +entidadId : undefined,
    });
  }

  @Get('file/:fileName')
  @Section('CONTRATACION_PUBLICA', 'view')
  async getFile(
    @Param('fileName') fileName: string,
    @Req() req: any,
    @Res() res: Response,
  ) {
    const safeName = await this.service.getAdjuntoFileName(
      fileName,
      req.user.companyId,
    );
    res.sendFile(path.join(CP_ADJUNTOS_DIR, safeName));
  }

  @Get(':id')
  @Section('CONTRATACION_PUBLICA', 'view')
  findOne(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
    return this.service.findOne(id, req.user.companyId);
  }

  @Post()
  @Section('CONTRATACION_PUBLICA', 'write')
  create(@Body() dto: CreateContratoDto, @Req() req: any) {
    return this.service.create(dto, req.user.companyId, req.user.userId);
  }

  @Patch(':id')
  @Section('CONTRATACION_PUBLICA', 'write')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateContratoDto,
    @Req() req: any,
  ) {
    return this.service.update(id, dto, req.user.companyId);
  }

  @Delete(':id')
  @Section('CONTRATACION_PUBLICA', 'write')
  remove(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
    return this.service.remove(id, req.user.companyId);
  }

  @Post(':id/renovar')
  @Section('CONTRATACION_PUBLICA', 'write')
  renovar(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: RenovarContratoDto,
    @Req() req: any,
  ) {
    return this.service.renovar(id, dto, req.user.companyId, req.user.userId);
  }

  @Post(':id/adendas')
  @Section('CONTRATACION_PUBLICA', 'write')
  addAdenda(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CreateAdendaDto,
    @Req() req: any,
  ) {
    return this.service.addAdenda(id, dto, req.user.companyId);
  }

  @Delete(':id/adendas/:adendaId')
  @Section('CONTRATACION_PUBLICA', 'write')
  removeAdenda(
    @Param('id', ParseIntPipe) id: number,
    @Param('adendaId', ParseIntPipe) adendaId: number,
    @Req() req: any,
  ) {
    return this.service.removeAdenda(id, adendaId, req.user.companyId);
  }

  @Post(':id/adjuntos')
  @Section('CONTRATACION_PUBLICA', 'write')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 15 * 1024 * 1024 },
    }),
  )
  addAdjunto(
    @Param('id', ParseIntPipe) id: number,
    @UploadedFile() file: Express.Multer.File,
    @Body('tipo') tipo: string,
    @Req() req: any,
  ) {
    return this.service.addAdjunto(id, req.user.companyId, file, tipo);
  }

  @Delete(':id/adjuntos/:adjuntoId')
  @Section('CONTRATACION_PUBLICA', 'write')
  removeAdjunto(
    @Param('id', ParseIntPipe) id: number,
    @Param('adjuntoId', ParseIntPipe) adjuntoId: number,
    @Req() req: any,
  ) {
    return this.service.removeAdjunto(id, adjuntoId, req.user.companyId);
  }
}
