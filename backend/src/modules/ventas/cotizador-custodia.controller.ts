import { Body, Controller, Get, HttpCode, Post, Put, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { UserRole } from '@prisma/client';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { SectionPermissionGuard } from '../../common/guards/section-permission.guard';
import { Section } from '../../common/decorators/section.decorator';
import { CotizadorCustodiaService } from './cotizador-custodia.service';

// Custodia móvil dentro del Cotizador. Calcular y ver las tarifas: quien usa el Cotizador. Cambiar las
// tarifas (son costos internos): solo administrador o gerente de la empresa.
@Controller('ventas/cotizador/custodia')
@UseGuards(AuthGuard('jwt'), SectionPermissionGuard, RolesGuard)
export class CotizadorCustodiaController {
  constructor(private readonly custodia: CotizadorCustodiaService) {}

  @Get('tarifas')
  @Section('VENTAS', 'view')
  tarifas(@Req() req: any) {
    return this.custodia.tarifas(req.user.companyId);
  }

  @Put('tarifas')
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  @Section('VENTAS', 'write')
  guardarTarifas(@Req() req: any, @Body() body: unknown) {
    return this.custodia.guardarTarifas(req.user.companyId, req.user.userId, body);
  }

  @Post('calcular')
  @HttpCode(200)
  @Section('VENTAS', 'view')
  calcular(@Req() req: any, @Body() body: unknown) {
    return this.custodia.calcular(req.user.companyId, body);
  }
}
