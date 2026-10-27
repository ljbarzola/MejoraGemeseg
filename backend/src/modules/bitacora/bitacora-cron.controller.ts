import {
  Controller,
  Headers,
  HttpCode,
  NotFoundException,
  Post,
  UnauthorizedException,
} from '@nestjs/common';
import { timingSafeEqual } from 'crypto';
import { BitacoraGoogleService } from './bitacora-google.service';

/**
 * Punto de entrada para Cloud Scheduler (una vez por hora). Mismo patrón que
 * TaskRemindersCronController: sin sesión de usuario, protegido con el secreto
 * compartido CRON_SECRET (header `x-cron-secret`), y sin CRON_SECRET el
 * endpoint no existe. El job de Cloud Scheduler todavía no está creado.
 */
@Controller('bitacora/google-cron')
export class BitacoraCronController {
  constructor(private readonly google: BitacoraGoogleService) {}

  @Post('sincronizar')
  @HttpCode(200)
  sincronizar(@Headers('x-cron-secret') recibido?: string) {
    const esperado = process.env.CRON_SECRET;
    if (!esperado) throw new NotFoundException();
    if (!recibido || !this.iguales(recibido, esperado)) {
      throw new UnauthorizedException();
    }
    return this.google.sincronizar();
  }

  private iguales(a: string, b: string): boolean {
    const bufA = Buffer.from(a);
    const bufB = Buffer.from(b);
    return bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
  }
}
