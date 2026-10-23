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
import { CacaoReceivablesService } from './receivables.service';
import { PaymentDto, VoidPaymentDto } from '../common/payment.dto';

@Controller('cacao/receivables')
export class CacaoReceivablesController {
  constructor(private readonly service: CacaoReceivablesService) {}

  @Get()
  @UseGuards(AuthGuard('jwt'), SectionPermissionGuard)
  @Section('CACAO', 'view')
  findAll(@Req() req: any, @Query() query: { status?: string }) {
    return this.service.findAll(req.user.companyId, query);
  }

  @Post(':id/receive')
  @UseGuards(AuthGuard('jwt'), RolesGuard, SectionPermissionGuard)
  @Roles(UserRole.ADMIN)
  @Section('CACAO', 'write')
  receive(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: PaymentDto,
    @Req() req: any,
  ) {
    return this.service.receive(id, dto, req.user.companyId, req.user.userId);
  }

  @Post('payments/:paymentId/void')
  @UseGuards(AuthGuard('jwt'), RolesGuard, SectionPermissionGuard)
  @Roles(UserRole.ADMIN)
  @Section('CACAO', 'write')
  voidReceipt(
    @Param('paymentId', ParseIntPipe) paymentId: number,
    @Body() dto: VoidPaymentDto,
    @Req() req: any,
  ) {
    return this.service.voidReceipt(
      paymentId,
      dto.reason,
      req.user.companyId,
      req.user.userId,
    );
  }
}
