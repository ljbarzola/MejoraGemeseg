import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpException,
  HttpStatus,
  Post,
  Req,
} from '@nestjs/common';
import { ComplaintExternaService } from './services/complaint-externa.service';
import { SubmitPublicComplaintDto } from './dto/complaint-externa.dto';
import { LimitePorIp } from '../ventas/whatsapp-clics.util';

/**
 * Formulario público de quejas (quejas.gemeseg.com). SIN AuthGuard a propósito:
 * lo llena personal en inducción que aún no tiene cuenta. Lo protegen la lista de
 * opciones validada en el servidor, un campo trampa para robots y un límite por IP
 * (la IP se usa solo para limitar, nunca se guarda con la queja: puede ser anónima).
 * El límite es holgado porque un grupo entero en la misma sala comparte IP.
 */
@Controller('public/quejas')
export class PublicComplaintController {
  private readonly limite = new LimitePorIp(30, 10 * 60_000);

  constructor(private readonly externas: ComplaintExternaService) {}

  @Get('formulario')
  formulario() {
    return this.externas.formularioPublico();
  }

  @Post()
  @HttpCode(200)
  enviar(@Req() req: any, @Body() body: SubmitPublicComplaintDto) {
    const reenviada = (req.headers?.['x-forwarded-for'] ?? '')
      .toString()
      .split(',')[0]
      .trim();
    const ip = reenviada || req.ip || 'desconocida';
    if (!this.limite.permitir(ip)) {
      throw new HttpException(
        'Demasiados envíos desde esta conexión. Espera unos minutos e inténtalo de nuevo.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    return this.externas.enviar(body);
  }
}
