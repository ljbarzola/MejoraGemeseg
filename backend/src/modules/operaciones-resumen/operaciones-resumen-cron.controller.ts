import { Controller, Headers, HttpCode, NotFoundException, Post, Query, UnauthorizedException } from '@nestjs/common';
import { timingSafeEqual } from 'crypto';
import { OperacionesResumenService } from './operaciones-resumen.service';

/**
 * Punto de entrada para Cloud Scheduler (una vez al día, 9:00 hora de Ecuador). Mismo patrón que
 * VigilanteCronController y TaskRemindersCronController: sin sesión de usuario, protegido con el
 * secreto compartido CRON_SECRET (header `x-cron-secret`); sin CRON_SECRET el endpoint no existe.
 * `?dryRun=true` calcula todo sin dejar ninguna notificación ni mandar correo.
 */
@Controller('operaciones/resumen-cron')
export class OperacionesResumenCronController {
  constructor(private readonly service: OperacionesResumenService) {}

  @Post('run')
  @HttpCode(200)
  ejecutar(@Headers('x-cron-secret') recibido?: string, @Query('dryRun') dryRun?: string) {
    const esperado = process.env.CRON_SECRET;
    if (!esperado) throw new NotFoundException();
    if (!recibido || !this.iguales(recibido, esperado)) throw new UnauthorizedException();
    return this.service.procesar({ dryRun: dryRun === 'true' });
  }

  private iguales(a: string, b: string): boolean {
    const bufA = Buffer.from(a);
    const bufB = Buffer.from(b);
    return bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
  }
}
