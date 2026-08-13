import { Controller, Post, Body, Query, Headers, BadRequestException } from '@nestjs/common';
import { VentasService } from './ventas.service';

@Controller('ventas/webhook')
export class VentasWebhookController {
  constructor(private readonly ventasService: VentasService) {}

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
      throw new BadRequestException('API Key no provista. Usa query param ?apiKey= o header X-API-KEY');
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
}
