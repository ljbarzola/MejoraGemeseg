import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { google } from 'googleapis';
import { PDFDocument } from 'pdf-lib';
import * as fs from 'fs';
import * as path from 'path';
import { PrismaService } from '../../../prisma/prisma.service';
import { DriveService } from './drive.service';
import {
  ANALISIS_IA_FILENAME,
  ANALISIS_IA_PENDIENTE_FILENAME,
  REVISION_ARCHIVOS_IA_FILENAME,
} from '../constants/employee-document-exclusions';

// Modelo de Vertex AI. Se elige un Flash (no Flash-Lite) a propósito: el caso
// real de este módulo son PDFs ESCANEADOS (fotos de cédula/papeleta tomadas con
// el celular), donde la calidad de lectura de imagen importa más que el ahorro.
//
// gemini-2.5-flash es el más nuevo que este proyecto de GCP puede usar hoy:
// verificado el 2026-09-16 contra `agentes-504115`/us-central1, donde toda la
// serie Gemini 3.x (3-flash, 3.7, 3.8, 3.1-flash-lite, 3-pro) responde 404
// NOT_FOUND — el proyecto no tiene acceso a esos modelos todavía.
//
// ⚠️ ATENCIÓN: Google anunció la retirada de los modelos Gemini 2.5 para el
// 16 de octubre de 2026. Cuando llegue esa fecha, esto deja de responder. Hay
// que conseguir acceso a la serie 3.x en el proyecto y mover la variable
// GOOGLE_VERTEX_MODEL — por eso es configurable por entorno y no una constante
// a secas: el cambio no debería requerir un despliegue de código.
const MODEL = process.env.GOOGLE_VERTEX_MODEL || 'gemini-2.5-flash';

// Tope de tamaño del PDF que se manda al modelo. Un expediente de postulante
// razonable pesa muy por debajo de esto; más que esto casi siempre es un PDF
// con fotos sin comprimir, y conviene cortar con un mensaje claro en vez de
// intentarlo y que falle con un error opaco del API.
const MAX_PDF_BYTES = 15 * 1024 * 1024;

// El prompt vive como un registro de `Agent` (mismo modelo que usa el chat de
// /agentes), NO como una constante de código — así RRHH/admin puede afinar el
// criterio de análisis (qué cuenta como "borroso", qué tan estricto ser, tono,
// etc.) desde la pantalla de Agentes, sin depender de un despliegue, y el
// mismo "revisor de documentos" queda disponible para que otras partes de la
// app lo reutilicen (basta con leer este Agent por nombre). `createdBy: null`
// lo marca como agente de sistema, igual que "Agente GEMESEG" en ai.service.ts.
//
// Solo la parte de CRITERIO va en el Agent. La lista de documentos requeridos,
// el total de páginas y el contrato de salida en JSON los agrega el código
// siempre, en cada llamada — si esa parte fuera editable y alguien la borra
// por error, el parseo de la respuesta se rompe. Con esta división, lo peor
// que puede pasar si RRHH deja el criterio vacío es una respuesta más pobre,
// nunca una que no se pueda interpretar.
const DOCUMENT_REVIEWER_AGENT_NAME = 'Revisor de Documentos (IA)';

const DEFAULT_DOCUMENT_REVIEWER_INSTRUCTIONS = `Eres un asistente de Recursos Humanos de una empresa de seguridad privada en Ecuador. Te entregan un archivo (o parte del expediente de un postulante) y una lista de documentos requeridos, y debes identificar en qué páginas está cada uno.

Reglas:
1. Revisa el archivo página por página. Muchas páginas son FOTOS o ESCANEOS (cédulas, papeletas de votación, certificados) — léelas como imágenes, no esperes texto seleccionable.
2. Para cada documento requerido, indica el rango de páginas donde aparece, numerando desde 1 (la primera página del archivo es la página 1).
3. Un documento puede ocupar una sola página o varias consecutivas.
4. Si un documento requerido NO está, devuelve null en sus páginas. No inventes ubicaciones: es peor asignar mal un documento que declararlo ausente.
5. "probabilidad" es un entero de 0 a 100: qué tan seguro estás de que esas páginas SON ese documento y no otro. "confianza" tiene que coincidir con ese número (alta solo desde 85, y solo si puedes citar texto visible que nombre el documento). Si la página es otra cosa, no la asignes.
6. "notas" es un texto breve y opcional para señalar algo que un humano debería revisar (imagen borrosa, documento cortado, parece vencido). Usa null si no hay nada que anotar.
7. No uses el mismo rango de páginas para dos documentos distintos salvo que genuinamente compartan página.`;

export type AnalisisReason =
  | 'NO_CONFIGURADO'
  | 'SIN_PDF'
  | 'VARIOS_PDF'
  | 'SIN_REQUISITOS'
  | 'PDF_ILEGIBLE'
  | 'PDF_MUY_GRANDE'
  | 'ERROR_DRIVE'
  | 'ERROR_IA'
  | 'RESPUESTA_INVALIDA'
  // El modelo se quedó sin espacio de salida antes de completar el JSON —
  // observado con gemini-2.5-flash cuando el "thinking" (razonamiento interno,
  // que también consume el cupo de maxOutputTokens) se come todo el
  // presupuesto. Se distingue de RESPUESTA_INVALIDA porque el diagnóstico y el
  // consejo para RRHH son distintos: no es que la IA haya alucinado, es que no
  // le alcanzó el espacio — reintentar sin cambiar nada suele bastar.
  | 'SIN_ESPACIO_RESPUESTA'
  // Sentinela interna de obtenerPropuestaPendiente: no hay ninguna propuesta
  // guardada todavía (o ya se aplicó y se borró) — el frontend la usa para
  // lanzar un análisis fresco en silencio, nunca se muestra como error.
  | 'SIN_PROPUESTA_GUARDADA';

export interface DocumentoDetectado {
  requisito: string;
  paginaInicio: number | null;
  paginaFin: number | null;
  confianza: 'alta' | 'media' | 'baja';
  /** 0-100. Null en propuestas anteriores a este campo. */
  probabilidad: number | null;
  notas: string | null;
}

