import { Controller, Headers, HttpCode, NotFoundException, Post, Query, UnauthorizedException } from '@nestjs/common';
import { timingSafeEqual } from 'crypto';
import { MarketingCrecimientoService } from './marketing-crecimiento.service';

/**
 * Cloud Scheduler (lunes): el agente de Marketing propone campañas nuevas a cada empresa con
 * Marketing activo. Mismo patrón que los demás crons: sin sesión, header `x-cron-secret` = CRON_SECRET
 * (sin la variable el endpoint no existe). `?dryRun=true` solo lista las empresas.
 */
@Controller('marketing/propuestas-cron')
export class MarketingPropuestasCronController {
  constructor(private readonly crecimiento: MarketingCrecimientoService) {}

  @Post('run')
  @HttpCode(200)
  run(@Headers('x-cron-secret') recibido?: string, @Query('dryRun') dryRun?: string) {
    const esperado = process.env.CRON_SECRET;
    if (!esperado) throw new NotFoundException();
    const a = Buffer.from(recibido || '');
    const b = Buffer.from(esperado);
    if (a.length !== b.length || !timingSafeEqual(a, b)) throw new UnauthorizedException();
    return this.crecimiento.propuestasSemanales(dryRun === 'true');
  }
}
