import { Injectable, Logger } from '@nestjs/common';
import { GoogleAuthService } from '../../../../common/services/google-auth.service';
import {
  modeloVertex,
  vertexLocation,
  vertexUrl,
} from '../../../../common/utils/vertex-endpoint.util';
import {
  buildEntregaPrompt,
  normalizarLecturaEntrega,
  type LecturaEntrega,
} from './entrega-revision.util';

export const TIPOS_LEIBLES_ENTREGA = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
] as const;

export const MAX_BYTES_ENTREGA = 15 * 1024 * 1024;

interface RespuestaVertex {
  candidates?: { content?: { parts?: { text?: string }[] } }[];
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
}

export interface ResultadoLecturaEntrega {
  lectura: LecturaEntrega;
  modelo: string;
  tokensEntrada: number | null;
  tokensSalida: number | null;
  duracionMs: number;
}

/** Un fallo del lector con un mensaje que se le puede mostrar a la persona. */
export class LecturaEntregaError extends Error {
  constructor(
    message: string,
    readonly modelo: string | null = null,
    readonly duracionMs: number | null = null,
  ) {
    super(message);
  }
}

/**
 * Mira un documento entregado con Gemini (Vertex AI) y describe lo que ve: si se lee, qué parece
 * ser, si lleva firma o sello y qué vencimiento dice. No decide nada (ver entrega-revision.util.ts).
 * No recibe el nombre pedido, la entidad ni el mes.
 */
@Injectable()
export class EntregaLectorService {
  private readonly logger = new Logger(EntregaLectorService.name);

  constructor(private readonly googleAuth: GoogleAuthService) {}

  private get project(): string {
    return process.env.GOOGLE_VERTEX_PROJECT || '';
  }

  estaConfigurado(): boolean {
    return !!this.project;
  }

  async leer(
    buffer: Buffer,
    mime: string,
    hoy: string,
    instruccionesDeLaEmpresa: string,
  ): Promise<ResultadoLecturaEntrega> {
    const modelo = modeloVertex('fuerte');
    const inicio = Date.now();
    const prompt = buildEntregaPrompt({ hoy, instruccionesDeLaEmpresa });

    let respuesta: Response;
    try {
      const token = await this.googleAuth.getAccessToken();
      respuesta = await fetch(vertexUrl(this.project, vertexLocation(), modelo), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          contents: [
            {
              role: 'user',
              parts: [
                { inlineData: { mimeType: mime, data: buffer.toString('base64') } },
                { text: prompt },
              ],
            },
          ],
          generationConfig: {
            temperature: 0,
            responseMimeType: 'application/json',
            maxOutputTokens: 2048,
            thinkingConfig: { thinkingBudget: 0 },
          },
        }),
      });
    } catch (err: unknown) {
      this.logger.error(`No se pudo llamar a Vertex AI: ${(err as Error).message}`);
      throw new LecturaEntregaError(
        'No se pudo conectar con el servicio de lectura. Vuelve a intentarlo en un momento.',
        modelo,
        Date.now() - inicio,
      );
    }

    if (!respuesta.ok) {
      const cuerpo = await respuesta.text();
      this.logger.error(`Vertex AI ${respuesta.status}: ${cuerpo.slice(0, 500)}`);
      throw new LecturaEntregaError(
        `El servicio de lectura respondió con un error (${respuesta.status}). Vuelve a intentarlo.`,
        modelo,
        Date.now() - inicio,
      );
    }

    const datos = (await respuesta.json()) as RespuestaVertex;
    const duracionMs = Date.now() - inicio;
    const crudo = (datos?.candidates?.[0]?.content?.parts ?? [])
      .map((p) => p?.text ?? '')
      .join('')
      .trim();
    const json = this.extraerJson(crudo);
    if (json === undefined) {
      this.logger.warn(`Respuesta del lector no es JSON: ${crudo.slice(0, 200)}`);
      throw new LecturaEntregaError(
        'No se pudo entender la respuesta del lector. Vuelve a intentarlo.',
        modelo,
        duracionMs,
      );
    }

    return {
      lectura: normalizarLecturaEntrega(json),
      modelo,
      tokensEntrada: datos?.usageMetadata?.promptTokenCount ?? null,
      tokensSalida: datos?.usageMetadata?.candidatesTokenCount ?? null,
      duracionMs,
    };
  }

  // El modelo a veces envuelve el JSON en ```json ... ```.
  private extraerJson(texto: string): unknown {
    if (!texto) return undefined;
    const cerco = texto.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
    try {
      return JSON.parse(cerco ? cerco[1] : texto);
    } catch {
      return undefined;
    }
  }
}
