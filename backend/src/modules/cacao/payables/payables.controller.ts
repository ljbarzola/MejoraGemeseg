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
import { CacaoPaymentRequestsService } from './payment-requests.service';
import { PaymentDto, VoidPaymentDto } from '../common/payment.dto';
import { ReasonDto } from '../common/reason.dto';

@Controller('cacao/payables')
export class CacaoPayablesController {
  constructor(
    private readonly service: CacaoPayablesService,
    private readonly requests: CacaoPaymentRequestsService,
  ) {}

  @Get()
  @UseGuards(AuthGuard('jwt'), SectionPermissionGuard)
  @Section('CACAO', 'view')
  findAll(@Req() req: any, @Query() query: { status?: string }) {
    return this.service.findAll(req.user.companyId, query);
  }

  // ─── Solicitudes de pago (solo si la empresa exige autorización) ───

  /** `?status=REQUESTED|AUTHORIZED|PAID|REJECTED|CANCELLED` */
  @Get('requests')
  @UseGuards(AuthGuard('jwt'), SectionPermissionGuard)
  @Section('CACAO', 'view')
  listRequests(@Req() req: any, @Query('status') status?: string) {
    return this.requests.list(req.user.companyId, status);
  }

  @Post(':id/requests')
  @UseGuards(AuthGuard('jwt'), RolesGuard, SectionPermissionGuard)
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  @Section('CACAO', 'write')
  createRequest(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: PaymentDto,
    @Req() req: any,
  ) {
    return this.requests.create(id, dto, req.user.companyId, req.user.userId);
  }

  @Post('requests/:requestId/authorize')
  @UseGuards(AuthGuard('jwt'), RolesGuard, SectionPermissionGuard)
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  @Section('CACAO', 'write')
  authorizeRequest(
    @Param('requestId', ParseIntPipe) requestId: number,
    @Req() req: any,
  ) {
    return this.requests.authorize(
      requestId,
      req.user.companyId,
      req.user.userId,
    );
  }

  @Post('requests/:requestId/reject')
  @UseGuards(AuthGuard('jwt'), RolesGuard, SectionPermissionGuard)
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  @Section('CACAO', 'write')
  rejectRequest(
    @Param('requestId', ParseIntPipe) requestId: number,
    @Body() dto: ReasonDto,
    @Req() req: any,
  ) {
    return this.requests.reject(
      requestId,
      req.user.companyId,
      req.user.userId,
      dto.reason,
    );
  }

  @Post('requests/:requestId/cancel')
  @UseGuards(AuthGuard('jwt'), RolesGuard, SectionPermissionGuard)
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  @Section('CACAO', 'write')
  cancelRequest(
    @Param('requestId', ParseIntPipe) requestId: number,
    @Req() req: any,
  ) {
    return this.requests.cancel(
      requestId,
      req.user.companyId,
      req.user.userId,
      req.user.role === UserRole.ADMIN,
    );
  }

  /** Paga una solicitud ya autorizada (solo el administrador, igual que un pago directo). */
  @Post('requests/:requestId/pay')
  @UseGuards(AuthGuard('jwt'), RolesGuard, SectionPermissionGuard)
  @Roles(UserRole.ADMIN)
  @Section('CACAO', 'write')
  payRequest(
    @Param('requestId', ParseIntPipe) requestId: number,
    @Req() req: any,
  ) {
    return this.requests.pay(requestId, req.user.companyId, req.user.userId);
  }

  @Post(':id/pay')
  @UseGuards(AuthGuard('jwt'), RolesGuard, SectionPermissionGuard)
  @Roles(UserRole.ADMIN)
  @Section('CACAO', 'write')
  async pay(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: PaymentDto,
    @Req() req: any,
  ) {
    // Si la empresa exige autorización, el pago directo está cerrado.
    await this.requests.asegurarPagoDirecto(req.user.companyId);
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
