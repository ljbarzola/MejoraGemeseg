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
import { TaskRemindersService } from './task-reminders.service';

/**
 * Punto de entrada para Cloud Scheduler (una vez al día, 9:00 hora de Ecuador).
 * Mismo patrón que EntregasCronController: sin sesión de usuario, protegido con
 * el secreto compartido CRON_SECRET (header `x-cron-secret`) y sin CRON_SECRET
 * el endpoint no existe. `?dryRun=true` lista a quién se avisaría sin enviar
 * nada ni marcar nada como enviado.
 */
@Controller('tasks/reminders-cron')
export class TaskRemindersCronController {
  constructor(private readonly recordatorios: TaskRemindersService) {}

  @Post('run')
  @HttpCode(200)
  ejecutar(
    @Headers('x-cron-secret') recibido?: string,
    @Query('dryRun') dryRun?: string,
  ) {
    const esperado = process.env.CRON_SECRET;
    if (!esperado) throw new NotFoundException();
    if (!recibido || !this.iguales(recibido, esperado)) {
      throw new UnauthorizedException();
    }
    return this.recordatorios.procesar({ dryRun: dryRun === 'true' });
  }

  private iguales(a: string, b: string): boolean {
    const bufA = Buffer.from(a);
    const bufB = Buffer.from(b);
    return bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
  }
}
