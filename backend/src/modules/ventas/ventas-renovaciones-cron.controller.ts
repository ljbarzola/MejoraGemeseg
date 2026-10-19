import {
  Controller,
  Headers,
  HttpCode,
  NotFoundException,
  Post,
  Query,
  UnauthorizedException,
} from '@nestjs/common';
import { timingSafeEqual } from 'crypto';
import { VentasRenovacionesService } from './ventas-renovaciones.service';

/**
 * Punto de entrada para Cloud Scheduler (Fase 4, 2026-10-18): abre las oportunidades de
 * renovación de los contratos por vencer. Mismo patrón que TaskRemindersCronController y
 * VentasConversionesCronController: sin sesión de usuario, protegido con el secreto compartido
 * CRON_SECRET (header `x-cron-secret`); sin CRON_SECRET el endpoint no existe.
 * `?dryRun=true` solo lista lo que crearía. Es idempotente: se puede llamar varias veces al día sin duplicar nada.
 */
@Controller('ventas/renovaciones-cron')
export class VentasRenovacionesCronController {
  constructor(private readonly renovaciones: VentasRenovacionesService) {}

  @Post('generar')
  @HttpCode(200)
  generar(
    @Headers('x-cron-secret') recibido?: string,
    @Query('dryRun') dryRun?: string,
  ) {
    const esperado = process.env.CRON_SECRET;
    if (!esperado) throw new NotFoundException();
    if (!recibido || !this.iguales(recibido, esperado)) {
      throw new UnauthorizedException();
    }
    return this.renovaciones.generar({ dryRun: dryRun === 'true' });
  }

  private iguales(a: string, b: string): boolean {
    const bufA = Buffer.from(a);
    const bufB = Buffer.from(b);
    return bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
  }
}
