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
import { CacaoReceptionsService } from './receptions.service';
import { CreateReceptionDto } from './dto/create-reception.dto';
import { CloseReceptionDto } from './dto/close-reception.dto';
import { ReasonDto } from '../common/reason.dto';

@Controller('cacao/receptions')
export class CacaoReceptionsController {
  constructor(private readonly service: CacaoReceptionsService) {}

  @Get()
  @UseGuards(AuthGuard('jwt'), SectionPermissionGuard)
  @Section('CACAO', 'view')
  findAll(
    @Req() req: any,
    @Query()
    query: {
      supplierId?: string;
      puntoId?: string;
      from?: string;
      to?: string;
    },
  ) {
    return this.service.findAll(req.user.companyId, query);
  }

  @Get('qualities')
  @UseGuards(AuthGuard('jwt'), SectionPermissionGuard)
  @Section('CACAO', 'view')
  findQualities(@Req() req: any) {
    return this.service.findQualities(req.user.companyId);
  }

  @Post()
  @UseGuards(AuthGuard('jwt'), RolesGuard, SectionPermissionGuard)
  @Roles(UserRole.ADMIN)
  @Section('CACAO', 'write')
  create(@Body() dto: CreateReceptionDto, @Req() req: any) {
    return this.service.create(dto, req.user.companyId, req.user.userId);
  }

  /** Cierra una entrega sin liquidarla, con motivo (gerente o administrador). */
  @Post(':id/close')
  @UseGuards(AuthGuard('jwt'), RolesGuard, SectionPermissionGuard)
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  @Section('CACAO', 'write')
  close(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CloseReceptionDto,
    @Req() req: any,
  ) {
    return this.service.close(
      id,
      req.user.companyId,
      req.user.userId,
      dto.reason,
    );
  }

  /** Vuelve a abrir una entrega cerrada. */
  @Post(':id/reopen')
  @UseGuards(AuthGuard('jwt'), RolesGuard, SectionPermissionGuard)
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  @Section('CACAO', 'write')
  reopen(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
    return this.service.reopen(id, req.user.companyId);
  }

  /** Anula una recepción mal registrada, con motivo (solo administrador). */
  @Post(':id/void')
  @UseGuards(AuthGuard('jwt'), RolesGuard, SectionPermissionGuard)
  @Roles(UserRole.ADMIN)
  @Section('CACAO', 'write')
  voidReception(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ReasonDto,
    @Req() req: any,
  ) {
    return this.service.void(
      id,
      req.user.companyId,
      req.user.userId,
      dto.reason,
    );
  }
}
