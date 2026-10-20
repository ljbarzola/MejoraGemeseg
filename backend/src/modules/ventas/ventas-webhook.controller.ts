import {
  Controller,
  Post,
  Body,
  Query,
  Headers,
  BadRequestException,
} from '@nestjs/common';
import { VentasService } from './ventas.service';
import { VentasContratosService } from './ventas-contratos.service';
import { VentasLeadsService } from './ventas-leads.service';
import { VentasConfigService } from './ventas-config.service';
import { atribuirCanal, extraerAtribucion } from './lead-atribucion.util';
import { datosDeLanding } from './lead-landing.util';
import { fechaDeRecepcion } from './lead-recepcion.util';

@Controller('ventas/webhook')
export class VentasWebhookController {
  constructor(
    private readonly ventasService: VentasService,
    private readonly contratosService: VentasContratosService,
    private readonly leadsService: VentasLeadsService,
    private readonly configService: VentasConfigService,
  ) {}

  @Post('lead')
  async ingestLead(
    @Query('apiKey') queryKey: string,
    @Headers('x-api-key') headerKey: string,
    @Body()
    body: {
      fullName: string;
      email?: string;
      phone?: string;
      companyName?: string;
      source?: string;
      campaignName?: string;
      estimatedValue?: number;
      notes?: string;
    },
  ) {
    const apiKey = queryKey || headerKey;
    if (!apiKey) {
      throw new BadRequestException(
        'API Key no provista. Usa query param ?apiKey= o header X-API-KEY',
      );
    }
    if (!body?.fullName) {
      throw new BadRequestException('El campo fullName es obligatorio');
    }

    const lead = await this.ventasService.ingestLeadFromWebhook(apiKey, body);
    return {
      success: true,
      message: 'Prospecto ingresado y asignado exitosamente',
      leadId: lead.id,
      assignedUserId: lead.assignedUserId,
    };
  }

  // Formulario web propio (2026-10-07). El sitio NO debe llamar a esta ruta
  // desde el navegador: la clave iría a la vista de todos. Tiene que pasar por
  // una función del servidor (p. ej. de Vercel) que guarde la clave. Llega a la
  // bandeja de Leads, sin asignar a nadie. `website` es un campo trampa oculto:
  // si viene lleno es un robot y se responde bien sin guardar nada.
  @Post('entrante')
  async ingresarEntrante(
    @Query('apiKey') queryKey: string,
    @Headers('x-api-key') headerKey: string,
    @Body() body: any,
  ) {
    const apiKey = queryKey || headerKey;
    if (!apiKey) {
      throw new BadRequestException(
        'Falta la clave de la conexión. Usa el encabezado X-API-KEY o ?apiKey=',
      );
    }
    const companyId = await this.leadsService.empresaDeClave(apiKey);
    if (body?.website) return { success: true };
    // Atribución (UTM, gclid, fbclid, li_fat_id): decide el canal y se guarda
    // completa en `extra`. Lo propio de la landing (servicio y línea comercial
    // según su dirección, situación, consentimiento) sale de `datosDeLanding`.
    const atribucion = extraerAtribucion(body);
    // La tabla de landings es de cada empresa (Ventas → Configuración).
    const landing = datosDeLanding(body, await this.configService.landingsDe(companyId));
    const r = await this.leadsService.ingresar(companyId, {
      // Las landings de WordPress mandan los nombres en español (nombre,
      // correo, telefono): se aceptan tal cual para no obligar a traducirlos.
      name: body?.name ?? body?.fullName ?? body?.nombre,
      email: body?.email ?? body?.correo,
      phone: body?.phone ?? body?.telefono,
      companyName: body?.companyName ?? body?.empresa,
      message: landing.message,
      channel: atribuirCanal(atribucion),
      campaign: body?.campaign ?? atribucion['utm_campaign'],
      externalId: body?.externalId,
      // Si la web mandó el lead con retraso (cola de WordPress detenida), conserva la fecha en que llegó de verdad.
      recibidoEn: fechaDeRecepcion(body?.recibidoEn),
      extra: { ...atribucion, ...landing.extra },
    });
    return { success: true, leadId: r.lead.id, duplicado: !r.nuevo };
  }

  // Formulario de anuncio de Google Ads: Google hace POST aquí con la clave en
  // `google_key`. Siempre responde 200 si la clave es válida, incluso al botón
  // de prueba (que no guarda nada).
  @Post('google-ads')
  async googleAds(@Body() body: any) {
    return this.leadsService.ingresarDesdeGoogle(body);
  }

  // Público, sin sesión — SignWell llama directamente a esta ruta. La
  // verificación real está en handleSignWellWebhook (hash HMAC del propio
  // evento, ver ventas-contratos.service.ts).
  @Post('signwell')
  async signwellWebhook(@Body() body: any) {
    return this.contratosService.handleSignWellWebhook(body);
  }
}
