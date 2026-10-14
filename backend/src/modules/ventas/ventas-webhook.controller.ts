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
import { atribuirCanal, extraerAtribucion } from './lead-atribucion.util';

@Controller('ventas/webhook')
export class VentasWebhookController {
  constructor(
    private readonly ventasService: VentasService,
    private readonly contratosService: VentasContratosService,
    private readonly leadsService: VentasLeadsService,
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
    // completa en `extra`. `servicio` y `landing` también: sirven para sugerir el
    // servicio al convertir y para el embudo por landing.
    const atribucion = extraerAtribucion(body);
    const texto = (v: unknown, max: number) => {
      const t = (v ?? '').toString().trim();
      return t ? t.slice(0, max) : undefined;
    };
    const r = await this.leadsService.ingresar(companyId, {
      name: body?.name ?? body?.fullName,
      email: body?.email,
      phone: body?.phone,
      companyName: body?.companyName,
      message: body?.message,
      channel: atribuirCanal(atribucion),
      campaign: body?.campaign ?? atribucion['utm_campaign'],
      externalId: body?.externalId,
      extra: {
        ...atribucion,
        ...(texto(body?.servicio, 120) ? { servicio: texto(body?.servicio, 120) } : {}),
        ...(texto(body?.landing, 80) ? { landing: texto(body?.landing, 80) } : {}),
        ...(texto(body?.pageUrl, 300) ? { pageUrl: texto(body?.pageUrl, 300) } : {}),
      },
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
