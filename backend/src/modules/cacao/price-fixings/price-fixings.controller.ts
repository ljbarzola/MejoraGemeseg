import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { SectionPermissionGuard } from '../../../common/guards/section-permission.guard';
import { Section } from '../../../common/decorators/section.decorator';
import { Roles } from '../../../common/decorators/roles.decorator';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { UserRole } from '@prisma/client';
import { CacaoPriceFixingsService } from './price-fixings.service';
import { CreatePriceFixingDto } from './dto/create-price-fixing.dto';
import { UpdatePriceFixingDto } from './dto/update-price-fixing.dto';

@Controller('cacao/price-fixings')
export class CacaoPriceFixingsController {
  constructor(private readonly service: CacaoPriceFixingsService) {}

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
  create(@Body() dto: CreatePriceFixingDto, @Req() req: any) {
    return this.service.create(dto, req.user.companyId, req.user.userId);
  }

  @Patch(':id')
  @UseGuards(AuthGuard('jwt'), RolesGuard, SectionPermissionGuard)
  @Roles(UserRole.ADMIN)
  @Section('CACAO', 'write')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdatePriceFixingDto,
    @Req() req: any,
  ) {
    return this.service.update(id, dto, req.user.companyId);
  }
}
