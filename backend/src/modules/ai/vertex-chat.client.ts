import { Injectable, Logger } from '@nestjs/common';
import { GoogleAuthService } from '../../common/services/google-auth.service';

export interface ChatTurn {
  role: 'user' | 'assistant';
  content: string;
}

// Motor conversacional de Agente Gemeseg. Reemplaza a GitHub Models
// (gpt-4o-mini) — este proyecto ya paga por Google Vertex AI para RRHH
// (reclutamiento-ia.service.ts), así que el chat se mueve al mismo proveedor
// en vez de mantener dos integraciones de IA distintas.
//
// GOOGLE_VERTEX_CHAT_MODEL es una variable propia, separada de
// GOOGLE_VERTEX_MODEL (que usa RRHH para revisar documentos escaneados) —
// son tareas muy distintas (conversación de texto vs. clasificación de
// imágenes) con necesidades de modelo/tuning independientes; acoplarlas
// significaría que ajustar una rompe silenciosamente la otra.
@Injectable()
export class VertexChatClient {
  private readonly logger = new Logger(VertexChatClient.name);

  constructor(private readonly googleAuth: GoogleAuthService) {}

  private get project(): string {
    return process.env.GOOGLE_VERTEX_PROJECT || '';
  }

  private get location(): string {
    return process.env.GOOGLE_VERTEX_LOCATION || 'us-central1';
  }

  private get model(): string {
    return process.env.GOOGLE_VERTEX_CHAT_MODEL || 'gemini-2.5-flash';
  }

  estaConfigurado(): boolean {
    return !!this.project;
  }

  async sendChat(
    systemPrompt: string,
    history: ChatTurn[],
    newMessage: string,
  ): Promise<{ reply: string; tokensUsed: number }> {
    const token = await this.googleAuth.getAccessToken();
    const url = `https://${this.location}-aiplatform.googleapis.com/v1/projects/${this.project}/locations/${this.location}/publishers/google/models/${this.model}:generateContent`;

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
