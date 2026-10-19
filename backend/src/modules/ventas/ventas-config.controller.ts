import { Body, Controller, Delete, Get, Param, ParseIntPipe, Post, Put, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { RolesGuard } from '../../common/guards/roles.guard';
import { SectionPermissionGuard } from '../../common/guards/section-permission.guard';
import { Section } from '../../common/decorators/section.decorator';
import { VentasConfigService } from './ventas-config.service';
import { CambiarClaveDto, GoogleAdsConfigDto, LandingsConfigDto, NuevaConexionDto } from './dto/configuracion.dto';

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

  // Conexiones propias («Añadir nueva conexión»): un nombre y su clave.
  @Post('conexiones')
  @Section('VENTAS', 'write')
  crearConexion(@Req() req: any, @Body() dto: NuevaConexionDto) {
    return this.config.crearConexion(req.user.companyId, req.user.userId, dto.nombre);
  }

  @Delete('conexiones/:id')
  @Section('VENTAS', 'write')
  async quitarConexion(@Req() req: any, @Param('id') id: string) {
    await this.config.quitarConexion(req.user.companyId, req.user.userId, id);
    return { ok: true };
  }

  // Activar o desactivar una clave de conexión sin borrarla.
  @Put('claves/:id')
  @Section('VENTAS', 'write')
  cambiarClave(@Req() req: any, @Param('id', ParseIntPipe) id: number, @Body() dto: CambiarClaveDto) {
    return this.config.cambiarClave(req.user.companyId, id, dto.isActive);
  }
}