export interface AnalisisResult {
  success: boolean;
  reason?: AnalisisReason;
  message?: string;
  archivo?: { id: string; name: string };
  totalPaginas?: number;
  documentos?: DocumentoDetectado[];
  paginasSinClasificar?: number[];
  // Nombres de los documentos requeridos por la vacante. Va SIEMPRE que se
  // pudo identificar la vacante, incluso cuando la IA falló (ERROR_IA,
  // RESPUESTA_INVALIDA, SIN_ESPACIO_RESPUESTA) — así el frontend puede ofrecer
  // el mismo checklist para que RRHH lo llene a mano en vez de quedar sin
  // ninguna opción cuando la IA no responde.
  requisitos?: string[];
  // true si esta propuesta viene de un análisis guardado anteriormente (no de
  // una llamada fresca a Vertex AI en este momento) — el frontend lo usa para
  // mostrar "propuesta guardada el <fecha>" en vez del estado de carga.
  desdeCache?: boolean;
  guardadoEn?: string;
}

// Lo que RRHH confirma es una LISTA de páginas por documento, no un rango. La
// pantalla de revisión etiqueta página por página (miniaturas), así que un
// documento puede quedar formado por páginas no consecutivas — p. ej. el
// anverso de la cédula en la página 1 y el reverso en la 4, con otra cosa en
// medio. Con rangos eso obligaría a generar dos archivos con el mismo nombre;
// con una lista sale un único archivo con exactamente esas páginas.
export interface RevisionRequerido {
  requisito: string;
  driveFileId: string;
  fileName: string;
  confianza: 'alta' | 'media' | 'baja' | null;
  probabilidad: number | null;
  notas: string | null;
}

export interface RevisionAdicional {
  driveFileId: string;
  fileName: string;
  descripcion: string | null;
}

export interface RevisionArchivosResult {
  success: boolean;
  reason?: AnalisisReason | 'SIN_REVISION' | 'SIN_ARCHIVOS';
  message?: string;
  requeridos?: RevisionRequerido[];
  adicionales?: RevisionAdicional[];
  guardadoEn?: string;
  desdeCache?: boolean;
}

export interface AsignacionConfirmada {
  requisito: string;
  paginas: number[];
}

// Análisis asistido del "archivo único" de Reclutamiento: cuando un postulante
// entrega TODA su documentación en un solo PDF (modoSubida='archivo_unico' en
// candidato.json, que decide el portal público de postulación — otro proyecto,
// ver .agents/modules/reclutamiento.md), este servicio propone qué documento
// requerido está en qué páginas, y luego parte el PDF una vez que RRHH confirma.
//
// Dos reglas de diseño heredadas de DocumentExtractionService, deliberadas:
//
// 1. `analizar` NUNCA escribe: solo propone. Todo lo que toca Drive pasa por
//    `aplicar`, que corre únicamente con lo que RRHH confirmó o corrigió.
// 2. Cuando algo falla, falla de forma visible y con un mensaje accionable en
//    vez de adivinar — el postulante siempre se puede trabajar a mano.
//
// El resultado se guarda en `analisis-ia.json`, un archivo APARTE, nunca dentro
// de candidato.json: el portal de postulación reescribe candidato.json desde
// cero con un juego fijo de claves cada vez que alguien vuelve a postular, así
// que cualquier cosa que guardáramos ahí se perdería en silencio.
//
// `analisis-ia-pendiente.json` guarda la ÚLTIMA propuesta de la IA (antes de
// que RRHH confirme), para que cerrar el modal para revisar otra cosa y volver
// no obligue a repetir la llamada a Vertex AI. Se sobreescribe en cada análisis
// nuevo y se borra en `aplicar()` una vez que la propuesta ya se usó — deja de
// tener sentido ofrecerla como "guardada" cuando ya se aplicó.
const PENDIENTE_FILENAME = ANALISIS_IA_PENDIENTE_FILENAME;
const REVISION_FILENAME = REVISION_ARCHIVOS_IA_FILENAME;
@Injectable()
export class ReclutamientoIaService {
  private readonly logger = new Logger(ReclutamientoIaService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly driveService: DriveService,
  ) {}

  private get project(): string {
    return process.env.GOOGLE_VERTEX_PROJECT || '';
  }

  private get location(): string {
    return process.env.GOOGLE_VERTEX_LOCATION || 'us-central1';
  }

  estaConfigurado(): boolean {
    return !!this.project;
  }

  // Credenciales: las MISMAS que usa Drive (archivo en local, env var en Cloud
  // Run) pero con el scope cloud-platform. Vertex AI no acepta API keys — exige
  // OAuth2 — y esta organización de GCP tiene bloqueada por política la
  // creación de claves de service account, así que reutilizar esta credencial
  // no es solo cómodo: es la única vía disponible.
  private loadCredentials(): any {
    const candidates = [
      path.join(process.cwd(), 'google-service-account.json'),
      path.join(__dirname, '..', '..', '..', '..', 'google-service-account.json'),
    ];
    for (const candidate of candidates) {
      if (fs.existsSync(candidate)) {
        return JSON.parse(fs.readFileSync(candidate, 'utf-8'));
      }
    }
    if (process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
      return JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
    }
    return null;
  }

