import { Body, Controller, Delete, Get, Param, ParseIntPipe, Post, Patch, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Roles } from '../../../common/decorators/roles.decorator';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { UserRole } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';

@Controller('cacao/qualities')
export class CacaoQualitiesController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @UseGuards(AuthGuard('jwt'))
  findAll() {
    return this.prisma.cacaoQuality.findMany({ orderBy: { name: 'asc' } });
  }

  @Post()
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.ADMIN)
  create(@Body() dto: { name: string; humidityDiscount?: number; impurityDiscount?: number; isFixedPrice?: boolean }) {
    return this.prisma.cacaoQuality.create({ data: dto });
  }

  @Patch(':id')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.ADMIN)
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: { name?: string; humidityDiscount?: number; impurityDiscount?: number; isFixedPrice?: boolean }) {
    return this.prisma.cacaoQuality.update({ where: { id }, data: dto });
  }

  @Delete(':id')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.ADMIN)
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.prisma.cacaoQuality.delete({ where: { id } });
  }
}
