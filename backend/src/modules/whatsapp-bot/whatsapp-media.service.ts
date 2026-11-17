import { Injectable, Logger } from '@nestjs/common';
import { GoogleAuthService } from '../../common/services/google-auth.service';
import { modeloVertex, vertexLocation, vertexUrl } from '../../common/utils/vertex-endpoint.util';
import { WhatsappMetaClient } from './whatsapp-meta.client';

const MIME_AUDIO = /^audio\/(ogg|mpeg|mp3|mp4|aac|amr|wav|x-wav|webm)/i;
const MIME_IMAGEN = /^image\/(jpeg|png|webp)/i;

// Lee lo que el cliente mandó que no es texto: transcribe un audio o describe una imagen para que el bot
// (y las personas) lo entiendan. Descarga el archivo de Meta y lo manda a Vertex como dato en línea; el
// archivo no se guarda en ningún lado. Si algo falla devuelve null y el mensaje pasa a una persona.
@Injectable()
export class WhatsappMediaService {
  private readonly logger = new Logger(WhatsappMediaService.name);

  constructor(
    private readonly meta: WhatsappMetaClient,
    private readonly googleAuth: GoogleAuthService,
  ) {}

  async leer(media: { tipo: 'audio' | 'imagen'; mediaId: string; mime: string }): Promise<string | null> {
    const project = process.env.GOOGLE_VERTEX_PROJECT || '';
    if (!project) return null;
    const archivo = await this.meta.descargarMedia(media.mediaId);
    if (!archivo) return null;
    const mime = (archivo.mime || media.mime).split(';')[0].trim();
    if (media.tipo === 'audio' ? !MIME_AUDIO.test(mime) : !MIME_IMAGEN.test(mime)) return null;

    const instruccion =
      media.tipo === 'audio'
        ? 'Transcribe este audio de WhatsApp tal cual, en español, sin comentarios ni formato. Si no se entiende nada, responde exactamente: NO_ENTENDIBLE'
        : 'Describe en una o dos frases, en español, qué muestra esta imagen enviada por un cliente de una empresa de seguridad (equipos, lugar, documento, etc.). Si trae texto relevante, transcríbelo. No inventes. Si no se entiende, responde exactamente: NO_ENTENDIBLE';
    try {
      const token = await this.googleAuth.getAccessToken();
      const url = vertexUrl(project, vertexLocation(), modeloVertex('ligero', 'chat'));
      const resp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          contents: [
            {
              role: 'user',
              parts: [{ inlineData: { mimeType: mime, data: archivo.datos.toString('base64') } }, { text: instruccion }],
            },
          ],
          generationConfig: { temperature: 0, maxOutputTokens: 600, thinkingConfig: { thinkingBudget: 0 } },
        }),
      });
      if (!resp.ok) {
        this.logger.error(`Vertex (${media.tipo}) ${resp.status}: ${(await resp.text()).slice(0, 300)}`);
        return null;
      }
      const data: any = await resp.json();
      const texto: string = (data?.candidates?.[0]?.content?.parts?.[0]?.text ?? '').trim();
      if (!texto || texto === 'NO_ENTENDIBLE') return null;
      return media.tipo === 'audio' ? `[Audio del cliente, transcrito] ${texto}` : `[Imagen del cliente, descrita] ${texto}`;
    } catch (err) {
      this.logger.error(`No se pudo leer el ${media.tipo}: ${(err as Error).message}`);
      return null;
    }
  }
}
