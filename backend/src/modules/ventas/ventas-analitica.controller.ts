import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { SectionPermissionGuard } from '../../common/guards/section-permission.guard';
import { Section } from '../../common/decorators/section.decorator';
import { VentasAnaliticaService } from './ventas-analitica.service';

// Analítica de Ventas (tablero ampliado, 2026-10-07). Va bajo /ventas/analitica
// porque /ventas/dashboard ya lo usa el módulo viejo de metas. Quien no es ADMIN
// ni MANAGER solo ve las cifras de sus propios clientes y oportunidades.
@Controller('ventas/analitica')
@UseGuards(AuthGuard('jwt'), SectionPermissionGuard)
export class VentasAnaliticaController {
  constructor(private readonly analitica: VentasAnaliticaService) {}

  private alcance(req: any, alcance?: string) {
    return { userId: req.user.userId, role: req.user.role, alcance };
  }

  @Get('cartera')
  @Section('VENTAS', 'view')
  cartera(@Req() req: any, @Query('alcance') alcance?: string) {
    return this.analitica.cartera(req.user.companyId, this.alcance(req, alcance));
  }

  // Mapa de Ecuador del Dashboard: dónde están las oportunidades que tienen Ubicación.
  @Get('mapa')
  @Section('VENTAS', 'view')
  mapa(@Req() req: any, @Query('alcance') alcance?: string, @Query('vista') vista?: string) {
    return this.analitica.mapa(req.user.companyId, this.alcance(req, alcance), vista);
  }

  @Get('retencion')
  @Section('VENTAS', 'view')
  retencion(
    @Req() req: any,
    @Query('alcance') alcance?: string,
    @Query('desde') desde?: string,
    @Query('hasta') hasta?: string,
  ) {
    return this.analitica.retencion(req.user.companyId, this.alcance(req, alcance), desde, hasta);
  }

  @Get('embudo')
  @Section('VENTAS', 'view')
  embudo(
    @Req() req: any,
    @Query('alcance') alcance?: string,
    @Query('desde') desde?: string,
    @Query('hasta') hasta?: string,
  ) {
    return this.analitica.embudo(req.user.companyId, this.alcance(req, alcance), desde, hasta);
  }

  @Get('aceptacion')
  @Section('VENTAS', 'view')
  aceptacion(
    @Req() req: any,
    @Query('alcance') alcance?: string,
    @Query('desde') desde?: string,
    @Query('hasta') hasta?: string,
  ) {
    return this.analitica.aceptacion(req.user.companyId, this.alcance(req, alcance), desde, hasta);
  }

  @Get('motivos')
  @Section('VENTAS', 'view')
  motivos(
    @Req() req: any,
    @Query('alcance') alcance?: string,
    @Query('desde') desde?: string,
    @Query('hasta') hasta?: string,
  ) {
    return this.analitica.motivos(req.user.companyId, this.alcance(req, alcance), desde, hasta);
  }

  @Get('actividad')
  @Section('VENTAS', 'view')
  actividad(
    @Req() req: any,
    @Query('alcance') alcance?: string,
    @Query('desde') desde?: string,
    @Query('hasta') hasta?: string,
  ) {
    return this.analitica.actividad(req.user.companyId, this.alcance(req, alcance), desde, hasta);
  }

  @Get('marketing')
  @Section('VENTAS', 'view')
  marketing(
    @Req() req: any,
    @Query('alcance') alcance?: string,
    @Query('agrupar') agrupar?: string,
    @Query('canal') canal?: string,
    @Query('desde') desde?: string,
    @Query('hasta') hasta?: string,
  ) {
    return this.analitica.marketing(
      req.user.companyId,
      this.alcance(req, alcance),
      agrupar,
      desde,
      hasta,
      canal,
    );
  }
}
