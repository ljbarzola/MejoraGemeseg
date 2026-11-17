import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  HttpException,
  HttpStatus,
  Param,
  ParseIntPipe,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { JwtService } from '@nestjs/jwt';
import { SectionPermissionGuard } from '../../common/guards/section-permission.guard';
import { Section } from '../../common/decorators/section.decorator';
import type { CotActor } from './cotizador-cotizaciones.service';
import { CotizadorEnlacesService } from './cotizador-enlaces.service';
import { LimitePorIp } from './whatsapp-clics.util';

/** Lo que la ruta lee de la petición (con sesión: `user` lo pone JwtStrategy). */
interface Peticion {
  headers: Record<string, string | string[] | undefined>;
  ip?: string;
  user?: CotActor;
}

const actor = (req: Peticion): CotActor => ({
  userId: req.user!.userId,
  role: req.user!.role,
  companyId: req.user!.companyId,
});

const cabecera = (req: Peticion, nombre: string): string => {
  const v = req.headers?.[nombre];
  return (Array.isArray(v) ? v[0] : v) ?? '';
};

/** Enlace para el cliente, visto desde el Cotizador (con sesión y permiso de Ventas). */
@Controller('ventas/cotizador')
@UseGuards(AuthGuard('jwt'), SectionPermissionGuard)
export class CotizadorEnlacesController {
  constructor(private readonly enlaces: CotizadorEnlacesService) {}

  @Get('cotizaciones/:id/enlace')
  @Section('VENTAS', 'view')
  seguimiento(@Req() req: Peticion, @Param('id', ParseIntPipe) id: number) {
    return this.enlaces.seguimiento(actor(req), id);
  }

  @Post('cotizaciones/:id/enlace')
  @Section('VENTAS', 'write')
  crear(@Req() req: Peticion, @Param('id', ParseIntPipe) id: number) {
    return this.enlaces.crear(actor(req), id);
  }

  @Delete('cotizaciones/:id/enlace')
  @Section('VENTAS', 'write')
  desactivar(@Req() req: Peticion, @Param('id', ParseIntPipe) id: number) {
    return this.enlaces.desactivar(actor(req), id);
  }
}

function ipDe(req: Peticion): string {
  const reenviada = cabecera(req, 'x-forwarded-for').split(',')[0].trim();
  return reenviada || req.ip || 'desconocida';
}

/**
 * Página pública de la cotización (/cotizacion/:token). SIN AuthGuard a propósito: el cliente no
 * tiene cuenta. La protegen el código al azar del enlace (192 bits), que el vendedor puede apagar,
 * los límites por conexión y que el servidor solo entrega precios de venta (nunca costos ni márgenes).
 * La IP se usa solo para el límite; no se guarda.
 */
@Controller('public/cotizaciones')
export class CotizadorEnlacePublicoController {
  // Holgados: una oficina entera puede compartir la misma IP.
  private readonly limiteLectura = new LimitePorIp(120, 10 * 60_000);
  private readonly limiteLatidos = new LimitePorIp(600, 10 * 60_000);
  private readonly limiteRespuestas = new LimitePorIp(10, 60 * 60_000);

  constructor(
    private readonly enlaces: CotizadorEnlacesService,
    private readonly jwt: JwtService,
  ) {}

  private limitar(limite: LimitePorIp, req: Peticion) {
    if (!limite.permitir(ipDe(req))) {
      throw new HttpException(
        'Demasiadas solicitudes desde esta conexión. Espera unos minutos e inténtalo de nuevo.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  /**
   * Empresa de quien tiene sesión iniciada en este navegador (la página manda su token si existe).
   * Solo sirve para no contar como «vista por el cliente» las aperturas del propio equipo; un token
   * vencido o falso simplemente cuenta como cliente.
   */
  private empresaDelVisor(req: Peticion): number | null {
    const h = cabecera(req, 'authorization');
    if (!h.startsWith('Bearer ')) return null;
    try {
      const p = this.jwt.verify<{ companyId?: number | null }>(h.slice(7));
      return typeof p.companyId === 'number' ? p.companyId : null;
    } catch {
      return null;
    }
  }

  @Get(':token')
  @Header('Cache-Control', 'no-store')
  @Header('X-Robots-Tag', 'noindex, nofollow')
  pagina(@Req() req: Peticion, @Param('token') token: string) {
    this.limitar(this.limiteLectura, req);
    return this.enlaces.pagina(token);
  }

  @Post(':token/visitas')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  abrir(
    @Req() req: Peticion,
    @Param('token') token: string,
    @Body() body: { visitante?: unknown },
  ) {
    this.limitar(this.limiteLectura, req);
    return this.enlaces.abrir(
      token,
      body?.visitante,
      cabecera(req, 'user-agent'),
      this.empresaDelVisor(req),
    );
  }

  @Post(':token/visitas/:visita/latido')
  @HttpCode(200)
  latido(
    @Req() req: Peticion,
    @Param('token') token: string,
    @Param('visita', ParseIntPipe) visita: number,
    @Body() body: { clave?: unknown; descarga?: unknown; reanudar?: unknown },
  ) {
    this.limitar(this.limiteLatidos, req);
    return this.enlaces.latido(
      token,
      visita,
      body?.clave,
      body?.descarga === true,
      body?.reanudar === true,
    );
  }

  @Post(':token/respuesta')
  @HttpCode(200)
  responder(
    @Req() req: Peticion,
    @Param('token') token: string,
    @Body() body: { tipo?: unknown; mensaje?: unknown },
  ) {
    this.limitar(this.limiteRespuestas, req);
    return this.enlaces.responder(
      token,
      body?.tipo,
      body?.mensaje,
      this.empresaDelVisor(req),
    );
  }
}
