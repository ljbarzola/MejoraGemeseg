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
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import type { Response } from 'express';
import { AuthGuard } from '@nestjs/passport';
import { SectionPermissionGuard } from '../../../common/guards/section-permission.guard';
import { Section } from '../../../common/decorators/section.decorator';
import { Roles } from '../../../common/decorators/roles.decorator';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { UserRole } from '@prisma/client';
import { CacaoSuppliersService, MAX_BYTES_DOCUMENTO } from './suppliers.service';
import { CreateSupplierDto } from './dto/create-supplier.dto';
import { UpdateSupplierDto } from './dto/update-supplier.dto';

@Controller('cacao/suppliers')
export class CacaoSuppliersController {
  constructor(private readonly service: CacaoSuppliersService) {}

  @Get()
  @UseGuards(AuthGuard('jwt'), SectionPermissionGuard)
  @Section('CACAO', 'view')
  findAll(@Req() req: any) {
    return this.service.findAll(req.user.companyId);
  }

  @Post()
  @UseGuards(AuthGuard('jwt'), RolesGuard, SectionPermissionGuard)
  @Roles(UserRole.ADMIN)
  @Section('CACAO', 'write')
  create(@Body() dto: CreateSupplierDto, @Req() req: any) {
    return this.service.create(dto, req.user.companyId);
  }

  @Patch(':id')
  @UseGuards(AuthGuard('jwt'), RolesGuard, SectionPermissionGuard)
  @Roles(UserRole.ADMIN)
  @Section('CACAO', 'write')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateSupplierDto,
    @Req() req: any,
  ) {
    return this.service.update(id, dto, req.user.companyId);
  }

  @Delete(':id')
  @UseGuards(AuthGuard('jwt'), RolesGuard, SectionPermissionGuard)
  @Roles(UserRole.ADMIN)
  @Section('CACAO', 'write')
  remove(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
    return this.service.remove(id, req.user.companyId);
  }

  // ─── Documentos adjuntos del proveedor ───

  @Get(':id/documents')
  @UseGuards(AuthGuard('jwt'), SectionPermissionGuard)
  @Section('CACAO', 'view')
  listDocuments(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
    return this.service.listarDocumentos(id, req.user.companyId);
  }

  @Post(':id/documents')
  @UseGuards(AuthGuard('jwt'), RolesGuard, SectionPermissionGuard)
  @Roles(UserRole.ADMIN)
  @Section('CACAO', 'write')
  @UseInterceptors(
    FileInterceptor('archivo', {
      storage: memoryStorage(),
      limits: { fileSize: MAX_BYTES_DOCUMENTO },
    }),
  )
  uploadDocument(
    @Param('id', ParseIntPipe) id: number,
    @UploadedFile()
    archivo:
      | { buffer: Buffer; mimetype: string; originalname: string }
      | undefined,
    @Body('nombre') nombre: string | undefined,
    @Req() req: any,
  ) {
    return this.service.subirDocumento(
      id,
      req.user.companyId,
      req.user.userId,
      archivo,
      nombre,
    );
  }

  @Get('documents/:docId/archivo')
  @UseGuards(AuthGuard('jwt'), SectionPermissionGuard)
  @Section('CACAO', 'view')
  async downloadDocument(
    @Param('docId', ParseIntPipe) docId: number,
    @Req() req: any,
    @Res() res: Response,
  ) {
    const a = await this.service.descargarDocumento(docId, req.user.companyId);
    res.setHeader('Content-Type', a.mime);
    res.setHeader(
      'Content-Disposition',
      `inline; filename="${encodeURIComponent(a.nombre)}"`,
    );
    // Papeles de identidad: el navegador no los guarda, así que uno borrado deja de verse al instante.
    res.setHeader('Cache-Control', 'private, no-store');
    res.send(a.buffer);
  }

  @Delete('documents/:docId')
  @UseGuards(AuthGuard('jwt'), RolesGuard, SectionPermissionGuard)
  @Roles(UserRole.ADMIN)
  @Section('CACAO', 'write')
  removeDocument(
    @Param('docId', ParseIntPipe) docId: number,
    @Req() req: any,
  ) {
    return this.service.eliminarDocumento(docId, req.user.companyId);
  }
}
