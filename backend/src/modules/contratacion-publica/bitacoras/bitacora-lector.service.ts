import { Injectable, Logger } from '@nestjs/common';
import { GoogleAuthService } from '../../../common/services/google-auth.service';
import {
  modeloVertex,
  vertexLocation,
  vertexUrl,
} from '../../../common/utils/vertex-endpoint.util';
import { normalizarLectura, type LecturaBitacora } from './bitacora.util';
import { buildBitacoraPrompt } from './bitacora-prompt.util';

export const TIPOS_ARCHIVO_BITACORA = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
  'application/pdf',
] as const;

export const MAX_BYTES_BITACORA = 15 * 1024 * 1024;

interface RespuestaVertex {
  candidates?: { content?: { parts?: { text?: string }[] } }[];
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
}

export interface ResultadoLectura {
  lectura: LecturaBitacora;
  modelo: string;
  tokensEntrada: number | null;
  tokensSalida: number | null;
  duracionMs: number;
}

/** Un fallo del lector con un mensaje que se le puede mostrar a la persona. */
export class LecturaBitacoraError extends Error {
  constructor(
    message: string,
    readonly modelo: string | null = null,
    readonly duracionMs: number | null = null,
  ) {
    super(message);
  }
}

/**
 * Lee la foto de una bitácora con Gemini (Vertex AI) y devuelve lo transcrito.
 * Solo transcribe: no recibe el horario ni los nombres de los guardias (ver
 * bitacora-prompt.util.ts). Nivel 'fuerte' porque es letra a mano y un error de
 * lectura se convierte en una acusación falsa contra un guardia.
 */
@Injectable()
export class BitacoraLectorService {
  private readonly logger = new Logger(BitacoraLectorService.name);

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
    instruccionesDeLaEmpresa: string,
  ): Promise<ResultadoLectura> {
    const modelo = modeloVertex('fuerte');
    const inicio = Date.now();
    const prompt = buildBitacoraPrompt({
      hoy: new Date().toISOString().slice(0, 10),
      instruccionesDeLaEmpresa,
    });

    let respuesta: Response;
    try {
      const token = await this.googleAuth.getAccessToken();
      respuesta = await fetch(
        vertexUrl(this.project, vertexLocation(), modelo),
        {
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
                  {
                    inlineData: {
                      mimeType: mime,
                      data: buffer.toString('base64'),
                    },
                  },
                  { text: prompt },
                ],
              },
            ],
            generationConfig: {
              temperature: 0,
              responseMimeType: 'application/json',
              maxOutputTokens: 8192,
              thinkingConfig: { thinkingBudget: 0 },
            },
          }),
        },
      );
    } catch (err: unknown) {
      this.logger.error(
        `No se pudo llamar a Vertex AI: ${(err as Error).message}`,
      );
      throw new LecturaBitacoraError(
        'No se pudo conectar con el servicio de lectura. Vuelve a intentarlo en un momento.',
        modelo,
        Date.now() - inicio,
      );
    }

    if (!respuesta.ok) {
      const cuerpo = await respuesta.text();
      this.logger.error(
        `Vertex AI ${respuesta.status}: ${cuerpo.slice(0, 500)}`,
      );
      throw new LecturaBitacoraError(
        `El servicio de lectura respondió con un error (${respuesta.status}). Vuelve a intentarlo o transcribe la hoja a mano.`,
        modelo,
        Date.now() - inicio,
      );
    }

    const datos = (await respuesta.json()) as RespuestaVertex;
    const duracionMs = Date.now() - inicio;
    const crudo: string = (datos?.candidates?.[0]?.content?.parts ?? [])
      .map((p) => p?.text ?? '')
      .join('')
      .trim();
    const json = this.extraerJson(crudo);
    if (json === undefined) {
      this.logger.warn(
        `Respuesta del lector no es JSON: ${crudo.slice(0, 200)}`,
      );
      throw new LecturaBitacoraError(
        'No se pudo entender la respuesta del lector. Vuelve a intentarlo o transcribe la hoja a mano.',
        modelo,
        duracionMs,
      );
    }

    return {
      lectura: normalizarLectura(json),
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
