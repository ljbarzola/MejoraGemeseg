import { Body, Controller, Get, Put, Query, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { UserRole } from '@prisma/client';
import { SectionPermissionGuard } from '../../common/guards/section-permission.guard';
import { Section } from '../../common/decorators/section.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { VentasMetasService, type GuardarMetasDto } from './ventas-metas.service';

// Metas comerciales (2026-11-13). Desde 2026-11-16 TODO el módulo (fijarlas y ver el avance) es solo de
// administradores y gerentes, decisión de Leidy: los vendedores no ven metas. La lógica que reparte lo que ve un
// vendedor (solo su meta y la de la empresa) sigue en el servicio por si algún día se abre.
@Controller('ventas/metas')
@UseGuards(AuthGuard('jwt'), SectionPermissionGuard)
export class VentasMetasController {
  constructor(private readonly metas: VentasMetasService) {}

  // Lo fijado para un mes (periodKind=MES&year=2026&month=11) o un año (periodKind=ANIO&year=2026).
  @Get()
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  @Section('VENTAS', 'view')
  listar(
    @Req() req: any,
    @Query('periodKind') periodKind: string,
    @Query('year') year: string,
    @Query('month') month?: string,
  ) {
    return this.metas.listar(req.user.companyId, periodKind, Number(year), month ? Number(month) : undefined, {
      userId: req.user.userId,
      role: req.user.role,
    });
  }

  // Avance contra la meta del periodo que elige el Dashboard. Misma regla de alcance que /ventas/analitica.
  @Get('cumplimiento')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  @Section('VENTAS', 'view')
  cumplimiento(
    @Req() req: any,
    @Query('alcance') alcance?: string,
    @Query('desde') desde?: string,
    @Query('hasta') hasta?: string,
    @Query('periodo') periodo?: string,
  ) {
    return this.metas.cumplimiento(
      req.user.companyId,
      { userId: req.user.userId, role: req.user.role, alcance },
      desde,
      hasta,
      periodo,
    );
  }

  @Put()
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  @Section('VENTAS', 'write')
  guardar(@Req() req: any, @Body() dto: GuardarMetasDto) {
    return this.metas.guardar(req.user.companyId, req.user.userId, dto);
  }
}
