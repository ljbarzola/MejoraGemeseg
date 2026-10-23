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
import { CacaoPayablesService } from './payables.service';
import { PaymentDto, VoidPaymentDto } from '../common/payment.dto';

@Controller('cacao/payables')
export class CacaoPayablesController {
  constructor(private readonly service: CacaoPayablesService) {}

  @Get()
  @UseGuards(AuthGuard('jwt'), SectionPermissionGuard)
  @Section('CACAO', 'view')
  findAll(@Req() req: any, @Query() query: { status?: string }) {
    return this.service.findAll(req.user.companyId, query);
  }

  @Post(':id/pay')
  @UseGuards(AuthGuard('jwt'), RolesGuard, SectionPermissionGuard)
  @Roles(UserRole.ADMIN)
  @Section('CACAO', 'write')
  pay(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: PaymentDto,
    @Req() req: any,
  ) {
    return this.service.pay(id, dto, req.user.companyId, req.user.userId);
  }

  @Post('payments/:paymentId/void')
  @UseGuards(AuthGuard('jwt'), RolesGuard, SectionPermissionGuard)
  @Roles(UserRole.ADMIN)
  @Section('CACAO', 'write')
  voidPayment(
    @Param('paymentId', ParseIntPipe) paymentId: number,
    @Body() dto: VoidPaymentDto,
    @Req() req: any,
  ) {
    return this.service.voidPayment(
      paymentId,
      dto.reason,
      req.user.companyId,
      req.user.userId,
    );
  }
}
