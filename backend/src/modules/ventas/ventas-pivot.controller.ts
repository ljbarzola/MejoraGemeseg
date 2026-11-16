import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { UserRole } from '@prisma/client';
import { SectionPermissionGuard } from '../../common/guards/section-permission.guard';
import { Section } from '../../common/decorators/section.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { VentasPivotService } from './ventas-pivot.service';

// Tabla dinámica del Dashboard de Ventas (2026-11-16). Solo lectura y solo para administradores y gerentes
// (decisión de Leidy). Si algún día se abre a vendedores, el servicio ya les entrega únicamente sus propias
// ventas aunque pidan «toda la empresa» (en esta tabla se ve cliente por cliente, no solo totales).
@Controller('ventas/tabla-dinamica')
@UseGuards(AuthGuard('jwt'), SectionPermissionGuard)
export class VentasPivotController {
  constructor(private readonly pivot: VentasPivotService) {}

  @Get()
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  @Section('VENTAS', 'view')
  tabla(
    @Req() req: any,
    @Query('alcance') alcance?: string,
    @Query('desde') desde?: string,
    @Query('hasta') hasta?: string,
    @Query('filas') filas?: string,
    @Query('columna') columna?: string,
    @Query('medidas') medidas?: string,
    @Query('filtros') filtros?: string,
  ) {
    return this.pivot.tabla(
      req.user.companyId,
      { userId: req.user.userId, role: req.user.role, alcance },
      { desde, hasta, filas, columna, medidas, filtros },
    );
  }
}
