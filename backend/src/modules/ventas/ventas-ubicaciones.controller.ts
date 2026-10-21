import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { SectionPermissionGuard } from '../../common/guards/section-permission.guard';
import { Section } from '../../common/decorators/section.decorator';
import { VentasUbicacionesService } from './ventas-ubicaciones.service';

// Buscador de lugares del cuadro «Ubicación» de las oportunidades (OpenStreetMap).
@Controller('ventas/ubicaciones')
@UseGuards(AuthGuard('jwt'), SectionPermissionGuard)
export class VentasUbicacionesController {
  constructor(private readonly ubicaciones: VentasUbicacionesService) {}

  @Get('buscar')
  @Section('VENTAS', 'view')
  buscar(@Query('q') q?: string) {
    return this.ubicaciones.buscar(q);
  }

  @Get('inversa')
  @Section('VENTAS', 'view')
  inversa(@Query('lat') lat?: string, @Query('lng') lng?: string) {
    return this.ubicaciones.inversa(lat, lng);
  }
}
