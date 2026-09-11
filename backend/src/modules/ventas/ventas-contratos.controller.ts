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
  Res,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { VentasContratosService } from './ventas-contratos.service';
import type { Response } from 'express';
import * as fs from 'fs';
import * as path from 'path';

const CONTRACTS_DIR = path.resolve(process.cwd(), 'uploads', 'contracts');

@Controller('ventas/contratos')
export class VentasContratosController {
  constructor(private readonly contratosService: VentasContratosService) {}

  @Get('file/:fileName')
  @UseGuards(AuthGuard('jwt'))
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

  @Get()
  @UseGuards(AuthGuard('jwt'))
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
  @UseGuards(AuthGuard('jwt'))
  create(@Req() req: any, @Body() body: any) {
    return this.contratosService.createContract(
      req.user.companyId,
      req.user.userId,
      body,
    );
  }

  @Get(':id')
  @UseGuards(AuthGuard('jwt'))
  get(@Param('id') id: string, @Req() req: any) {
    return this.contratosService.getContract(+id, req.user.companyId);
  }

  @Patch(':id')
  @UseGuards(AuthGuard('jwt'))
  update(@Param('id') id: string, @Req() req: any, @Body() body: any) {
    return this.contratosService.updateContract(+id, req.user.companyId, body);
  }

  @Post(':id/generate')
  @UseGuards(AuthGuard('jwt'))
  generate(@Param('id') id: string, @Req() req: any) {
    return this.contratosService.generatePdf(+id, req.user.companyId);
  }

  @Get(':id/documents')
  @UseGuards(AuthGuard('jwt'))
  listDocuments(@Param('id') id: string, @Req() req: any) {
    return this.contratosService.listContractDocuments(+id, req.user.companyId);
  }

  @Post(':id/send')
  @UseGuards(AuthGuard('jwt'))
  send(@Param('id') id: string, @Req() req: any) {
    return this.contratosService.sendContract(+id, req.user.companyId);
  }

  @Delete(':id')
  @UseGuards(AuthGuard('jwt'))
  delete(@Param('id') id: string, @Req() req: any) {
    return this.contratosService.deleteContract(+id, req.user.companyId);
  }
}
