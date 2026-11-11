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
import { UserRole } from '@prisma/client';
import { SectionPermissionGuard } from '../../../common/guards/section-permission.guard';
import { Section } from '../../../common/decorators/section.decorator';
import { Roles } from '../../../common/decorators/roles.decorator';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { VoidPaymentDto } from '../common/payment.dto';
import { CacaoSupplierAdvancesService } from './advances.service';
import { CreateAdvanceDto } from './dto/advance.dto';

@Controller('cacao/anticipos')
export class CacaoSupplierAdvancesController {
  constructor(private readonly service: CacaoSupplierAdvancesService) {}

  /** Movimientos y saldo de anticipos de un proveedor. */
  @Get()
  @UseGuards(AuthGuard('jwt'), SectionPermissionGuard)
  @Section('CACAO', 'view')
  list(@Query('supplierId', ParseIntPipe) supplierId: number, @Req() req: any) {
    return this.service.list(supplierId, req.user.companyId);
  }

  @Post()
  @UseGuards(AuthGuard('jwt'), RolesGuard, SectionPermissionGuard)
  @Roles(UserRole.ADMIN)
  @Section('CACAO', 'write')
  create(@Body() dto: CreateAdvanceDto, @Req() req: any) {
    return this.service.create(dto, req.user.companyId, req.user.userId);
  }

  @Post(':id/void')
  @UseGuards(AuthGuard('jwt'), RolesGuard, SectionPermissionGuard)
  @Roles(UserRole.ADMIN)
  @Section('CACAO', 'write')
  void(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: VoidPaymentDto,
    @Req() req: any,
  ) {
    return this.service.void(
      id,
      dto.reason,
      req.user.companyId,
      req.user.userId,
    );
  }
}
