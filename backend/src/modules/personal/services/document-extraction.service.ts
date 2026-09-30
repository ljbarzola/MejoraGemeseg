import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { DriveService } from './drive.service';
import { GoogleAuthService } from '../../../common/services/google-auth.service';
import pdfParse from 'pdf-parse';

// GitHub Models (gpt-4o-mini) se eliminó de todo el backend (2026-09-29) — este
// servicio ahora usa Google Vertex AI, mismo proveedor/credenciales que
// reclutamiento-ia.service.ts (que ya hace exactamente este tipo de llamada:
// una sola pasada, salida JSON estructurada). Comparte GOOGLE_VERTEX_MODEL con
// ese servicio a propósito — es la misma categoría de tarea (RRHH, análisis
// de documentos de un solo disparo), a diferencia del chat de Agente Gemeseg
// (ai/vertex-chat.client.ts), que es conversacional y tiene su propia
// variable GOOGLE_VERTEX_CHAT_MODEL para no acoplar ajustes de una tarea con
// la otra.
const MODEL = process.env.GOOGLE_VERTEX_MODEL || 'gemini-2.5-flash';

// Un documento con menos de este número de caracteres de texto "real" (sin
// contar espacios) casi seguro es un PDF escaneado/foto sin capa de texto —
// no tiene sentido gastar una llamada a la IA para eso.
const MIN_TEXT_LENGTH = 40;

// Estos son certificados/cédulas cortos, no documentos largos — 4000
// caracteres es de sobra, y limita el costo/tamaño de la llamada.
const MAX_TEXT_LENGTH = 4000;

export type ExtractExpiryReason =
  'SIN_TEXTO' | 'RESPUESTA_INVALIDA' | 'ERROR_DRIVE' | 'ERROR_IA';

export interface ExtractExpiryResult {
  success: boolean;
  reason?: ExtractExpiryReason;
  message?: string;
  fechaEmision?: string | null;
  fechaVencimiento?: string | null;
  confianza?: 'alta' | 'media' | 'baja';
  notas?: string | null;
  textoExtraido?: string;
}

interface AiDateGuess {
  fechaEmision: string | null;
  fechaVencimiento: string | null;
  confianza: 'alta' | 'media' | 'baja';
  notas: string | null;
}

// Fase B del módulo de cumplimiento por entidad: RRHH pide una PROPUESTA de
// fecha de emisión/vencimiento leída por IA sobre un documento ya sincronizado
// desde Drive. Este servicio NUNCA escribe en la base de datos — solo
// propone. El guardado sigue pasando exclusivamente por
// DriveService.setDocumentExpiry (PATCH .../drive/documents/:id/expiry), una
// vez que RRHH confirma o corrige los valores sugeridos.
//
// Deliberadamente fuera de alcance en esta primera pasada: OCR/visión para
// PDFs escaneados (sin capa de texto) — cuando el texto extraído es
// insuficiente, se falla de forma clara y visible en vez de intentar leer la
// imagen. Se evalúa agregar esa capacidad en una fase futura, según qué tan
// seguido resulte necesaria en la práctica.
@Injectable()
export class DocumentExtractionService {
  private readonly logger = new Logger(DocumentExtractionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly driveService: DriveService,
    private readonly googleAuth: GoogleAuthService,
  ) {}

  private get project(): string {
    return process.env.GOOGLE_VERTEX_PROJECT || '';
  }

  private get location(): string {
    return process.env.GOOGLE_VERTEX_LOCATION || 'us-central1';
  }

  async extractExpiry(
    driveFileId: string,
    companyId: number,
  ): Promise<ExtractExpiryResult> {
    if (!companyId)
      throw new BadRequestException('Usuario sin empresa asociada');

    // Mismo lookup que DriveService.setDocumentExpiry — confirma que el
    // documento pertenece a esta empresa antes de gastar nada en Drive/IA.
    const doc = await this.prisma.employeeDocument.findFirst({
      where: { driveFileId, companyId },
    });
    if (!doc)
      throw new BadRequestException(
        'Documento no encontrado para esta empresa.',
      );

    let buffer: Buffer;
    try {
      buffer = await this.driveService.downloadFileBuffer(driveFileId);
    } catch (err: any) {
      this.logger.error(
        `No se pudo descargar ${driveFileId} de Drive: ${err.message}`,
      );
      return {
        success: false,
        reason: 'ERROR_DRIVE',
        message: `No se pudo descargar el archivo desde Google Drive: ${err.message}`,
      };
    }

    let rawText = '';
    try {
      const parsed = await pdfParse(buffer);
      rawText = (parsed.text || '').trim();
    } catch (err: any) {
      // Un PDF corrupto, protegido con contraseña o de un formato que
      // pdf-parse no puede abrir cae en la misma respuesta que "sin texto
      // legible" — desde la perspectiva de RRHH el resultado es el mismo:
      // no se pudo leer, hay que poner la fecha a mano.
      this.logger.warn(`pdf-parse falló para ${driveFileId}: ${err.message}`);
      return this.sinTextoResult();
    }

    if (rawText.replace(/\s+/g, '').length < MIN_TEXT_LENGTH) {
      // Heurística de "sin capa de texto útil" (PDF escaneado/foto). No se
      // llama a la IA en este caso — no tendría con qué trabajar.
      return this.sinTextoResult();
    }

    const truncated = rawText.slice(0, MAX_TEXT_LENGTH);

    if (!this.project) {
      return {
        success: false,
        reason: 'ERROR_IA',
        message:
          'El servicio de IA no está configurado en este entorno (falta GOOGLE_VERTEX_PROJECT).',
      };
    }

    const guess = await this.callAiForDates(truncated);
    if (!guess) {
      return {
        success: false,
        reason: 'RESPUESTA_INVALIDA',
        message:
          'La IA no devolvió una respuesta interpretable para este documento. Ingresa la fecha manualmente.',
      };
    }

    return {
      success: true,
      fechaEmision: guess.fechaEmision,
      fechaVencimiento: guess.fechaVencimiento,
      confianza: guess.confianza,
      notas: guess.notas,
      // Para que RRHH pueda verificar de un vistazo qué texto leyó realmente
      // la IA, sin tener que abrir el PDF.
      textoExtraido: truncated.slice(0, 300),
    };
  }

