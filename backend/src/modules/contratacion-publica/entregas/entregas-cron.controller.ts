import {
  Controller,
  Headers,
  HttpCode,
  NotFoundException,
  Post,
  UnauthorizedException,
} from '@nestjs/common';
import { timingSafeEqual } from 'crypto';
import { EntregasRecordatoriosService } from './entregas-recordatorios.service';

/**
 * Punto de entrada para Cloud Scheduler. No usa sesión de usuario: se protege
 * con un secreto compartido (variable CRON_SECRET, header `x-cron-secret`).
 * Sin CRON_SECRET configurado el endpoint no existe, para que nunca quede
 * abierto por olvido.
 */
@Controller('contratacion-publica/entregas-cron')
export class EntregasCronController {
  constructor(private readonly recordatorios: EntregasRecordatoriosService) {}

  @Post('recordatorios')
  @HttpCode(200)
  ejecutar(@Headers('x-cron-secret') recibido?: string) {
    const esperado = process.env.CRON_SECRET;
    if (!esperado) throw new NotFoundException();
    if (!recibido || !this.iguales(recibido, esperado)) {
      throw new UnauthorizedException();
    }
    return this.recordatorios.procesar();
  }

  private iguales(a: string, b: string): boolean {
    const bufA = Buffer.from(a);
    const bufB = Buffer.from(b);
    return bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
  }
}
