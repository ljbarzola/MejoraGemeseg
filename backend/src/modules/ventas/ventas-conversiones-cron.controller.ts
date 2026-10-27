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
import { VentasConversionesService } from './ventas-conversiones.service';

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
  constructor(
    private readonly envio: GoogleAdsConversionesService,
    private readonly conversiones: VentasConversionesService,
  ) {}

  @Post('enviar')
  @HttpCode(200)
  async enviar(
    @Headers('x-cron-secret') recibido?: string,
    @Query('dryRun') dryRun?: string,
  ) {
    const esperado = process.env.CRON_SECRET;
    if (!esperado) throw new NotFoundException();
    if (!recibido || !this.iguales(recibido, esperado)) {
      throw new UnauthorizedException();
    }
    const simulacro = dryRun === 'true';
    // En simulacro no se escribe nada: solo se cuenta lo que se enviaría.
    if (simulacro) return this.envio.enviarPendientes({ dryRun: true });
    // 1) se registran los hechos que faltaron (p. ej. oportunidades que ya estaban En evaluación cuando cambió
    // la regla de «cualificado»); 2) los enviados antes de poder verificarse se vuelven a mandar una vez;
    // 3) se envía; 4) se le pregunta a Google si procesó o rechazó lo enviado hace más de 30 minutos.
    const rellenados = await this.conversiones.rellenarFaltantes();
    const reenviados = await this.envio.reencolarSinVerificar();
    const envio = await this.envio.enviarPendientes();
    const verificacion = await this.envio.verificarEnvios();
    return { ...envio, rellenados: rellenados.creados, reenviados, verificacion };
  }

  private iguales(a: string, b: string): boolean {
    const bufA = Buffer.from(a);
    const bufB = Buffer.from(b);
    return bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
  }
}
