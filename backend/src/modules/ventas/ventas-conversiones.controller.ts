import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { SectionPermissionGuard } from '../../common/guards/section-permission.guard';
import { Section } from '../../common/decorators/section.decorator';
import { VentasConversionesService } from './ventas-conversiones.service';

// Estado del aviso a Google Ads: cuántos hechos (lead cualificado / convertido)
// hay por avisar, cuántos ya salieron y cuántos fallaron.
@Controller('ventas/conversiones')
@UseGuards(AuthGuard('jwt'), SectionPermissionGuard)
export class VentasConversionesController {
  constructor(private readonly conversiones: VentasConversionesService) {}

  @Get('resumen')
  @Section('VENTAS', 'view')
  resumen(@Req() req: any) {
    return this.conversiones.resumen(req.user.companyId);
  }
}
