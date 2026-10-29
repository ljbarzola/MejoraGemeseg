import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { BitacoraExtensionService } from './bitacora-extension.service';
import {
  ExtensionTokenGuard,
  type PeticionExtension,
} from './bitacora-extension.guard';

export interface PeticionVinculo {
  ip?: string;
  headers: Record<string, string | string[] | undefined>;
}

/**
 * Lo que usa la extensión del navegador. No lleva sesión de usuario: `vincular`
 * es público (se protege con el código de un solo uso y un límite de intentos) y
 * el resto va con el token que la extensión recibió al vincularse. La ruta
 * `/bitacora/...` queda fuera del registro de acciones, así que lo que envía la
 * extensión nunca cuenta como actividad en app.gemeseg.
 */
@Controller('bitacora/ext')
export class BitacoraExtensionController {
  constructor(private readonly extension: BitacoraExtensionService) {}

  @Post('vincular')
  @HttpCode(200)
  vincular(@Req() req: PeticionVinculo, @Body() body: Record<string, unknown>) {
    return this.extension.vincular(body?.codigo, body?.equipo, ipDe(req));
  }

  /** Estado y horario: la extensión lo consulta cada rato para saber si le toca registrar. */
  @Get('config')
  @UseGuards(ExtensionTokenGuard)
  config(@Req() req: PeticionExtension) {
    return this.extension.configuracion(req.extension!);
  }

  @Post('eventos')
  @HttpCode(200)
  @UseGuards(ExtensionTokenGuard)
  eventos(
    @Req() req: PeticionExtension,
    @Body() body: Record<string, unknown>,
  ) {
    return this.extension.recibirTramos(req.extension!, body?.tramos);
  }

  @Post('desvincular')
  @HttpCode(200)
  @UseGuards(ExtensionTokenGuard)
  async desvincular(@Req() req: PeticionExtension) {
    await this.extension.desvincular(req.extension!);
    return { ok: true };
  }
}

/** Dirección de quien llama (Cloud Run y Firebase Hosting la dejan en x-forwarded-for). */
function ipDe(req: PeticionVinculo): string {
  const reenviada = req.headers['x-forwarded-for'];
  const texto = Array.isArray(reenviada) ? reenviada[0] : reenviada;
  const ultima = texto?.split(',').pop()?.trim();
  return ultima || req.ip || 'desconocida';
}
