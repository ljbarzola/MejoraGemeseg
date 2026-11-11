import {
  BadRequestException,
  Body,
  Controller,
  Post,
  Query,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { AuthGuard } from '@nestjs/passport';
import { memoryStorage } from 'multer';
import { SectionPermissionGuard } from '../../../common/guards/section-permission.guard';
import { Section } from '../../../common/decorators/section.decorator';
import { ImportacionContratoService, type DatosImportacion } from './importacion-contrato.service';

const SUBIDA = { storage: memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } };

/** Asistente «Importar contrato desde Excel» (Operaciones → Contratos). */
@Controller('contratacion-publica/importacion')
@UseGuards(AuthGuard('jwt'), SectionPermissionGuard)
export class ImportacionContratoController {
  constructor(private readonly service: ImportacionContratoService) {}

  /** Lee el Excel y lista los puestos que trae; no guarda nada. */
  @Post('analizar')
  @Section('OPERACIONES', 'write')
  @UseInterceptors(FileInterceptor('archivo', SUBIDA))
  analizar(@UploadedFile() archivo: Express.Multer.File, @Query('hoja') hoja: string | undefined) {
    return this.service.analizar(archivo?.buffer, hoja || undefined);
  }

  /** Crea el contrato, los puestos con sus guardias y un horario en borrador con los turnos. */
  @Post('aplicar')
  @Section('OPERACIONES', 'write')
  @UseInterceptors(FileInterceptor('archivo', SUBIDA))
  aplicar(@UploadedFile() archivo: Express.Multer.File, @Body('datos') datos: string | undefined, @Req() req: any) {
    let parsed: DatosImportacion;
    try {
      parsed = JSON.parse(datos ?? '');
    } catch {
      throw new BadRequestException('Faltan los datos del contrato.');
    }
    return this.service.aplicar({ userId: req.user.userId, companyId: req.user.companyId }, archivo?.buffer, parsed);
  }
}
