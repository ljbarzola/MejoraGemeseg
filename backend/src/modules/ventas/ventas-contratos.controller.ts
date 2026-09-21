import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  Req,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  Res,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { SectionPermissionGuard } from '../../common/guards/section-permission.guard';
import { Section } from '../../common/decorators/section.decorator';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { VentasContratosService } from './ventas-contratos.service';
import type { Response } from 'express';
import * as fs from 'fs';
import * as path from 'path';

const CONTRACTS_DIR = path.resolve(process.cwd(), 'uploads', 'contracts');

@Controller('ventas/contratos')
export class VentasContratosController {
  constructor(private readonly contratosService: VentasContratosService) {}

  @Get('file/:fileName')
  @UseGuards(AuthGuard('jwt'), SectionPermissionGuard)
  @Section('VENTAS', 'view')
  async serveFile(
    @Param('fileName') fileName: string,
    @Req() req: any,
    @Res() res: Response,
  ) {
    const safeName = await this.contratosService.getContractForFile(
      fileName,
      req.user.companyId,
    );
    const filePath = path.join(CONTRACTS_DIR, safeName);
    if (!fs.existsSync(filePath)) {
      res.status(404).json({ message: 'Archivo no encontrado' });
      return;
    }
    res.setHeader('Content-Type', 'application/pdf');
    res.sendFile(filePath);
  }

  // Público, sin sesión — protegido solo por lo impredecible del token.
  // Debe declararse antes de `:id` para no chocar con esa ruta.
  @Get('public/:token')
  getPublicFill(@Param('token') token: string) {
    return this.contratosService.getPublicContractForFill(token);
  }

  @Post('public/:token/submit')
  submitPublicFill(@Param('token') token: string, @Body() body: any) {
    return this.contratosService.submitPublicFill(token, body?.values || {});
  }

  @Get()
  @UseGuards(AuthGuard('jwt'), SectionPermissionGuard)
  @Section('VENTAS', 'view')
  list(
    @Req() req: any,
    @Query('status') status?: string,
    @Query('templateId') templateId?: string,
  ) {
    return this.contratosService.listContracts(req.user.companyId, {
      status,
      templateId: templateId ? +templateId : undefined,
    });
  }

  @Post()
  @UseGuards(AuthGuard('jwt'), SectionPermissionGuard)
  @Section('VENTAS', 'write')
  create(@Req() req: any, @Body() body: any) {
    return this.contratosService.createContract(
      req.user.companyId,
      req.user.userId,
      body,
    );
  }

  @Get(':id')
  @UseGuards(AuthGuard('jwt'), SectionPermissionGuard)
  @Section('VENTAS', 'view')
  get(@Param('id') id: string, @Req() req: any) {
    return this.contratosService.getContract(+id, req.user.companyId);
  }

  @Patch(':id')
  @UseGuards(AuthGuard('jwt'), SectionPermissionGuard)
  @Section('VENTAS', 'write')
  update(@Param('id') id: string, @Req() req: any, @Body() body: any) {
    return this.contratosService.updateContract(+id, req.user.companyId, body);
  }

  @Post(':id/generate')
  @UseGuards(AuthGuard('jwt'), SectionPermissionGuard)
  @Section('VENTAS', 'write')
  generate(@Param('id') id: string, @Req() req: any) {
    return this.contratosService.generatePdf(+id, req.user.companyId);
  }

  @Get(':id/documents')
  @UseGuards(AuthGuard('jwt'), SectionPermissionGuard)
  @Section('VENTAS', 'view')
  listDocuments(@Param('id') id: string, @Req() req: any) {
    return this.contratosService.listContractDocuments(+id, req.user.companyId);
  }

  @Post(':id/send')
  @UseGuards(AuthGuard('jwt'), SectionPermissionGuard)
  @Section('VENTAS', 'write')
  send(@Param('id') id: string, @Req() req: any) {
    return this.contratosService.sendContract(+id, req.user.companyId);
  }

  @Get(':id/signature-status')
  @UseGuards(AuthGuard('jwt'), SectionPermissionGuard)
  @Section('VENTAS', 'view')
  signatureStatus(@Param('id') id: string, @Req() req: any) {
    return this.contratosService.getSignatureStatus(+id, req.user.companyId);
  }

  // Sube manualmente el PDF ya firmado — respaldo para cuando el webhook de
  // SignWell (POST /ventas/webhook/signwell) no está configurado en este
  // entorno, o el documento se firmó fuera del sistema.
  @Post(':id/documents/signed')
  @UseGuards(AuthGuard('jwt'), SectionPermissionGuard)
  @Section('VENTAS', 'write')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 10 * 1024 * 1024 },
    }),
  )
  uploadSigned(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
    @Req() req: any,
  ) {
    return this.contratosService.uploadSignedDocument(
      +id,
      req.user.companyId,
      file,
    );
  }

  @Delete(':id')
  @UseGuards(AuthGuard('jwt'), SectionPermissionGuard)
  @Section('VENTAS', 'write')
  delete(@Param('id') id: string, @Req() req: any) {
    return this.contratosService.deleteContract(+id, req.user.companyId);
  }
}
