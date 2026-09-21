import { Injectable, Logger, BadRequestException } from '@nestjs/common';

@Injectable()
export class WhatsAppService {
  private readonly logger = new Logger(WhatsAppService.name);
  private twilioClient: any = null;

  private getClient() {
    if (this.twilioClient) return this.twilioClient;

    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    if (!accountSid || !authToken) {
      throw new BadRequestException(
        'WhatsApp no está configurado. Define TWILIO_ACCOUNT_SID y TWILIO_AUTH_TOKEN en las variables de entorno del servidor.',
      );
    }

    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const twilio = require('twilio');
      this.twilioClient = twilio(accountSid, authToken);
      return this.twilioClient;
    } catch (err: any) {
      this.logger.error(`Error al inicializar Twilio: ${err.message}`);
      throw new BadRequestException(
        'El paquete twilio no está instalado en el servidor.',
      );
    }
  }

  async sendText(params: {
    to: string;
    from: string;
    body: string;
  }): Promise<void> {
    const client = this.getClient();
    try {
      await client.messages.create({
        from: `whatsapp:${params.from}`,
        to: `whatsapp:${params.to}`,
        body: params.body,
      });
      this.logger.log(`WhatsApp enviado a ${params.to}`);
    } catch (err: any) {
      this.logger.error(`Error al enviar WhatsApp: ${err.message}`);
      throw new BadRequestException(
        `Error al enviar WhatsApp: ${err.message}`,
      );
    }
  }
}
