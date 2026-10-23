import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { SectionPermissionGuard } from '../../../common/guards/section-permission.guard';
import { Section } from '../../../common/decorators/section.decorator';
import { Roles } from '../../../common/decorators/roles.decorator';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { UserRole } from '@prisma/client';
import { CacaoSettlementsService } from './settlements.service';
import { CreateSettlementDto } from './dto/create-settlement.dto';
import { SettlementDecisionDto } from './dto/decision.dto';

@Controller('cacao/settlements')
export class CacaoSettlementsController {
  constructor(private readonly service: CacaoSettlementsService) {}

  @Get()
  @UseGuards(AuthGuard('jwt'), SectionPermissionGuard)
  @Section('CACAO', 'view')
  findAll(@Req() req: any) {
    return this.service.findAll(req.user.companyId);
  }

  @Get('next-id')
  @UseGuards(AuthGuard('jwt'), SectionPermissionGuard)
  @Section('CACAO', 'view')
  nextId(@Req() req: any) {
    return this.service.getNextId(req.user.companyId);
  }

  @Get('available-lots')
  @UseGuards(AuthGuard('jwt'), SectionPermissionGuard)
  @Section('CACAO', 'view')
  availableLots(
    @Query('supplierId', ParseIntPipe) supplierId: number,
    @Req() req: any,
  ) {
    return this.service.getAvailableLots(supplierId, req.user.companyId);
  }

  @Get(':id')
  @UseGuards(AuthGuard('jwt'), SectionPermissionGuard)
  @Section('CACAO', 'view')
  findOne(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
    return this.service.findOne(id, req.user.companyId);
  }

  @Post()
  @UseGuards(AuthGuard('jwt'), RolesGuard, SectionPermissionGuard)
  @Roles(UserRole.ADMIN)
  @Section('CACAO', 'write')
  create(@Body() dto: CreateSettlementDto, @Req() req: any) {
    return this.service.create(dto, req.user.companyId, req.user.userId);
  }

  @Post(':id/approve')
  @UseGuards(AuthGuard('jwt'), RolesGuard, SectionPermissionGuard)
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  @Section('CACAO', 'write')
  approve(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
    return this.service.approve(id, req.user.companyId, req.user.userId);
  }

  @Post(':id/reject')
  @UseGuards(AuthGuard('jwt'), RolesGuard, SectionPermissionGuard)
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  @Section('CACAO', 'write')
  reject(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: SettlementDecisionDto,
    @Req() req: any,
  ) {
    return this.service.reject(
      id,
      req.user.companyId,
      req.user.userId,
      dto.reason,
    );
  }

  @Post(':id/cancel')
  @UseGuards(AuthGuard('jwt'), RolesGuard, SectionPermissionGuard)
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  @Section('CACAO', 'write')
  cancel(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: SettlementDecisionDto,
    @Req() req: any,
  ) {
    return this.service.cancel(
      id,
      req.user.companyId,
      req.user.userId,
      dto.reason,
    );
  }
}
