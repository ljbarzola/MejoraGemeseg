import { Body, Controller, Get, Put, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { RolesGuard } from '../../common/guards/roles.guard';
import { SectionPermissionGuard } from '../../common/guards/section-permission.guard';
import { Section } from '../../common/decorators/section.decorator';
import { VentasConfigService } from './ventas-config.service';
import { GoogleAdsConfigDto, LandingsConfigDto } from './dto/configuracion.dto';

// Configuración de Ventas y CRM por empresa. Ver y cambiar: cualquiera con acceso al
// módulo Ventas (cambiar pide «puede editar»). Ventas la maneja sin depender de
// Sistemas, igual que las etapas, los campos o los servicios. Quién puede editar lo
// decide el administrador de la empresa por usuario.
@Controller('ventas/configuracion')
@UseGuards(AuthGuard('jwt'), SectionPermissionGuard, RolesGuard)
export class VentasConfigController {
  constructor(private readonly config: VentasConfigService) {}

  @Get()
  @Section('VENTAS', 'view')
  resumen(@Req() req: any) {
    return this.config.resumen(req.user.companyId);
  }

  @Put('google-ads')
  @Section('VENTAS', 'write')
  guardarGoogleAds(@Req() req: any, @Body() dto: GoogleAdsConfigDto) {
    return this.config.guardarGoogleAds(req.user.companyId, req.user.userId, dto);
  }

  @Put('landings')
  @Section('VENTAS', 'write')
  guardarLandings(@Req() req: any, @Body() dto: LandingsConfigDto) {
    return this.config.guardarLandings(req.user.companyId, req.user.userId, dto.landings);
  }
}
