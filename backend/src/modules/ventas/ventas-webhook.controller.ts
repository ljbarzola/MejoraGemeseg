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

@Controller('ventas/webhook')
export class VentasWebhookController {
  constructor(
    private readonly ventasService: VentasService,
    private readonly contratosService: VentasContratosService,
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

  // Público, sin sesión — SignWell llama directamente a esta ruta. La
  // verificación real está en handleSignWellWebhook (hash HMAC del propio
  // evento, ver ventas-contratos.service.ts).
  @Post('signwell')
  async signwellWebhook(@Body() body: any) {
    return this.contratosService.handleSignWellWebhook(body);
  }
}
