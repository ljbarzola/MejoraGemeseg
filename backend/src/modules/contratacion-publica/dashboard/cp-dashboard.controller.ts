import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { IsIn, IsOptional, Matches } from 'class-validator';
import { SectionPermissionGuard } from '../../../common/guards/section-permission.guard';
import { Section } from '../../../common/decorators/section.decorator';
import { hoyEcuador } from '../../bitacora/bitacora-fecha.util';
import { CPDashboardService } from './cp-dashboard.service';

const FECHA = /^\d{4}-\d{2}-\d{2}$/;

export class DashboardCPQueryDto {
  @IsOptional()
  @IsIn(['PUBLICA', 'PRIVADA'], { message: 'El tipo de entidad no es válido' })
  tipo?: 'PUBLICA' | 'PRIVADA';

  @IsOptional()
  @Matches(FECHA, { message: 'La fecha debe ser AAAA-MM-DD' })
  desde?: string;

  @IsOptional()
  @Matches(FECHA, { message: 'La fecha debe ser AAAA-MM-DD' })
  hasta?: string;
}

/** Dashboard de Contratación Pública (2026-11-18): cifras por entidad, solo lectura. */
@Controller('contratacion-publica/dashboard')
@UseGuards(AuthGuard('jwt'), SectionPermissionGuard)
export class CPDashboardController {
  constructor(private readonly service: CPDashboardService) {}

  @Get()
  @Section('CONTRATACION_PUBLICA', 'view')
  obtener(@Query() q: DashboardCPQueryDto, @Req() req: any) {
    // Sin periodo: este mes (días de Ecuador).
    const hoy = hoyEcuador();
    const desde = q.desde ?? `${hoy.slice(0, 7)}-01`;
    const hasta = q.hasta ?? hoy;
    return this.service.obtener(req.user, {
      tipo: q.tipo,
      desde: desde <= hasta ? desde : hasta,
      hasta: desde <= hasta ? hasta : desde,
    });
  }
}
