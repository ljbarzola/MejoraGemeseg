import {
  Body,
  CallHandler,
  Controller,
  ExecutionContext,
  Get,
  HttpCode,
  HttpException,
  HttpStatus,
  Injectable,
  NestInterceptor,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { memoryStorage } from 'multer';
import type { Observable } from 'rxjs';
import { LimitePorIp } from '../ventas/whatsapp-clics.util';
import { CustodiasCampoAuthService } from './custodias-campo-auth.service';
import { CustodiasCampoService } from './custodias-campo.service';
import { CustodiasEnlaceFotosService } from './custodias-enlace-fotos.service';
import { CampoDispositivoGuard, CampoSesionGuard, type PeticionCampo } from './custodias-campo.guard';
import { MAX_FOTO_BYTES } from './custodias-campo-seguridad.util';

/** Dirección de quien llama (Cloud Run y Firebase Hosting la dejan en x-forwarded-for). Solo sirve para el límite. */
function ipDe(req: { ip?: string; headers: Record<string, string | string[] | undefined> }): string {
  const reenviada = req.headers['x-forwarded-for'];
  const texto = Array.isArray(reenviada) ? reenviada[0] : reenviada;
  const ultima = texto?.split(',').pop()?.trim();
  return ultima || req.ip || 'desconocida';
}

function exigirLimite(limite: LimitePorIp, req: { ip?: string; headers: Record<string, string | string[] | undefined> }) {
  if (!limite.permitir(ipDe(req))) {
    throw new HttpException(
      'Demasiadas solicitudes desde esta conexión. Espera unos minutos e inténtalo de nuevo.',
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
}

/** Nada de lo de campo se guarda en cachés ni se indexa. */
@Injectable()
export class SinCacheInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const res = context.switchToHttp().getResponse<Response>();
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Robots-Tag', 'noindex, nofollow');
    return next.handle();
  }
}

/**
 * La página de campo del celular de la empresa (2026-11-24, Fase 2). SIN AuthGuard de usuario a propósito: el celular
 * se identifica con su propio token (`Authorization: Bearer cd_…`) y la persona con `X-Sesion-Custodio: cs_…`. El
 * servidor revalida todo; ninguna ruta devuelve cédulas, correos, montos ni datos de otros viajes. Va declarado
 * ANTES que CustodiasController en el módulo.
 */
@Controller('custodias/campo')
@UseInterceptors(SinCacheInterceptor)
export class CustodiasCampoController {
  // Para vincular: 10 intentos cada 10 minutos por conexión (el código es de un solo uso y vence en 10 minutos).
  private readonly limiteVincular = new LimitePorIp(10, 10 * 60_000);
  // Holgado: varios celulares pueden salir por la misma conexión móvil.
  private readonly limiteGeneral = new LimitePorIp(1200, 10 * 60_000);

  constructor(
    private readonly auth: CustodiasCampoAuthService,
    private readonly campo: CustodiasCampoService,
  ) {}

  @Post('vincular')
  @HttpCode(200)
  vincular(@Req() req: PeticionCampo, @Body() body: Record<string, unknown>) {
    exigirLimite(this.limiteVincular, req);
    return this.auth.vincular(body?.codigo);
  }

  @Get('estado')
  @UseGuards(CampoDispositivoGuard)
  estado(@Req() req: PeticionCampo) {
    exigirLimite(this.limiteGeneral, req);
    return this.campo.estado(req.celular!, req.headers['x-sesion-custodio']);
  }

  @Post('sesion')
  @HttpCode(200)
  @UseGuards(CampoDispositivoGuard)
  sesion(@Req() req: PeticionCampo, @Body() body: Record<string, unknown>) {
    exigirLimite(this.limiteGeneral, req);
    return this.auth.iniciarSesion(req.celular!, body?.cedula, body?.pin);
  }

  @Post('sesion/cerrar')
  @HttpCode(200)
  @UseGuards(CampoDispositivoGuard, CampoSesionGuard)
  async cerrarSesion(@Req() req: PeticionCampo) {
    exigirLimite(this.limiteGeneral, req);
    await this.auth.cerrarSesion(req.sesion!);
    return { ok: true };
  }

  @Get('viaje')
  @UseGuards(CampoDispositivoGuard, CampoSesionGuard)
  viaje(@Req() req: PeticionCampo) {
    exigirLimite(this.limiteGeneral, req);
    return this.campo.viaje(req.sesion!);
  }

  @Post('eventos')
  @HttpCode(200)
  @UseGuards(CampoDispositivoGuard, CampoSesionGuard)
  eventos(@Req() req: PeticionCampo, @Body() body: Record<string, unknown>) {
    exigirLimite(this.limiteGeneral, req);
    return this.campo.eventos(req.sesion!, body);
  }

  // multipart: `foto` (jpeg ≤ 1,5 MB), `miniatura` (jpeg ≤ 200 KB) y `datos` (JSON). El servidor revisa el tipo real.
  @Post('fotos')
  @HttpCode(200)
  @UseGuards(CampoDispositivoGuard, CampoSesionGuard)
  @UseInterceptors(
    FileFieldsInterceptor(
      [
        { name: 'foto', maxCount: 1 },
        { name: 'miniatura', maxCount: 1 },
      ],
      {
        storage: memoryStorage(),
        limits: { fileSize: MAX_FOTO_BYTES, files: 2, fields: 6, fieldSize: 20_000, parts: 10 },
      },
    ),
  )
  subirFoto(
    @Req() req: PeticionCampo,
    @UploadedFiles() archivos: { foto?: Express.Multer.File[]; miniatura?: Express.Multer.File[] },
    @Body() body: Record<string, unknown>,
  ) {
    exigirLimite(this.limiteGeneral, req);
    return this.campo.subirFoto(req.sesion!, archivos?.foto?.[0], archivos?.miniatura?.[0], body?.datos);
  }

  @Post('firmas')
  @HttpCode(200)
  @UseGuards(CampoDispositivoGuard, CampoSesionGuard)
  subirFirma(@Req() req: PeticionCampo, @Body() body: Record<string, unknown>) {
    exigirLimite(this.limiteGeneral, req);
    return this.campo.subirFirma(req.sesion!, body);
  }

  @Patch('guia')
  @UseGuards(CampoDispositivoGuard, CampoSesionGuard)
  completarGuia(@Req() req: PeticionCampo, @Body() body: Record<string, unknown>) {
    exigirLimite(this.limiteGeneral, req);
    return this.campo.completarGuia(req.sesion!, body);
  }
}

/**
 * El enlace público con las fotos del recorrido, el que va en el correo al cliente (/guia-fotos/:token en la web).
 * Sin cuenta: lo protege el código al azar del enlace, que vence y se puede apagar, y un límite por conexión.
 */
@Controller('public/custodias/fotos')
@UseInterceptors(SinCacheInterceptor)
export class CustodiasFotosPublicasController {
  private readonly limite = new LimitePorIp(300, 10 * 60_000);

  constructor(private readonly enlaces: CustodiasEnlaceFotosService) {}

  @Get(':token')
  pagina(@Req() req: PeticionCampo, @Param('token') token: string) {
    exigirLimite(this.limite, req);
    return this.enlaces.pagina(token);
  }

  @Get(':token/:fotoId')
  async imagen(
    @Req() req: PeticionCampo,
    @Param('token') token: string,
    @Param('fotoId', ParseIntPipe) fotoId: number,
    @Query('miniatura') miniatura: string | undefined,
    @Res() res: Response,
  ) {
    exigirLimite(this.limite, req);
    const buffer = await this.enlaces.imagen(token, fotoId, miniatura === '1' || miniatura === 'true');
    res.setHeader('Content-Type', 'image/jpeg');
    res.setHeader('Content-Length', buffer.length.toString());
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.end(buffer);
  }
}
