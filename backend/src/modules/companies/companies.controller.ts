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
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '@prisma/client';
import { CompaniesService } from './companies.service';
import { CreateCompanyDto } from './dto/create-company.dto';
import { UpdateCompanyDto } from './dto/update-company.dto';

const logoStorage = diskStorage({
  destination: join(__dirname, '..', '..', '..', 'uploads', 'logos'),
  filename: (_req, file, cb) => {
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `company-${uniqueSuffix}${extname(file.originalname)}`);
  },
});

const logoFilter = (_req: any, file: any, cb: any) => {
  if (!file.mimetype.match(/\/(jpg|jpeg|png|gif|svg\+xml)$/)) {
    cb(new Error('Solo se permiten imágenes (jpg, png, gif, svg)'), false);
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
      throw new ForbiddenException('Solo el super administrador puede crear empresas');
    }
    return this.companiesService.create(dto);
  }

  @Patch(':id')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.ADMIN)
  update(@Param('id', ParseIntPipe) id: number, @Req() req: any, @Body() dto: UpdateCompanyDto) {
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
      throw new ForbiddenException('Solo el super administrador puede eliminar empresas');
    }
    return this.companiesService.remove(id);
  }

  @Post(':id/logo')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.ADMIN)
  @UseInterceptors(FileInterceptor('logo', {
    storage: logoStorage,
    fileFilter: logoFilter,
    limits: { fileSize: 2 * 1024 * 1024 },
  }))
  uploadLogo(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: any,
    @UploadedFile() file: { filename: string; mimetype: string; size: number },
  ) {
    if (req.user.companyId && req.user.companyId !== id) {
      throw new ForbiddenException('Solo puedes cambiar el logo de tu empresa');
    }
    return this.companiesService.uploadLogo(id, file.filename);
  }
}
