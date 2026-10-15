import { Body, Controller, Delete, Get, Put, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { UserRole } from '@prisma/client';
import { RolesGuard } from '../../common/guards/roles.guard';
import { SectionPermissionGuard } from '../../common/guards/section-permission.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Section } from '../../common/decorators/section.decorator';
import { VentasConfigService } from './ventas-config.service';
import { GoogleAdsConfigDto, LandingsConfigDto } from './dto/configuracion.dto';

// Configuración de Ventas y CRM por empresa. Ver la configuración lo pueden hacer el
// administrador y el gerente (solo lectura, como en el resto de la plataforma);
// cambiarla, solo el administrador.
@Controller('ventas/configuracion')
@UseGuards(AuthGuard('jwt'), SectionPermissionGuard, RolesGuard)
export class VentasConfigController {
  constructor(private readonly config: VentasConfigService) {}

  @Get()
  @Section('VENTAS', 'view')
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  resumen(@Req() req: any) {
    return this.config.resumen(req.user.companyId);
  }

  @Put('google-ads')
  @Section('VENTAS', 'write')
  @Roles(UserRole.ADMIN)
  guardarGoogleAds(@Req() req: any, @Body() dto: GoogleAdsConfigDto) {
    return this.config.guardarGoogleAds(req.user.companyId, req.user.userId, dto);
  }

  @Put('landings')
  @Section('VENTAS', 'write')
  @Roles(UserRole.ADMIN)
  guardarLandings(@Req() req: any, @Body() dto: LandingsConfigDto) {
    return this.config.guardarLandings(req.user.companyId, req.user.userId, dto.landings);
  }

  @Delete('landings')
  @Section('VENTAS', 'write')
  @Roles(UserRole.ADMIN)
  restaurarLandings(@Req() req: any) {
    return this.config.restaurarLandings(req.user.companyId);
  }
}
