import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Headers,
  HttpCode,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { SectionPermissionGuard } from '../../common/guards/section-permission.guard';
import { Section } from '../../common/decorators/section.decorator';
import { WhatsappBotService } from './whatsapp-bot.service';
import { WhatsappMetaClient } from './whatsapp-meta.client';
import { firmaValida } from './whatsapp-bot.util';

// Aviso de Meta: SIN sesión. Lo protege la firma HMAC de cada aviso (X-Hub-Signature-256) con el
// secreto de la app; sin firma válida se rechaza. Meta confirma la URL con un GET y el token de
// verificación que se puso al registrar el webhook.
@Controller('ventas/whatsapp-bot/webhook')
export class WhatsappBotWebhookController {
  constructor(
    private readonly bot: WhatsappBotService,
    private readonly meta: WhatsappMetaClient,
  ) {}

  @Get()
  verificar(
    @Query('hub.mode') modo: string,
    @Query('hub.verify_token') token: string,
    @Query('hub.challenge') desafio: string,
    @Res() res: any,
  ) {
    const esperado = this.meta.verifyToken;
    if (modo === 'subscribe' && esperado && token === esperado) {
      return res.status(200).type('text/plain').send(String(desafio ?? ''));
    }
    return res.status(403).send('Verificación rechazada');
  }

  @Post()
  @HttpCode(200)
  async recibir(@Req() req: any, @Headers('x-hub-signature-256') firma: string, @Body() body: unknown) {
    if (!firmaValida(req.rawBody, firma, this.meta.appSecret)) {
      throw new ForbiddenException('Firma inválida');
    }
    await this.bot.procesarAviso(body);
    return { success: true };
  }
}

// Bandeja «Conversaciones» (Ventas): todas las rutas piden sesión y la sección VENTAS.
@Controller('ventas/conversaciones')
@UseGuards(AuthGuard('jwt'), SectionPermissionGuard)
export class WhatsappBotController {
  constructor(
    private readonly bot: WhatsappBotService,
    private readonly meta: WhatsappMetaClient,
  ) {}

  @Get()
  @Section('VENTAS', 'view')
  listar(@Req() req: any, @Query('filtro') filtro?: string) {
    return this.bot.listar(req.user.companyId, filtro);
  }

  @Get('ajustes')
  @Section('VENTAS', 'view')
  async ajustes(@Req() req: any) {
    return { ...(await this.bot.ajustes(req.user.companyId)), conectado: this.meta.estaConfigurado() };
  }

  @Put('ajustes')
  @Section('VENTAS', 'write')
  guardarAjustes(@Req() req: any, @Body() body: any) {
    return this.bot.guardarAjustes(req.user.companyId, req.user.userId, {
      phoneNumberId: body?.phoneNumberId,
      activo: typeof body?.activo === 'boolean' ? body.activo : undefined,
      modo: body?.modo,
      conocimiento: body?.conocimiento,
      horario: body?.horario,
      guion: body?.guion,
      plantilla: body?.plantilla,
      cotizacion: body?.cotizacion,
    });
  }

  // Solo para probar en local: simula que un cliente escribió, sin pasar por Meta.
  @Post('simular')
  @Section('VENTAS', 'write')
  simular(@Req() req: any, @Body() body: any) {
    if (process.env.NODE_ENV === 'production') {
      throw new ForbiddenException('La simulación solo está disponible fuera de producción.');
    }
    if (!body?.telefono || !body?.texto) {
      throw new BadRequestException('Indica el teléfono y el mensaje del cliente.');
    }
    return this.bot.recibirMensaje(req.user.companyId, {
      telefono: String(body.telefono),
      nombre: body?.nombre ? String(body.nombre) : null,
      texto: String(body.texto),
    });
  }

  @Get(':id')
  @Section('VENTAS', 'view')
  detalle(@Req() req: any, @Param('id', ParseIntPipe) id: number) {
    return this.bot.detalle(req.user.companyId, id);
  }

  @Post(':id/tomar')
  @HttpCode(200)
  @Section('VENTAS', 'write')
  tomar(@Req() req: any, @Param('id', ParseIntPipe) id: number) {
    return this.bot.tomar(req.user.companyId, req.user.userId, id);
  }

  @Post(':id/devolver')
  @HttpCode(200)
  @Section('VENTAS', 'write')
  devolver(@Req() req: any, @Param('id', ParseIntPipe) id: number) {
    return this.bot.devolver(req.user.companyId, id);
  }

  @Post(':id/escribir')
  @HttpCode(200)
  @Section('VENTAS', 'write')
  escribir(@Req() req: any, @Param('id', ParseIntPipe) id: number, @Body() body: any) {
    return this.bot.escribir(req.user.companyId, req.user.userId, id, body?.texto);
  }

  @Post(':id/mensajes/:mensajeId/aprobar')
  @HttpCode(200)
  @Section('VENTAS', 'write')
  aprobar(
    @Req() req: any,
    @Param('id', ParseIntPipe) id: number,
    @Param('mensajeId', ParseIntPipe) mensajeId: number,
    @Body() body: any,
  ) {
    return this.bot.aprobar(req.user.companyId, req.user.userId, id, mensajeId, body?.texto);
  }

  @Post(':id/mensajes/:mensajeId/descartar')
  @HttpCode(200)
  @Section('VENTAS', 'write')
  descartar(
    @Req() req: any,
    @Param('id', ParseIntPipe) id: number,
    @Param('mensajeId', ParseIntPipe) mensajeId: number,
  ) {
    return this.bot.descartar(req.user.companyId, id, mensajeId);
  }
}
