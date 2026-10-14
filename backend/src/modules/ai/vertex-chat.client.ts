import { Injectable, Logger } from '@nestjs/common';
import { GoogleAuthService } from '../../common/services/google-auth.service';
import {
  modeloVertex,
  NivelModelo,
  vertexLocation,
  vertexUrl,
} from '../../common/utils/vertex-endpoint.util';

export interface ChatTurn {
  role: 'user' | 'assistant';
  content: string;
}

// Motor conversacional de Agente Gemeseg. Reemplaza a GitHub Models
// (gpt-4o-mini) — este proyecto ya paga por Google Vertex AI para RRHH
// (reclutamiento-ia.service.ts), así que el chat se mueve al mismo proveedor
// en vez de mantener dos integraciones de IA distintas.
//
// El modelo sale de dos niveles (ver common/utils/vertex-endpoint.util.ts):
// el Agente Gemeseg usa 'ligero' (el valor por defecto). El nivel 'fuerte' queda
// disponible para quien lo pida. Si el nivel no está configurado cae a
// GOOGLE_VERTEX_CHAT_MODEL, la variable de antes.
@Injectable()
export class VertexChatClient {
  private readonly logger = new Logger(VertexChatClient.name);

  constructor(private readonly googleAuth: GoogleAuthService) {}

  private get project(): string {
    return process.env.GOOGLE_VERTEX_PROJECT || '';
  }

  private get location(): string {
    return vertexLocation();
  }

  estaConfigurado(): boolean {
    return !!this.project;
  }

  // Modelo que atiende un nivel; lo usa también el registro de uso (AiLog).
  modeloPara(nivel: NivelModelo): string {
    return modeloVertex(nivel, 'chat');
  }

  async sendChat(
    systemPrompt: string,
    history: ChatTurn[],
    newMessage: string,
    opciones?: { nivel?: NivelModelo },
  ): Promise<{ reply: string; tokensUsed: number }> {
    const token = await this.googleAuth.getAccessToken();
    const url = vertexUrl(
      this.project,
      this.location,
      this.modeloPara(opciones?.nivel ?? 'ligero'),
    );

    const contents = [
      ...history.map((turn) => ({
        role: turn.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: turn.content }],
      })),
      { role: 'user', parts: [{ text: newMessage }] },
    ];

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        contents,
        systemInstruction: { parts: [{ text: systemPrompt }] },
        generationConfig: {
          temperature: 0.5,
          // 1024 se quedaba corto de forma consistente (~1 de cada 3
          // llamadas llegaba con la respuesta cortada a mitad de la etiqueta
          // [INTENCION: ...], que entonces nunca se reconocía). El costo
          // extra de subir el tope es mínimo frente a romper la detección de
          // intención.
          maxOutputTokens: 2048,
          // Chat de preguntas y respuestas, no razonamiento encadenado — igual
          // que en reclutamiento-ia.service.ts, desactivarlo evita que el
          // "thinking" se coma el cupo de salida de forma impredecible.
          thinkingConfig: { thinkingBudget: 0 },
        },
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      this.logger.error(`Vertex AI ${response.status}: ${errorBody}`);
      throw new Error(`El servicio de IA respondió ${response.status}`);
    }

    const data: any = await response.json();
    const text: string | undefined =
      data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    const tokensUsed: number = data?.usageMetadata?.totalTokenCount || 0;

    return { reply: text || 'No pude generar una respuesta.', tokensUsed };
  }
}
