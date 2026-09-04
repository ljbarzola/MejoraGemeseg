import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  ParseIntPipe,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  Req,
  ForbiddenException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { FileInterceptor } from '@nestjs/platform-express';
import { FileFilterCallback } from 'multer';
import { Request } from 'express';
import { memoryStorage } from 'multer';
import { extname } from 'path';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '@prisma/client';
import { CompaniesService } from './companies.service';
import { CreateCompanyDto } from './dto/create-company.dto';
import { UpdateCompanyDto } from './dto/update-company.dto';

const logoStorage = memoryStorage();

const logoFilter = (
  _req: Request,
  file: Express.Multer.File,
  cb: FileFilterCallback,
) => {
  if (!file.mimetype.match(/\/(jpg|jpeg|png|gif|svg\+xml)$/)) {
    cb(new Error('Solo se permiten imágenes (jpg, png, gif, svg)'));
  } else {
    cb(null, true);
  }
};

@Controller('companies')
export class CompaniesController {
  constructor(private readonly companiesService: CompaniesService) {}

  @Get()
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.ADMIN)
  findAll(@Req() req: any) {
    if (req.user.companyId) {
      return this.companiesService.findOne(req.user.companyId);
    }
    return this.companiesService.findAll();
  }

  @Get('mine')
  @UseGuards(AuthGuard('jwt'))
  findMine(@Req() req: any) {
    if (!req.user.companyId) {
      return null;
    }
    return this.companiesService.findOne(req.user.companyId);
  }

  @Get('slug/:slug')
  findBySlug(@Param('slug') slug: string) {
    return this.companiesService.findBySlug(slug);
  }

  @Get(':id')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.ADMIN)
  findOne(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
    if (req.user.companyId && req.user.companyId !== id) {
      throw new ForbiddenException('No tienes acceso a esta empresa');
    }
    return this.companiesService.findOne(id);
  }

  @Post()
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.ADMIN)
  create(@Req() req: any, @Body() dto: CreateCompanyDto) {
    if (req.user.companyId) {
      throw new ForbiddenException(
        'Solo el super administrador puede crear empresas',
      );
    }
    return this.companiesService.create(dto);
  }

  @Patch(':id')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.ADMIN)
  update(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: any,
    @Body() dto: UpdateCompanyDto,
  ) {
    if (req.user.companyId && req.user.companyId !== id) {
      throw new ForbiddenException('Solo puedes editar tu propia empresa');
    }
    return this.companiesService.update(id, dto);
  }

  @Delete(':id')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.ADMIN)
  remove(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
    if (req.user.companyId) {
      throw new ForbiddenException(
        'Solo el super administrador puede eliminar empresas',
      );
    }
    return this.companiesService.remove(id);
  }

  @Post(':id/logo')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.ADMIN)
  @UseInterceptors(
    FileInterceptor('logo', {
      storage: logoStorage,
      fileFilter: logoFilter,
      limits: { fileSize: 2 * 1024 * 1024 },
    }),
  )
  uploadLogo(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: any,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (req.user.companyId && req.user.companyId !== id) {
      throw new ForbiddenException('Solo puedes cambiar el logo de tu empresa');
    }
    return this.companiesService.uploadLogo(id, file);
  }
}
