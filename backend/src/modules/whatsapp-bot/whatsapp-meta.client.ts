import { Injectable, Logger } from '@nestjs/common';

export interface ResultadoEnvio {
  ok: boolean;
  metaId?: string;
  simulado?: boolean;
  error?: string;
}

// Envío por la API oficial de WhatsApp de Meta (Cloud API). Las credenciales van en variables de
// entorno / Secret Manager, nunca en la base de datos:
//   WHATSAPP_ACCESS_TOKEN   token permanente del usuario del sistema de Meta
//   WHATSAPP_APP_SECRET     secreto de la app (valida la firma de cada aviso entrante)
//   WHATSAPP_VERIFY_TOKEN   texto que se pone al registrar el webhook en Meta
//   WHATSAPP_API_VERSION    opcional (por defecto v21.0)
// Sin token, fuera de producción el envío se SIMULA (queda marcado) para poder probar en local;
// en producción sin token falla a propósito: nunca debe aparentar que un mensaje salió.
@Injectable()
export class WhatsappMetaClient {
  private readonly logger = new Logger(WhatsappMetaClient.name);

  get token(): string {
    return process.env.WHATSAPP_ACCESS_TOKEN || '';
  }

  get appSecret(): string {
    return process.env.WHATSAPP_APP_SECRET || '';
  }

  get verifyToken(): string {
    return process.env.WHATSAPP_VERIFY_TOKEN || '';
  }

  estaConfigurado(): boolean {
    return !!this.token;
  }

  async enviarTexto(phoneNumberId: string, para: string, texto: string): Promise<ResultadoEnvio> {
    if (!this.token) {
      if (process.env.NODE_ENV === 'production') {
        return { ok: false, error: 'WhatsApp no está configurado en el servidor (falta el token de Meta).' };
      }
      return { ok: true, simulado: true };
    }
    if (!phoneNumberId) return { ok: false, error: 'Falta el identificador del número de WhatsApp.' };
    const version = process.env.WHATSAPP_API_VERSION || 'v21.0';
    try {
      const resp = await fetch(`https://graph.facebook.com/${version}/${phoneNumberId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.token}` },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: para,
          type: 'text',
          text: { preview_url: false, body: texto },
        }),
      });
      const data: any = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        // El detalle de Meta queda solo en el log del servidor.
        this.logger.error(`Meta ${resp.status}: ${JSON.stringify(data?.error ?? data)}`);
        return { ok: false, error: 'WhatsApp no aceptó el mensaje. Revisa que el número esté activo e inténtalo de nuevo.' };
      }
      return { ok: true, metaId: String(data?.messages?.[0]?.id ?? '') || undefined };
    } catch (err) {
      this.logger.error(`No se pudo contactar a Meta: ${(err as Error).message}`);
      return { ok: false, error: 'No se pudo conectar con WhatsApp. Inténtalo de nuevo en unos minutos.' };
    }
  }

  private get version(): string {
    return process.env.WHATSAPP_API_VERSION || 'v21.0';
  }

  // Plantilla aprobada por Meta: es lo único que WhatsApp deja enviar pasadas 24 h del último mensaje del
  // cliente. Lleva un solo parámetro de texto ({{1}}), normalmente el nombre.
  async enviarPlantilla(
    phoneNumberId: string,
    para: string,
    nombre: string,
    idioma: string,
    parametro: string,
  ): Promise<ResultadoEnvio> {
    if (!this.token) {
      if (process.env.NODE_ENV === 'production') {
        return { ok: false, error: 'WhatsApp no está configurado en el servidor (falta el token de Meta).' };
      }
      return { ok: true, simulado: true };
    }
    if (!phoneNumberId) return { ok: false, error: 'Falta el identificador del número de WhatsApp.' };
    try {
      const resp = await fetch(`https://graph.facebook.com/${this.version}/${phoneNumberId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.token}` },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to: para,
          type: 'template',
          template: {
            name: nombre,
            language: { code: idioma || 'es' },
            components: parametro
              ? [{ type: 'body', parameters: [{ type: 'text', text: parametro.slice(0, 60) }] }]
              : [],
          },
        }),
      });
      const data: any = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        this.logger.error(`Meta (plantilla) ${resp.status}: ${JSON.stringify(data?.error ?? data)}`);
        return { ok: false, error: 'WhatsApp no aceptó la plantilla. Revisa que esté aprobada en Meta y que el nombre e idioma coincidan.' };
      }
      return { ok: true, metaId: String(data?.messages?.[0]?.id ?? '') || undefined };
    } catch (err) {
      this.logger.error(`No se pudo contactar a Meta: ${(err as Error).message}`);
      return { ok: false, error: 'No se pudo conectar con WhatsApp. Inténtalo de nuevo en unos minutos.' };
    }
  }

  // Descarga un audio o imagen que mandó el cliente (Meta da primero una URL temporal y luego el archivo,
  // ambos con el token). Tope de 8 MB. Devuelve null si algo falla: el mensaje pasa a una persona.
  async descargarMedia(mediaId: string): Promise<{ datos: Buffer; mime: string } | null> {
    if (!this.token || !mediaId) return null;
    try {
      const meta = await fetch(`https://graph.facebook.com/${this.version}/${encodeURIComponent(mediaId)}`, {
        headers: { Authorization: `Bearer ${this.token}` },
      });
      const info: any = await meta.json().catch(() => ({}));
      if (!meta.ok || !info?.url) return null;
      if ((info.file_size ?? 0) > 8 * 1024 * 1024) return null;
      const archivo = await fetch(String(info.url), { headers: { Authorization: `Bearer ${this.token}` } });
      if (!archivo.ok) return null;
      const datos = Buffer.from(await archivo.arrayBuffer());
      if (datos.length > 8 * 1024 * 1024) return null;
      return { datos, mime: String(info.mime_type || archivo.headers.get('content-type') || 'application/octet-stream') };
    } catch (err) {
      this.logger.error(`No se pudo descargar el archivo de WhatsApp: ${(err as Error).message}`);
      return null;
    }
  }
}