  private async getAccessToken(): Promise<string> {
    const credentials = this.loadCredentials();
    if (!credentials) {
      throw new Error(
        'No hay credenciales de Google disponibles (ni google-service-account.json ni GOOGLE_SERVICE_ACCOUNT_JSON).',
      );
    }
    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/cloud-platform'],
    });
    const client = await auth.getClient();
    const token = await client.getAccessToken();
    const value = typeof token === 'string' ? token : token?.token;
    if (!value) throw new Error('Vertex AI no devolvió un token de acceso.');
    return value;
  }

  async analizar(
    folderId: string,
    companyId: number,
    driveFileId?: string,
  ): Promise<AnalisisResult> {
    if (!companyId)
      throw new BadRequestException('Usuario sin empresa asociada');

    if (!this.estaConfigurado()) {
      return {
        success: false,
        reason: 'NO_CONFIGURADO',
        message:
          'El análisis con IA no está configurado en este entorno (falta GOOGLE_VERTEX_PROJECT). Revisa los documentos manualmente.',
      };
    }

    const { archivo, archivosRequeridos, vacanteEncontrada } =
      await this.resolverContexto(folderId, companyId, driveFileId);
    const requisitos = archivosRequeridos.map((a) => a.nombre);

    if (archivosRequeridos.length === 0) {
      return {
        success: false,
        reason: 'SIN_REQUISITOS',
        // Se distinguen las dos causas: "no se supo a qué vacante pertenece" y
        // "la vacante no pide documentos" llevan a acciones distintas de RRHH.
        message: vacanteEncontrada
          ? 'La vacante de este postulante no tiene documentos requeridos configurados, así que no hay nada que buscar dentro del PDF. Agrégalos en la vacante y vuelve a intentarlo.'
          : 'No se pudo determinar a qué vacante pertenece este postulante, así que no se sabe qué documentos buscar. Revisa que su carpeta esté dentro de la carpeta de una vacante en Drive.',
      };
    }

    let buffer: Buffer;
    try {
      buffer = await this.driveService.downloadFileBuffer(archivo.id);
    } catch (err: any) {
      this.logger.error(
        `No se pudo descargar ${archivo.id} de Drive: ${err.message}`,
      );
      return {
        success: false,
        reason: 'ERROR_DRIVE',
        message: `No se pudo descargar el archivo desde Google Drive: ${err.message}`,
        requisitos,
      };
    }

    if (buffer.length > MAX_PDF_BYTES) {
      return {
        success: false,
        reason: 'PDF_MUY_GRANDE',
        message: `El archivo pesa ${(buffer.length / 1024 / 1024).toFixed(1)} MB y supera el límite de ${MAX_PDF_BYTES / 1024 / 1024} MB para el análisis automático. Revísalo manualmente.`,
        archivo,
        requisitos,
      };
    }

    let totalPaginas: number;
    try {
      const pdf = await PDFDocument.load(buffer, { ignoreEncryption: true });
      totalPaginas = pdf.getPageCount();
    } catch (err: any) {
      this.logger.warn(`pdf-lib no pudo abrir ${archivo.id}: ${err.message}`);
      return {
        success: false,
        reason: 'PDF_ILEGIBLE',
        message:
          'No se pudo abrir este PDF (puede estar dañado o protegido con contraseña). Revísalo manualmente.',
        archivo,
        requisitos,
      };
    }

    let documentos: DocumentoDetectado[] | null;
    let finishReason: string | undefined;
    try {
      const resultado = await this.consultarModelo(
        buffer,
        requisitos,
        totalPaginas,
      );
      documentos = resultado.documentos;
      finishReason = resultado.finishReason;
    } catch (err: any) {
      this.logger.error(`Error llamando a Vertex AI: ${err.message}`);
      return {
        success: false,
        reason: 'ERROR_IA',
        message: `No se pudo completar el análisis con IA: ${err.message}. Revisa los documentos manualmente o inténtalo de nuevo.`,
        archivo,
        totalPaginas,
        requisitos,
      };
    }

    if (!documentos) {
      // MAX_TOKENS con texto vacío: el modelo se quedó sin espacio de salida
      // (típicamente porque el "thinking" interno se comió el presupuesto).
      // Se distingue de una respuesta genuinamente ilegible porque el consejo
      // es distinto: reintentar sin más suele bastar.
      if (finishReason === 'MAX_TOKENS') {
        return {
          success: false,
          reason: 'SIN_ESPACIO_RESPUESTA',
          message:
            'La IA no alcanzó a terminar su respuesta esta vez. Vuelve a intentarlo — no suele repetirse.',
          archivo,
          totalPaginas,
          requisitos,
        };
      }
      return {
        success: false,
        reason: 'RESPUESTA_INVALIDA',
        message:
          'La IA no devolvió una respuesta interpretable para este archivo. Puedes reintentar o asignar los documentos manualmente abajo.',
        archivo,
        totalPaginas,
        requisitos,
      };
    }

    // Se completan los requisitos que el modelo no mencionó, para que RRHH vea
    // el checklist entero (presentes y ausentes) y no solo lo que se encontró.
    const porNombre = new Map(documentos.map((d) => [d.requisito, d]));
    const completo: DocumentoDetectado[] = archivosRequeridos.map((req) => {
      const encontrado = porNombre.get(req.nombre);
      return (
        encontrado || {
          requisito: req.nombre,
          paginaInicio: null,
          paginaFin: null,
          confianza: 'baja',
          probabilidad: null,
          notas: 'La IA no encontró este documento dentro del archivo.',
        }
      );
    });

    const asignadas = new Set<number>();
    for (const d of completo) {
      if (d.paginaInicio && d.paginaFin) {
        for (let p = d.paginaInicio; p <= d.paginaFin; p++) asignadas.add(p);
      }
    }
    const paginasSinClasificar: number[] = [];
    for (let p = 1; p <= totalPaginas; p++) {
      if (!asignadas.has(p)) paginasSinClasificar.push(p);
    }

    const resultado: AnalisisResult = {
      success: true,
      archivo: { id: archivo.id, name: archivo.name },
      totalPaginas,
      documentos: completo,
      paginasSinClasificar,
      requisitos,
    };

    // Se guarda como propuesta pendiente ANTES de devolver: si RRHH cierra el
    // modal para revisar otra cosa y vuelve, la encuentra tal cual sin gastar
    // otra llamada a Vertex AI. Best-effort — si Drive falla acá, el análisis
    // ya calculado se devuelve igual (solo se pierde la posibilidad de
    // recuperarlo después sin repetir la llamada).
    try {
      await this.driveService.upsertJsonFile(folderId, PENDIENTE_FILENAME, {
        ...resultado,
        guardadoEn: new Date().toISOString(),
      });
    } catch (err: any) {
      this.logger.warn(
        `No se pudo guardar la propuesta pendiente en ${folderId}: ${err.message}`,
      );
    }

    return resultado;
  }

  // Devuelve la última propuesta guardada para este postulante (o para un
  // archivo puntual), sin llamar a Vertex AI. `analizar()` la persiste al
  // terminar con éxito; `aplicar()` la borra al confirmarse. Si no hay ninguna
  // guardada (primera vez, o ya se aplicó), success:false con una razón que el
  // frontend usa para lanzar un análisis fresco en silencio.
  async obtenerPropuestaPendiente(
    folderId: string,
    companyId: number,
    driveFileId?: string,
  ): Promise<AnalisisResult> {
    if (!companyId)
      throw new BadRequestException('Usuario sin empresa asociada');

    const guardado = await this.driveService
      .readJsonFile(folderId, PENDIENTE_FILENAME)
      .catch(() => null);

    if (!guardado || !guardado.success) {
      return { success: false, reason: 'SIN_PROPUESTA_GUARDADA' };
    }
    // Si se pidió un archivo puntual, la propuesta guardada debe ser de ESE
    // archivo — una guardada para otro PDF de la misma carpeta no sirve aquí.
    if (driveFileId && guardado.archivo?.id !== driveFileId) {
      return { success: false, reason: 'SIN_PROPUESTA_GUARDADA' };
    }

    return { ...guardado, desdeCache: true };
  }

  async obtenerRevisionArchivos(
    folderId: string,
    companyId: number,
  ): Promise<RevisionArchivosResult> {
    if (!companyId)
      throw new BadRequestException('Usuario sin empresa asociada');
    const guardado = await this.driveService
      .readJsonFile(folderId, REVISION_FILENAME)
      .catch(() => null);
    if (!guardado?.success) {
      return { success: false, reason: 'SIN_REVISION' };
    }
    return { ...guardado, desdeCache: true };
  }

  // Cada archivo de una casilla del puesto se califica solo: alta solo si
  // parece ser ESE documento. Los adicionales no se fuerzan a una casilla;
  // sale una frase de qué son. No renombra ni parte archivos.
  async revisarArchivos(
    folderId: string,
    companyId: number,
    requeridos: { requisito: string; driveFileId: string }[],
    adicionales: { driveFileId: string }[],
  ): Promise<RevisionArchivosResult> {
    if (!companyId)
      throw new BadRequestException('Usuario sin empresa asociada');
    if (requeridos.length === 0 && adicionales.length === 0) {
      return {
        success: false,
        reason: 'SIN_ARCHIVOS',
        message: 'No hay archivos subidos para revisar.',
      };
    }
    if (!this.estaConfigurado()) {
      return {
        success: false,
        reason: 'NO_CONFIGURADO',
        message:
          'El análisis con IA no está configurado en este entorno (falta GOOGLE_VERTEX_PROJECT). Revisa los documentos manualmente.',
      };
    }

    const files = await this.driveService.listFilesInFolder(folderId);
    const porId = new Map<string, { id: string; name: string; mimeType?: string }>(
      files.map((f: any) => [f.id, f]),
    );

    const filasRequeridos = await Promise.all(
      requeridos.map((item) =>
        this.revisarUnRequerido(porId.get(item.driveFileId), item),
      ),
    );
    const filasAdicionales = await Promise.all(
      adicionales.map((item) =>
        this.revisarUnAdicional(porId.get(item.driveFileId), item.driveFileId),
      ),
    );

    const resultado: RevisionArchivosResult = {
      success: true,
      requeridos: filasRequeridos,
      adicionales: filasAdicionales,
      guardadoEn: new Date().toISOString(),
    };
    try {
      await this.driveService.upsertJsonFile(folderId, REVISION_FILENAME, resultado);
    } catch (err: any) {
      this.logger.warn(
        `No se pudo guardar la revisión de archivos en ${folderId}: ${err.message}`,
      );
    }
    return resultado;
  }

  private async revisarUnRequerido(
    archivo: { id: string; name: string; mimeType?: string } | undefined,
    item: { requisito: string; driveFileId: string },
  ): Promise<RevisionRequerido> {
    const base = {
      requisito: item.requisito,
      driveFileId: item.driveFileId,
      fileName: archivo?.name || '',
    };
    if (!archivo) {
      return {
        ...base,
        confianza: null,
        probabilidad: null,
        notas: 'Ese archivo no está en la carpeta de este postulante.',
      };
    }
    const mime = this.mimeLegible(archivo);
    if (!mime) {
      return {
        ...base,
        confianza: null,
        probabilidad: null,
        notas: 'Este formato no se puede leer con IA. Sirven PDF e imágenes.',
      };
    }
    try {
      const buffer = await this.driveService.downloadFileBuffer(archivo.id);
      if (buffer.length > MAX_PDF_BYTES) {
        return {
          ...base,
          confianza: null,
          probabilidad: null,
          notas: 'El archivo es demasiado grande para revisarlo con IA.',
        };
      }
      const obj = await this.pedirJson(
        buffer,
        mime,
        `Este archivo se subió en la casilla "${item.requisito}" de una postulación.
Dime si el contenido ES realmente ese documento y no otro parecido.
"probabilidad" es un entero 0-100. "confianza" es "alta" solo desde 85 y si puedes citar una frase visible; "media" entre 55 y 84; "baja" por debajo de 55.
"notas" es una frase corta en español: por qué sí o por qué no.
Responde ÚNICAMENTE con un objeto JSON: {"probabilidad": <0-100>, "confianza": "alta"|"media"|"baja", "evidencia": "<frase visible>" o null, "notas": "<frase>"}`,
      );
      if (!obj) {
        return {
          ...base,
          confianza: null,
          probabilidad: null,
          notas: 'La IA no devolvió una respuesta para este archivo.',
        };
      }
      const calificada = this.interpretarConfianza(obj);
      const notas =
        typeof obj.notas === 'string' && obj.notas.trim()
          ? obj.notas.trim()
          : calificada.confianza === 'baja'
            ? `No parece ser ${item.requisito}.`
            : null;
      return {
        ...base,
        confianza: calificada.confianza,
        probabilidad: calificada.probabilidad,
        notas,
      };
    } catch (err: any) {
      this.logger.warn(`No se pudo revisar ${archivo.id}: ${err.message}`);
      return {
        ...base,
        confianza: null,
        probabilidad: null,
        notas: 'No se pudo revisar este archivo.',
      };
    }
  }

  private async revisarUnAdicional(
    archivo: { id: string; name: string; mimeType?: string } | undefined,
    driveFileId: string,
  ): Promise<RevisionAdicional> {
    const base = { driveFileId, fileName: archivo?.name || '' };
    if (!archivo) {
      return { ...base, descripcion: 'Ese archivo no está en la carpeta de este postulante.' };
    }
    const mime = this.mimeLegible(archivo);
    if (!mime) {
      return { ...base, descripcion: 'Este formato no se puede leer con IA. Sirven PDF e imágenes.' };
    }
    try {
      const buffer = await this.driveService.downloadFileBuffer(archivo.id);
      if (buffer.length > MAX_PDF_BYTES) {
        return { ...base, descripcion: 'El archivo es demasiado grande para identificarlo con IA.' };
      }
      const obj = await this.pedirJson(
        buffer,
        mime,
        `Mira este archivo y di en una sola frase en español qué documento es (por ejemplo "cédula de ciudadanía", "papeleta de votación", "foto personal", "contrato de trabajo"). Si no se puede saber, dilo.
Responde ÚNICAMENTE con un objeto JSON: {"descripcion": "<una frase>"}`,
      );
      const descripcion =
        typeof obj?.descripcion === 'string' && obj.descripcion.trim()
          ? obj.descripcion.trim()
          : 'No se pudo identificar este archivo.';
      return { ...base, descripcion };
    } catch (err: any) {
      this.logger.warn(`No se pudo identificar ${archivo.id}: ${err.message}`);
      return { ...base, descripcion: 'No se pudo identificar este archivo.' };
    }
  }

  private mimeLegible(archivo: { name: string; mimeType?: string }): string | null {
    const mime = (archivo.mimeType || '').toLowerCase();
    if (mime === 'application/pdf' || mime.startsWith('image/')) {
      return mime === 'image/jpg' ? 'image/jpeg' : mime;
    }
    const ext = (archivo.name.split('.').pop() || '').toLowerCase();
    const porExtension: Record<string, string> = {
      pdf: 'application/pdf',
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      png: 'image/png',
      webp: 'image/webp',
      gif: 'image/gif',
    };
    return porExtension[ext] || null;
  }

  private async pedirJson(
    buffer: Buffer,
    mime: string,
    prompt: string,
  ): Promise<any | null> {
    const token = await this.getAccessToken();
    const url = `https://${this.location}-aiplatform.googleapis.com/v1/projects/${this.project}/locations/${this.location}/publishers/google/models/${MODEL}:generateContent`;
    const response = await fetch(url, {
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
          temperature: 0.1,
          responseMimeType: 'application/json',
          maxOutputTokens: 1024,
          thinkingConfig: { thinkingBudget: 0 },
        },
      }),
    });
    if (!response.ok) {
      const errorBody = await response.text();
      this.logger.error(`Vertex AI ${response.status}: ${errorBody}`);
      throw new Error(`el servicio respondió ${response.status}`);
    }
    const data: any = await response.json();
    const texto: string = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
    if (!texto) return null;
    let limpio = texto;
    const fence = limpio.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
    if (fence) limpio = fence[1].trim();
    try {
      return JSON.parse(limpio);
    } catch {
      this.logger.warn(`Respuesta de IA no es JSON válido: ${limpio.slice(0, 200)}`);
      return null;
    }
  }

  // Ubica el PDF del postulante y los documentos que su vacante exige. Se
  // comparte entre analizar() y aplicar() para que ambos validen igual.
  private async resolverContexto(
    folderId: string,
    companyId: number,
    driveFileId?: string,
  ): Promise<{
    archivo: { id: string; name: string };
    archivosRequeridos: { nombre: string }[];
    vacanteEncontrada: boolean;
  }> {
    const files = await this.driveService.listFilesInFolder(folderId);
    const pdfs = files.filter((f: any) =>
      (f.name || '').toLowerCase().endsWith('.pdf'),
    );

    let archivo: any;
    if (driveFileId) {
      archivo = pdfs.find((f: any) => f.id === driveFileId);
      if (!archivo)
        throw new BadRequestException(
          'El archivo indicado no es un PDF de la carpeta de este postulante.',
        );
    } else if (pdfs.length === 0) {
      throw new BadRequestException(
        'Este postulante no tiene ningún PDF en su carpeta de Drive.',
      );
    } else if (pdfs.length > 1) {
      throw new BadRequestException(
        `Hay ${pdfs.length} PDFs en la carpeta de este postulante. Indica cuál es el archivo único que se debe analizar.`,
      );
    } else {
      archivo = pdfs[0];
    }

    const vacante = await this.resolverVacante(folderId, companyId);
    const archivosRequeridos = Array.isArray(vacante?.archivosRequeridos)
      ? (vacante.archivosRequeridos as any[]).filter((a) => a?.nombre)
      : [];

    return {
      archivo: { id: archivo.id, name: archivo.name },
      archivosRequeridos,
      vacanteEncontrada: !!vacante,
    };
  }

  // Misma estrategia que DriveService.contratarCandidato: la carpeta padre del
  // postulante es la carpeta de la vacante.
  private async resolverVacante(folderId: string, companyId: number) {
    const carpeta = await this.driveService.getFolderMetadata(folderId);
    const parentIds: string[] = carpeta?.parents || [];
    if (!parentIds.length) return null;
    return this.prisma.jobPosition.findFirst({
      where: { companyId, driveFolderId: { in: parentIds } },
    });
  }

  // Busca el Agent "Revisor de Documentos (IA)". Si no existe (primera vez que
  // se usa esta función, o alguien lo borró desde /agentes), lo crea con el
  // criterio por defecto — así el análisis nunca queda roto por falta de un
  // paso manual de seed, y a partir de ahí RRHH puede ajustarlo libremente
  // desde la pantalla de Agentes sin tocar código ni redeploy. Se relee en
  // CADA análisis (sin caché): un ajuste al criterio se nota de inmediato.
  private async getDocumentReviewerInstructions(): Promise<string> {
    try {
      const existing = await this.prisma.agent.findFirst({
        where: { createdBy: null, name: DOCUMENT_REVIEWER_AGENT_NAME },
        select: { instructions: true, isActive: true },
      });
      if (existing) {
        // Si RRHH lo desactiva desde /agentes, se respeta (vuelve al
        // criterio por defecto) en vez de ignorar el estado isActive.
        return existing.isActive && existing.instructions
          ? existing.instructions
          : DEFAULT_DOCUMENT_REVIEWER_INSTRUCTIONS;
      }
      const created = await this.prisma.agent.create({
        data: {
          name: DOCUMENT_REVIEWER_AGENT_NAME,
          instructions: DEFAULT_DOCUMENT_REVIEWER_INSTRUCTIONS,
          scope: 'RECLUTAMIENTO',
          createdBy: null,
        },
      });
      return created.instructions;
    } catch (err: any) {
      // Un problema leyendo/creando el Agent no debe tumbar el análisis — se
      // sigue con el criterio por defecto embebido en código.
      this.logger.warn(
        `No se pudo leer/crear el Agent "${DOCUMENT_REVIEWER_AGENT_NAME}", usando criterio por defecto: ${err.message}`,
      );
      return DEFAULT_DOCUMENT_REVIEWER_INSTRUCTIONS;
    }
  }

  private async buildPrompt(
    requisitos: string[],
    totalPaginas: number,
  ): Promise<string> {
    const criterio = await this.getDocumentReviewerInstructions();

    // El criterio (editable vía Agent) va primero; la lista de requisitos, el
    // total de páginas y el contrato de salida en JSON los agrega el código
    // siempre, sin importar qué tanto edite RRHH el criterio de arriba.
    return `${criterio}

Este archivo tiene ${totalPaginas} página(s). Documentos requeridos para esta vacante:
${requisitos.map((r, i) => `${i + 1}. ${r}`).join('\n')}

Calificación, obligatoria. No repartas las páginas entre los requisitos por descarte:
- "probabilidad" (entero 0-100) es la chance de que esas páginas sean EXACTAMENTE ese documento, no uno parecido ni "el que sobra".
- 85-100 y "confianza" "alta" SOLO si en la página se lee el nombre de ese documento o su contenido típico (una cédula se ve como cédula; una carta de recomendación laboral se lee como recomendación de un empleo). "evidencia" es una frase corta copiada de lo que se ve. Sin esa frase, no puede ser alta.
- 55-84 y "confianza" "media" si se parece pero no estás seguro.
- 0-54 y "confianza" "baja": paginaInicio y paginaFin en null. Un requisito que no está en el archivo (por ejemplo un campo nuevo que no tiene nada que ver con las páginas) NO se asigna a páginas de otro documento.
- No marques todo como "alta". La mayoría de los expedientes mezcla documentos distintos; cada uno se califica por separado.

Responde ÚNICAMENTE con un objeto JSON, sin texto antes ni después y sin bloques de código markdown, con exactamente esta forma:
{"documentos": [{"requisito": "<uno de los nombres de la lista, copiado literal>", "paginaInicio": <número> o null, "paginaFin": <número> o null, "probabilidad": <entero 0-100>, "confianza": "alta" | "media" | "baja", "evidencia": "<frase visible>" o null, "notas": "<texto breve>" o null}]}`;
  }

  private async consultarModelo(
    buffer: Buffer,
    requisitos: string[],
    totalPaginas: number,
  ): Promise<{ documentos: DocumentoDetectado[] | null; finishReason?: string }> {
    const token = await this.getAccessToken();
    const prompt = await this.buildPrompt(requisitos, totalPaginas);
    const url = `https://${this.location}-aiplatform.googleapis.com/v1/projects/${this.project}/locations/${this.location}/publishers/google/models/${MODEL}:generateContent`;

    const response = await fetch(url, {
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
                  mimeType: 'application/pdf',
                  data: buffer.toString('base64'),
                },
              },
              { text: prompt },
            ],
          },
        ],
        generationConfig: {
          // temperatura baja: esto es clasificación, no redacción.
          temperature: 0.1,
          responseMimeType: 'application/json',
          // 4096 y no 2048: con más requisitos o páginas el JSON de salida
          // crece, y este modelo también gasta parte del cupo en "thinking"
          // (ver thinkingConfig abajo) antes de escribir la respuesta final.
          maxOutputTokens: 4096,
          // gemini-2.5-flash razona internamente antes de responder por
          // defecto, y esos tokens de "pensamiento" salen del MISMO cupo que
          // maxOutputTokens. Verificado contra el PDF real de un postulante
          // (2026-09-16): el pensamiento solo, sin esta línea, ya consumía
          // 800-1300 tokens de los 2048 disponibles, de forma no determinista
          // (mismo archivo, mismo prompt, distinto gasto en cada llamada) —
          // exactamente el patrón de un fallo intermitente. Esta tarea es
          // clasificación, no requiere razonamiento encadenado: se desactiva
          // por completo para que el cupo completo quede para el JSON.
          thinkingConfig: { thinkingBudget: 0 },
        },
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      // El detalle crudo del API queda en el log; hacia arriba solo viaja el
      // código, para no filtrar rutas internas del proyecto de GCP a la UI.
      this.logger.error(`Vertex AI ${response.status}: ${errorBody}`);
      throw new Error(`el servicio respondió ${response.status}`);
    }

    const data: any = await response.json();
    const candidato = data?.candidates?.[0];
    const finishReason: string | undefined = candidato?.finishReason;
    const texto: string = candidato?.content?.parts?.[0]?.text?.trim() || '';
    if (!texto) return { documentos: null, finishReason };

    return {
      documentos: this.parseRespuesta(texto, requisitos, totalPaginas),
      finishReason,
    };
  }

  /** Parseo defensivo: tolera bloques markdown y descarta rangos imposibles. */
  private parseRespuesta(
    raw: string,
    requisitos: string[],
    totalPaginas: number,
  ): DocumentoDetectado[] | null {
    let limpio = raw.trim();
    const fence = limpio.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
    if (fence) limpio = fence[1].trim();

    let obj: any;
    try {
      obj = JSON.parse(limpio);
    } catch {
      this.logger.warn(`Respuesta de IA no es JSON válido: ${limpio.slice(0, 200)}`);
      return null;
    }

    const lista = Array.isArray(obj?.documentos) ? obj.documentos : null;
    if (!lista) return null;

    const validos = new Set(requisitos);
    const resultado: DocumentoDetectado[] = [];

    for (const item of lista) {
      const requisito = typeof item?.requisito === 'string' ? item.requisito : '';
      // Un requisito que el modelo se inventó (no está en la vacante) se
      // descarta: aceptarlo generaría una fila que RRHH no puede confirmar.
      if (!validos.has(requisito)) continue;

      let inicio = this.normalizarPagina(item?.paginaInicio, totalPaginas);
      let fin = this.normalizarPagina(item?.paginaFin, totalPaginas);

      // Un rango a medias no es utilizable: se trata como "no encontrado" en
      // vez de inventar el extremo que falta.
      if (inicio === null || fin === null) {
        inicio = null;
        fin = null;
      } else if (fin < inicio) {
        [inicio, fin] = [fin, inicio];
      }

      const calificada = this.interpretarConfianza(item);
      if (calificada.descartarPaginas) {
        inicio = null;
        fin = null;
      }

      const notasModelo =
        typeof item?.notas === 'string' && item.notas.trim()
          ? item.notas.trim()
          : null;

      resultado.push({
        requisito,
        paginaInicio: inicio,
        paginaFin: fin,
        confianza: calificada.confianza,
        probabilidad: calificada.probabilidad,
        notas: calificada.descartarPaginas
          ? notasModelo ||
            'Probabilidad baja: la página no parece ser este documento, así que no se preseleccionó.'
          : notasModelo,
      });
    }

    return resultado;
  }

  private normalizarPagina(valor: unknown, totalPaginas: number): number | null {
    const n = Number(valor);
    if (!Number.isInteger(n) || n < 1 || n > totalPaginas) return null;
    return n;
  }

  // La palabra "alta" que devuelve el modelo no se cree sola: Gemini la pone
  // casi siempre. Manda el número. Sin frase visible que nombre el documento,
  // alta queda en media. Por debajo de 55 las páginas no se preseleccionan.
  private interpretarConfianza(item: any): {
    confianza: 'alta' | 'media' | 'baja';
    probabilidad: number | null;
    descartarPaginas: boolean;
  } {
    const cruda = Number(item?.probabilidad);
    const probabilidad = Number.isFinite(cruda)
      ? Math.max(0, Math.min(100, Math.round(cruda)))
      : null;

    if (probabilidad === null) {
      const etiqueta = ['alta', 'media', 'baja'].includes(item?.confianza)
        ? item.confianza
        : 'baja';
      return { confianza: etiqueta, probabilidad: null, descartarPaginas: false };
    }

    const evidencia =
      typeof item?.evidencia === 'string' && item.evidencia.trim().length >= 3;
    let confianza: 'alta' | 'media' | 'baja' =
      probabilidad >= 85 ? 'alta' : probabilidad >= 55 ? 'media' : 'baja';
    if (confianza === 'alta' && !evidencia) confianza = 'media';
    return {
      confianza,
      probabilidad,
      descartarPaginas: probabilidad < 55,
    };
  }

  // Mismo criterio de nombre que usa aplicar() para crear cada documento
  // separado ("<Requisito> - <original>"): un archivo YA guardado para ese
  // requisito empieza igual. Se usa tanto para avisarle a RRHH antes de
  // separar (detectarConflictos) como, dentro de aplicar(), para decidir si
  // hay que borrar el archivo viejo cuando RRHH elige "Reemplazar".
  private buscarArchivoDeRequisito(
    archivosPostulante: { id: string; name?: string; mimeType?: string }[],
    requisito: string,
  ) {
    const prefijo = `${requisito.trim().toLowerCase()} -`;
    return archivosPostulante.find((f) =>
      String(f.name || '').toLowerCase().startsWith(prefijo),
    );
  }

  // RRHH está por confirmar la separación del "archivo único". Antes de
  // crear nada, se avisa si algún requisito ya tiene un archivo guardado en
  // la carpeta (el postulante lo subió suelto además de en el archivo único,
  // o esta separación ya se corrió antes) — así el modal de "Confirmar y
  // separar" puede preguntar, documento por documento, si reemplazar o
  // mantener el que ya había, en vez de pisarlo en silencio.
  async detectarConflictos(
    folderId: string,
    companyId: number,
    requisitos: string[],
  ): Promise<
    {
      requisito: string;
      archivoExistente: { id: string; name: string; mimeType?: string } | null;
    }[]
  > {
    if (!companyId)
      throw new BadRequestException('Usuario sin empresa asociada');

    const files = await this.driveService.listFilesInFolder(folderId);
    const archivosPostulante = files.filter(
      (f: any) => !String(f.name || '').toLowerCase().endsWith('.json'),
    );

    return requisitos.map((requisito) => {
      const existente = this.buscarArchivoDeRequisito(
        archivosPostulante,
        requisito,
      );
      return {
        requisito,
        archivoExistente: existente
          ? {
              id: existente.id,
              name: existente.name || '',
              mimeType: (existente as any).mimeType,
            }
          : null,
      };
    });
  }

  // Aplica lo que RRHH confirmó: parte el PDF en un archivo por documento,
  // dentro de la misma carpeta del postulante y CONSERVANDO el original. A
  // partir de acá el candidato queda igual que uno que subió sus documentos por
  // separado — el % de completitud, contratar, Cumplimiento y Guardias
  // funcionan sin cambios, porque todos matchean por nombre de archivo.
  async aplicar(
    folderId: string,
    companyId: number,
    asignaciones: AsignacionConfirmada[],
    driveFileId?: string,
    resoluciones?: Record<string, 'reemplazar' | 'mantener'>,
  ) {
    if (!companyId)
      throw new BadRequestException('Usuario sin empresa asociada');
    if (!asignaciones?.length)
      throw new BadRequestException(
        'No hay documentos confirmados para separar.',
      );

    const { archivo, archivosRequeridos } = await this.resolverContexto(
      folderId,
      companyId,
      driveFileId,
    );
    const nombresValidos = new Set(archivosRequeridos.map((a) => a.nombre));

    const buffer = await this.driveService.downloadFileBuffer(archivo.id);
    let original: PDFDocument;
    try {
      original = await PDFDocument.load(buffer, { ignoreEncryption: true });
    } catch (err: any) {
      throw new BadRequestException(
        `No se pudo abrir el PDF para separarlo: ${err.message}`,
      );
    }
    const totalPaginas = original.getPageCount();

    // Se valida TODO antes de escribir el primer archivo: así una asignación
    // inválida no deja la carpeta a medio partir.
    const requisitosVistos = new Set<string>();
    for (const asig of asignaciones) {
      if (!nombresValidos.has(asig.requisito)) {
        throw new BadRequestException(
          `"${asig.requisito}" no es un documento requerido de la vacante de este postulante.`,
        );
      }
      // Dos entradas para el mismo requisito generarían dos archivos con el
      // mismo nombre en Drive; las páginas deben venir agrupadas en una sola.
      if (requisitosVistos.has(asig.requisito)) {
        throw new BadRequestException(
          `"${asig.requisito}" viene repetido. Sus páginas deben ir juntas en un solo documento.`,
        );
      }
      requisitosVistos.add(asig.requisito);

      if (!Array.isArray(asig.paginas) || asig.paginas.length === 0) {
        throw new BadRequestException(
          `No se indicó ninguna página para "${asig.requisito}".`,
        );
      }
      const fuera = asig.paginas.filter(
        (p) => !Number.isInteger(p) || p < 1 || p > totalPaginas,
      );
      if (fuera.length) {
        throw new BadRequestException(
          `"${asig.requisito}" apunta a la(s) página(s) ${fuera.join(', ')}, que no existen en un PDF de ${totalPaginas} página(s).`,
        );
      }
      if (new Set(asig.paginas).size !== asig.paginas.length) {
        throw new BadRequestException(
          `"${asig.requisito}" tiene páginas repetidas.`,
        );
      }
    }

    // Mismo chequeo que detectarConflictos, pero justo antes de escribir: si
    // algún requisito ya tiene un archivo guardado y no llegó una resolución
    // para él, se corta acá — el frontend siempre debe preguntar primero (ver
    // AnalisisArchivoUnicoModal), así que llegar sin resolver es un bug del
    // cliente, no una decisión silenciosa que el backend deba tomar por RRHH.
    const filesActuales = await this.driveService.listFilesInFolder(folderId);
    const archivosPostulanteActuales = filesActuales.filter(
      (f: any) => !String(f.name || '').toLowerCase().endsWith('.json'),
    );
    const conflictos = new Map<
      string,
      { id: string; name?: string }
    >();
    for (const asig of asignaciones) {
      const existente = this.buscarArchivoDeRequisito(
        archivosPostulanteActuales,
        asig.requisito,
      );
      if (!existente) continue;
      const resolucion = resoluciones?.[asig.requisito];
      if (resolucion !== 'reemplazar' && resolucion !== 'mantener') {
        throw new BadRequestException(
          `"${asig.requisito}" ya tiene un archivo guardado. Indica si se reemplaza o se mantiene antes de separar.`,
        );
      }
      conflictos.set(asig.requisito, existente);
    }

    const extMatch = archivo.name.match(/\.[^/.]+$/);
    const extension = extMatch ? extMatch[0] : '.pdf';
    let baseName = archivo.name.slice(0, archivo.name.length - extension.length);
    // El portal de postulación (otro proyecto, ver .agents/modules/reclutamiento.md)
    // prefija el archivo subido en modo "archivo único" con la etiqueta
    // genérica del casillero ("Archivo Completo -", "Documentos Adicionales
    // -") para que se sepa de dónde vino. Esa etiqueta no es el nombre de
    // ningún documento real: si se arrastra tal cual, cada archivo separado
    // termina llamándose "<Requisito> - Archivo Completo - <original>".
    baseName = baseName.replace(
      /^(Archivo Completo|Documentos Adicionales)\s*-\s*/i,
      '',
    );

    const creados: { requisito: string; fileName: string; driveFileId: string }[] = [];
    const mantenidos: string[] = [];
    for (const asig of asignaciones) {
      // RRHH eligió quedarse con el archivo que ya había: las páginas de esta
      // asignación dentro del archivo único simplemente no se escriben.
      if (resoluciones?.[asig.requisito] === 'mantener') {
        mantenidos.push(asig.requisito);
        continue;
      }

      const nuevo = await PDFDocument.create();
      // pdf-lib indexa desde 0; RRHH y la IA hablan desde 1. Se ordenan para
      // que el documento resultante respete el orden del original aunque RRHH
      // haya etiquetado las miniaturas en cualquier orden.
      const indices = [...asig.paginas].sort((a, b) => a - b).map((p) => p - 1);
      const paginas = await nuevo.copyPages(original, indices);
      paginas.forEach((pagina) => nuevo.addPage(pagina));
      const bytes = await nuevo.save();

      // "Reemplazar" borra el archivo viejo ANTES de subir el nuevo: si no,
      // quedarían dos archivos con requisito parecido y el checklist del
      // expediente no sabría cuál es el vigente.
      const existente = conflictos.get(asig.requisito);
      if (existente) {
        try {
          await this.driveService.deleteFileById(existente.id);
        } catch (err: any) {
          throw new BadRequestException(
            `No se pudo reemplazar el archivo existente de "${asig.requisito}": ${err.message}`,
          );
        }
      }

      // Mismo formato de nombre que reassignReclutamientoFile ("<Requisito> -
      // <original>"), que es lo que hace que findMatchingFile lo reconozca
      // después sin ningún modelo de asociación extra.
      const fileName = `${asig.requisito} - ${baseName}${extension}`;
      const subido = await this.driveService.uploadFileBuffer(
        folderId,
        fileName,
        'application/pdf',
        Buffer.from(bytes),
      );
      creados.push({ requisito: asig.requisito, fileName, driveFileId: subido });
    }

    await this.guardarTraza(folderId, {
      archivoOriginal: { id: archivo.id, name: archivo.name },
      totalPaginas,
      aplicadoEn: new Date().toISOString(),
      asignaciones,
      creados,
      mantenidos,
    });

    // La propuesta pendiente ya se usó — se borra para que no quede ofrecida
    // como "guardada" para un archivo que ya se separó. Best-effort: si esto
    // falla, los documentos ya separados siguen siendo válidos igual.
    await this.driveService
      .deleteFileByName(folderId, PENDIENTE_FILENAME)
      .catch((err: any) =>
        this.logger.warn(
          `No se pudo borrar la propuesta pendiente en ${folderId}: ${err.message}`,
        ),
      );

    return { creados, mantenidos, archivoOriginalConservado: archivo.name };
  }

  // Traza en analisis-ia.json — archivo aparte, NO candidato.json (ver el
  // comentario de cabecera de esta clase).
  private async guardarTraza(folderId: string, contenido: any) {
    try {
      await this.driveService.upsertJsonFile(
        folderId,
        ANALISIS_IA_FILENAME,
        contenido,
      );
    } catch (err: any) {
      // La traza es informativa: si falla, los documentos ya separados siguen
      // siendo válidos y no tiene sentido revertir el trabajo por esto.
      this.logger.warn(
        `No se pudo guardar analisis-ia.json en ${folderId}: ${err.message}`,
      );
    }
  }
}
