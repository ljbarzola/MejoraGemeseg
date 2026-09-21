import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Patch,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { SectionPermissionGuard } from '../../../common/guards/section-permission.guard';
import { Section } from '../../../common/decorators/section.decorator';
import { Roles } from '../../../common/decorators/roles.decorator';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { UserRole } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';

@Controller('cacao/qualities')
export class CacaoQualitiesController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @UseGuards(AuthGuard('jwt'), SectionPermissionGuard)
  @Section('CACAO', 'view')
  findAll() {
    return this.prisma.cacaoQuality.findMany({ orderBy: { name: 'asc' } });
  }

  @Post()
  @UseGuards(AuthGuard('jwt'), RolesGuard, SectionPermissionGuard)
  @Roles(UserRole.ADMIN)
  @Section('CACAO', 'write')
  create(
    @Body()
    dto: {
      name: string;
      humidityDiscount?: number;
      impurityDiscount?: number;
      isFixedPrice?: boolean;
    },
  ) {
    return this.prisma.cacaoQuality.create({ data: dto });
  }

  @Patch(':id')
  @UseGuards(AuthGuard('jwt'), RolesGuard, SectionPermissionGuard)
  @Roles(UserRole.ADMIN)
  @Section('CACAO', 'write')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body()
    dto: {
      name?: string;
      humidityDiscount?: number;
      impurityDiscount?: number;
      isFixedPrice?: boolean;
    },
  ) {
    return this.prisma.cacaoQuality.update({ where: { id }, data: dto });
  }

  @Delete(':id')
  @UseGuards(AuthGuard('jwt'), RolesGuard, SectionPermissionGuard)
  @Roles(UserRole.ADMIN)
  @Section('CACAO', 'write')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.prisma.cacaoQuality.delete({ where: { id } });
  }
}