  private sinTextoResult(): ExtractExpiryResult {
    return {
      success: false,
      reason: 'SIN_TEXTO',
      message:
        'No se pudo leer texto de este PDF automáticamente. Ingresa la fecha manualmente.',
    };
  }

  private buildPrompt(text: string): string {
    return `Eres un asistente que ayuda a Recursos Humanos de una empresa de seguridad privada a extraer fechas de documentos y certificados de sus guardias (cédulas, papeletas de votación, certificados médicos, cursos de capacitación, licencias, antecedentes penales, etc).

Analiza el siguiente texto, extraído automáticamente de un PDF, y determina la fecha de emisión y la fecha de vencimiento del documento.

Reglas importantes:
1. Si el documento indica una fecha de vencimiento EXPLÍCITA, úsala tal cual.
2. Si en cambio el documento indica un PERÍODO DE VALIDEZ en vez de una fecha exacta (por ejemplo "vigente por 2 años desde la fecha de emisión", "válido por 12 meses", "caduca a los 90 días de emitido"), CALCULA la fecha de vencimiento sumando ese período a la fecha de emisión. Esta es una capacidad importante: muchos certificados reales están redactados así — no te limites a devolver null en ese caso.
3. Si genuinamente no hay información suficiente para alguna de las dos fechas, devuelve null en ese campo en lugar de adivinar, y refleja esa incertidumbre bajando "confianza".
4. "confianza" es "alta" si ambas fechas quedan claras (explícitas, o calculadas con certeza a partir de un período explícito), "media" si tuviste que inferir o calcular con alguna ambigüedad menor, y "baja" si la información es escasa, ambigua o contradictoria.
5. "notas" es un campo breve y opcional: úsalo, por ejemplo, para explicar que calculaste el vencimiento a partir de un período de validez, o para señalar cualquier ambigüedad que un humano debería revisar. Si no hay nada que anotar, usa null.

Responde ÚNICAMENTE con un objeto JSON, sin texto adicional antes ni después, y sin bloques de código markdown (nada de \`\`\`), con exactamente esta forma:
{"fechaEmision": "YYYY-MM-DD" o null, "fechaVencimiento": "YYYY-MM-DD" o null, "confianza": "alta" o "media" o "baja", "notas": "string breve" o null}

Texto del documento:
"""
${text}
"""`;
  }

  private async callAiForDates(text: string): Promise<AiDateGuess | null> {
    const prompt = this.buildPrompt(text);

    try {
      const token = await this.googleAuth.getAccessToken();
      const url = `https://${this.location}-aiplatform.googleapis.com/v1/projects/${this.project}/locations/${this.location}/publishers/google/models/${MODEL}:generateContent`;

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.1,
            responseMimeType: 'application/json',
            maxOutputTokens: 400,
            // Clasificación de un solo disparo, no razonamiento — igual
            // criterio que reclutamiento-ia.service.ts.
            thinkingConfig: { thinkingBudget: 0 },
          },
        }),
      });

      if (!response.ok) {
        const errorBody = await response.text();
        this.logger.error(`Vertex AI ${response.status}: ${errorBody}`);
        return null;
      }

      const data: any = await response.json();
      const raw: string =
        data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
      return this.parseAiJson(raw);
    } catch (err: any) {
      this.logger.error(`Error llamando al modelo de IA: ${err.message}`);
      return null;
    }
  }

  /** Parseo defensivo: tolera bloques de código markdown y JSON malformado. */
  private parseAiJson(raw: string): AiDateGuess | null {
    if (!raw || !raw.trim()) return null;

    let cleaned = raw.trim();
    const fenceMatch = cleaned.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
    if (fenceMatch) cleaned = fenceMatch[1].trim();

    let obj: any;
    try {
      obj = JSON.parse(cleaned);
    } catch {
      this.logger.warn(
        `Respuesta de IA no es JSON válido: ${cleaned.slice(0, 200)}`,
      );
      return null;
    }

    if (!obj || typeof obj !== 'object') return null;

    const confianza: AiDateGuess['confianza'] = [
      'alta',
      'media',
      'baja',
    ].includes(obj.confianza)
      ? obj.confianza
      : 'baja';

    return {
      fechaEmision: this.normalizeDateField(obj.fechaEmision),
      fechaVencimiento: this.normalizeDateField(obj.fechaVencimiento),
      confianza,
      notas:
        typeof obj.notas === 'string' && obj.notas.trim()
          ? obj.notas.trim()
          : null,
    };
  }

  private normalizeDateField(value: unknown): string | null {
    if (typeof value !== 'string') return null;
    const match = value.match(/^\d{4}-\d{2}-\d{2}/);
    return match ? match[0] : null;
  }
}
