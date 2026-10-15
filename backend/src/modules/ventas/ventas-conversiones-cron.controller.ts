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
import { GoogleAdsConversionesService } from './google-ads-conversiones.service';

/**
 * Punto de entrada para Cloud Scheduler: manda a Google Ads los hechos que
 * quedaron por avisar (y reintenta los que fallaron). Mismo patrón que
 * TaskRemindersCronController: sin sesión de usuario, protegido con el secreto
 * compartido CRON_SECRET (header `x-cron-secret`); sin CRON_SECRET el endpoint
 * no existe. `?dryRun=true` solo cuenta lo que se enviaría.
 * Además de este cron, cada cambio de etapa intenta el envío al momento.
 */
@Controller('ventas/conversiones-cron')
export class VentasConversionesCronController {
  constructor(private readonly envio: GoogleAdsConversionesService) {}

  @Post('enviar')
  @HttpCode(200)
  enviar(
    @Headers('x-cron-secret') recibido?: string,
    @Query('dryRun') dryRun?: string,
  ) {
    const esperado = process.env.CRON_SECRET;
    if (!esperado) throw new NotFoundException();
    if (!recibido || !this.iguales(recibido, esperado)) {
      throw new UnauthorizedException();
    }
    return this.envio.enviarPendientes({ dryRun: dryRun === 'true' });
  }

  private iguales(a: string, b: string): boolean {
    const bufA = Buffer.from(a);
    const bufB = Buffer.from(b);
    return bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
  }
}
