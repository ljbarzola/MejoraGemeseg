import {
  Injectable,
  Logger,
  HttpException,
  HttpStatus,
  ForbiddenException,
  OnModuleInit,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AiProcessor, INTENT_SECTION } from './ai.processor';
import { VertexChatClient, ChatTurn } from './vertex-chat.client';
import {
  ALL_SECTIONS,
  PermissionsService,
  permiteSinFila,
} from '../permissions/permissions.service';
import { parseKnowledgeBase, filterKnowledgeBase } from './knowledge-base.util';
import { buildCapabilitiesPrompt } from './capabilities-prompt.util';
import { buildSystemGuide } from './system-guide.util';
import { SendMessageDto } from './dto/send-message.dto';
import {
  SCOPE_VENTAS,
  intencionPermitida,
  perfilDeAgente,
  type PerfilAgente,
} from './agent-profiles.util';
import {
  SYSTEM_REDACCION_VENTAS,
  VENTAS_AYUDA,
  buildSalesAgentPrompt,
  verificarCitas,
} from './ventas-agent-prompt.util';

const RATE_LIMIT = 50;
// El Agente de Ventas investiga (consultas más pesadas y respuestas más largas):
// tiene su propio tope diario, además del general de 50.
const RATE_LIMIT_VENTAS = 30;

// Texto inicial EDITABLE del Agente de Ventas (Sistemas → Agentes). Solo pone
// tono y prioridades; las reglas para investigar sin inventar van en código
// (ventas-agent-prompt.util.ts) y no se pueden borrar desde ahí.
export const INSTRUCCIONES_VENTAS_POR_DEFECTO = `Tono profesional y cercano, directo y sin rodeos. Prioriza lo accionable: qué hacer con el cliente y para cuándo.
Cuando investigues por qué se perdió un cliente, no te quedes en el precio: revisa también la rapidez de la atención, el seguimiento y la calidad del servicio.
Tutea a la persona y usa los nombres de menús y botones tal como se ven en pantalla.`;

/** Secciones visibles al generar un mensaje, ordenadas y separadas por coma ('' = solo lo común). */
export function sectionsSnapshot(allowedKeys: string[]): string {
  return [...allowedKeys].sort().join(',');
}

// Deliberadamente SIN nombrar módulos acá — antes este texto decía "puedes
// responder sobre Cacao, Custodias, RRHH y Ventas" a cualquier usuario de
// cualquier empresa, sin mirar si esa empresa o ese usuario tenían acceso.
// Qué módulos existen para ESTE usuario en ESTE momento lo arma
// buildCapabilitiesPrompt (capabilities-prompt.util.ts), calculado en cada
// request — así nunca se nombra un módulo al que no se tiene acceso.
export const BASE_SYSTEM_PROMPT = `Eres Agente Gemeseg, el asistente de inteligencia artificial de la empresa.
Responde de forma concisa y útil, en español.
Cuando necesites datos específicos del sistema, indica la intención con el formato [INTENCION: nombre_intencion], usando ÚNICAMENTE los nombres de intención listados en "Lo que puedes hacer" — nunca inventes uno que no esté ahí.
Si no necesitas datos, responde directamente.`;

@Injectable()
export class AiService implements OnModuleInit {
  private readonly logger = new Logger(AiService.name);

  constructor(
    private prisma: PrismaService,
    private processor: AiProcessor,
    private vertexChat: VertexChatClient,
    private permissionsService: PermissionsService,
  ) {
    if (this.vertexChat.estaConfigurado()) {
      this.logger.log('Usando Google Vertex AI para Agente Gemeseg');
    } else {
      this.logger.warn(
        'GOOGLE_VERTEX_PROJECT no configurado — chat funcionará con respuestas mock',
      );
    }
  }

  // Siembra el Agente de Ventas si no existe (nunca pisa uno que ya exista: su
  // texto se edita desde Sistemas → Agentes). Un fallo acá no impide arrancar.
  async onModuleInit() {
    try {
      await this.ensureSalesAgent();
    } catch (err: any) {
      this.logger.warn(`No se pudo sembrar el Agente de Ventas: ${err.message}`);
    }
  }

  private async ensureSalesAgent() {
    const existe = await this.prisma.agent.findFirst({
      where: { createdBy: null, scope: SCOPE_VENTAS },
      select: { id: true },
    });
    if (existe) return;
    await this.prisma.agent.create({
      data: {
        name: 'Agente de Ventas',
        instructions: INSTRUCCIONES_VENTAS_POR_DEFECTO,
        scope: SCOPE_VENTAS,
        isDefault: false,
      },
    });
  }

  // Quién puede usar qué agente. Antes `agentId` llegaba del cliente y no se
  // validaba: cualquiera podía usar un agente que no tenía asignado. Los agentes
  // generales del sistema (sin dueño) los usa cualquiera, como en el selector;
  // un agente propio o uno especializado (Ventas) exige que esté asignado a la
  // persona. El de Ventas además exige tener acceso a Ventas.
  private async assertAgentUsable(
    userId: number,
    agentId: number,
    allowedKeys: string[],
  ): Promise<{ id: number; scope: string | null; perfil: PerfilAgente }> {
    const agent = await this.prisma.agent.findUnique({
      where: { id: agentId },
      select: { id: true, scope: true, isActive: true, createdBy: true },
    });
    // Un agente inexistente o desactivado cae al comportamiento de siempre
    // (prompt base), salvo el de Ventas, que no tiene "prompt base" que lo cubra.
    if (!agent || (!agent.isActive && agent.scope !== SCOPE_VENTAS)) {
      // La conversación se crea con el agente que se devuelva aquí: uno que no
      // existe rompería la clave foránea, así que se usa el predeterminado.
      return {
        id: agent ? agentId : await this.getDefaultAgentId(),
        scope: null,
        perfil: 'GENERAL',
      };
    }
    if (agent.scope === SCOPE_VENTAS && !agent.isActive) {
      throw new ForbiddenException('El Agente de Ventas no está disponible ahora.');
    }
    const esDelSistemaGeneral = agent.createdBy === null && agent.scope !== SCOPE_VENTAS;
    if (!esDelSistemaGeneral && agent.createdBy !== userId) {
      const asignado = await this.prisma.userAgent.findUnique({
        where: { userId_agentId: { userId, agentId } },
        select: { agentId: true },
      });
      if (!asignado) {
        throw new ForbiddenException('No tienes asignado ese agente.');
      }
    }
    if (agent.scope === SCOPE_VENTAS && !allowedKeys.includes('VENTAS')) {
      throw new ForbiddenException('No tienes acceso a Ventas con tu usuario actual.');
    }
    return { id: agent.id, scope: agent.scope, perfil: perfilDeAgente(agent.scope) };
  }

  async sendMessage(
    dto: SendMessageDto,
    userId: number,
    companyId: number | null,
  ) {
    // Permisos de AHORA, no los de cuando se creó la conversación: cada
    // mensaje guarda con qué secciones se generó, y el historial que se le
    // manda al modelo descarta los turnos generados con una sección que el
    // usuario ya perdió — si no, el modelo relee sus propias respuestas
    // viejas y sigue hablando de un módulo que le quitaron (pasó 2026-09-30).
    const allowedKeys = await this.getAllowedSectionKeys(companyId, userId);
    const sections = sectionsSnapshot(allowedKeys);

    // El agente de una conversación existente manda sobre el que venga en el
    // body, y se vuelve a validar en CADA mensaje (si lo desasignaron, ya no).
    let pedido = dto.agentId || (await this.getDefaultAgentId());
    if (dto.conversationId) {
      const previa = await this.prisma.conversation.findUnique({
        where: { id: dto.conversationId },
        select: { userId: true, agentId: true },
      });
      if (previa && previa.userId === userId) pedido = previa.agentId;
    }
    const agente = await this.assertAgentUsable(userId, pedido, allowedKeys);
    const agentId = agente.id;
    await this.checkRateLimit(userId, agente.perfil);

    const conversation = await this.getOrCreateConversation(
      dto.conversationId,
      userId,
      dto.context,
      agentId,
    );

    // Se lee ANTES de guardar el mensaje nuevo: el mensaje actual va aparte
    // como newMessage, así no llega duplicado al modelo.
    const history = await this.getConversationHistory(
      conversation.id,
      allowedKeys,
    );

    await this.prisma.chatMessage.create({
      data: {
        conversationId: conversation.id,
        role: 'user',
        content: dto.message,
        sections,
      },
    });

    const configured = this.vertexChat.estaConfigurado();

    let reply: string;
    let tokensUsed = 0;
    let auditoria: Record<string, unknown> | undefined;

    try {
      if (configured) {
        const result = await this.callVertexChat(
          dto.message,
          dto.context,
          history,
          conversation.agentId,
          userId,
          companyId,
          allowedKeys,
          agente.perfil,
        );
        reply = result.reply;
        tokensUsed = result.tokensUsed;
        auditoria = result.auditoria;
      } else {
        reply = await this.mockResponse(dto.message, dto.context);
      }
    } catch (error) {
      this.logger.error(`Error en chat: ${error.message}`);
      await this.logAi(userId, this.accionLog(agente.perfil), 0, false, error.message, {
        agentId,
        perfil: agente.perfil,
      });
      this.logger.warn('Error en IA, usando modo mock como fallback');
      reply = await this.mockResponse(dto.message, dto.context);
    }

    await this.prisma.chatMessage.create({
      data: {
        conversationId: conversation.id,
        role: 'assistant',
        content: reply,
        tokensUsed,
        model: configured ? this.vertexModelForLog(agente.perfil) : 'mock',
        sections,
      },
    });

    await this.logAi(userId, this.accionLog(agente.perfil), tokensUsed, true, undefined, {
      agentId,
      perfil: agente.perfil,
      ...(auditoria ?? {}),
    });

    return {
      reply,
      conversationId: conversation.id,
      agentId: conversation.agentId,
    };
  }

  // El Agente de Ventas usa el modelo 'fuerte' y el resto 'ligero'.
  private nivelDePerfil(perfil?: string | null): 'fuerte' | 'ligero' {
    return perfil === 'VENTAS' ? 'fuerte' : 'ligero';
  }

  private vertexModelForLog(perfil?: string | null): string {
    return this.vertexChat.modeloPara(this.nivelDePerfil(perfil));
  }

  /**
   * Replica la misma verificación que SectionPermissionGuard aplica a los
   * endpoints REST normales (super admin -> pasa; sección no habilitada para
   * la empresa -> denegado; sección fija -> pasa; fila UserPermission ->
   * manda canView; sin fila -> permitido, mismo default permisivo del resto
   * del sistema). Sin esto, una intención nueva podría revelar datos de un
   * módulo al que el usuario no tiene acceso — el requisito no es
   * "pedirle" al modelo que no lo haga, es no ejecutar la consulta.
   */
  private async canUseIntent(
    userId: number,
    companyId: number | null,
    section: string | null,
  ): Promise<boolean> {
    if (!section) return true;
    if (!companyId) return true; // super admin

    const companySections = await this.permissionsService.getCompanySections(
      companyId,
    );
    const enabled = companySections.some(
      (s) => s.key === section && s.enabled,
    );
    if (!enabled) return false;

    const fijas = await this.permissionsService.getFixedSections(companyId);
    if (fijas.includes(section)) return true;

    const perms = await this.permissionsService.getUserPermissions(userId);
    const perm = perms.find((p) => p.section === section);
    if (!perm) return permiteSinFila(section);
    return perm.canView;
  }

  /**
   * Secciones que este usuario puede VER ahora mismo (misma lógica exacta que
   * SectionPermissionGuard/canUseIntent: sección habilitada para la empresa +
   * fija o fila UserPermission, "sin fila = permitido"). La usan tanto el
   * filtro de la base de conocimiento como el bloque "qué puedes hacer" del
   * prompt — un solo cálculo, no dos copias que puedan divergir.
   */
  private async getAllowedSectionKeys(
    companyId: number | null,
    userId: number,
  ): Promise<string[]> {
    if (!companyId) return ALL_SECTIONS.map((s) => s.key); // super admin

    const companySections = await this.permissionsService.getCompanySections(
      companyId,
    );
    const fijas = await this.permissionsService.getFixedSections(companyId);
    const perms = await this.permissionsService.getUserPermissions(userId);
    return companySections
      .filter((s) => {
        if (!s.enabled) return false;
        if (fijas.includes(s.key)) return true;
        const perm = perms.find((p) => p.section === s.key);
        return perm ? perm.canView : permiteSinFila(s.key);
      })
      .map((s) => s.key);
  }

  private async getFilteredKnowledgeBase(
    companyId: number | null,
    userId: number,
    allowedKeys: string[],
  ): Promise<string> {
    if (!companyId) return '';
    const kb = await this.prisma.companyKnowledgeBase.findUnique({
      where: { companyId },
    });
    if (!kb || !kb.content.trim()) return '';

    const sections = parseKnowledgeBase(
      kb.content,
      ALL_SECTIONS.map((s) => s.key),
    );
    return filterKnowledgeBase(sections, allowedKeys);
  }

  private async callVertexChat(
    message: string,
    context: string,
    chatHistory: ChatTurn[],
    agentId: number,
    userId: number,
    companyId: number | null,
    allowedKeysParam?: string[],
    perfil: PerfilAgente = 'GENERAL',
  ): Promise<{
    reply: string;
    tokensUsed: number;
    auditoria?: Record<string, unknown>;
  }> {
    const basePrompt = await this.getSystemPromptForAgent(agentId);
    const allowedKeys =
      allowedKeysParam ?? (await this.getAllowedSectionKeys(companyId, userId));
    const esVentas = perfil === 'VENTAS';
    // El Agente de Ventas solo conoce Ventas: ni el manual ni la base de
    // conocimiento de otros módulos le llegan.
    const clavesVisibles = esVentas
      ? allowedKeys.filter((k) => k === 'VENTAS')
      : allowedKeys;

    const capabilities = esVentas
      ? `Consultas disponibles (datos reales de Ventas de la empresa):\n${VENTAS_AYUDA}`
      : buildCapabilitiesPrompt(clavesVisibles, {
          ventasAgenteDisponible: await this.tieneAgenteVentas(userId, allowedKeys),
        });
    const kbContext = await this.getFilteredKnowledgeBase(
      companyId,
      userId,
      clavesVisibles,
    );
    const systemPrompt = [
      basePrompt,
      esVentas ? buildSalesAgentPrompt() : '',
      capabilities,
      `Manual de uso del sistema (lo que este usuario puede usar):\n\n${buildSystemGuide(clavesVisibles)}`,
      kbContext &&
        `Contexto adicional de la empresa (políticas, procesos internos; complementa el manual):\n${kbContext}`,
    ]
      .filter(Boolean)
      .join('\n\n');

    const result = await this.vertexChat.sendChat(
      systemPrompt,
      chatHistory,
      `[Contexto: ${context}] ${message}`,
      esVentas
        ? { maxOutputTokens: 4096, nivel: 'fuerte' }
        : { nivel: 'ligero' },
    );

    const intentMatch = result.reply.match(
      /\[INTENCION:\s*(\w+)(?:\(([^)]+)\))?\]/,
    );

    if (!intentMatch) return result;

    const intent = intentMatch[1];
    const paramsStr = intentMatch[2];
    const params: any = {};
    if (paramsStr) {
      paramsStr.split(',').forEach((p: string) => {
        const [key, val] = p.split(':');
        params[key.trim()] = val?.trim();
      });
    }
    if (params.projectId) params.projectId = Number(params.projectId);

    // Cada perfil ejecuta solo lo suyo: Agente Gemeseg ya no consulta Ventas y
    // el Agente de Ventas no consulta nada fuera de Ventas, aunque el modelo
    // escriba el nombre de otra intención.
    if (!intencionPermitida(perfil, intent)) {
      return {
        reply: esVentas
          ? 'Esa consulta no es de este asistente: aquí solo respondo sobre Ventas.'
          : 'No tengo esa consulta en este asistente.',
        tokensUsed: result.tokensUsed,
      };
    }

    const section = INTENT_SECTION[intent] ?? null;
    const allowed = await this.canUseIntent(userId, companyId, section);

    if (!allowed) {
      return {
        reply: 'No tienes acceso a esa información con tu usuario actual.',
        tokensUsed: result.tokensUsed,
      };
    }

    const inicio = Date.now();
    const dataResult = await this.processor.executeQuery(
      intent,
      params,
      userId,
      companyId,
    );
    const auditoria = {
      intent,
      params,
      ms: Date.now() - inicio,
      caracteresDeDatos: dataResult.length,
    };

    try {
      const finalResult = await this.vertexChat.sendChat(
        esVentas
          ? SYSTEM_REDACCION_VENTAS
          : // "Concisa" a secas hacía que el modelo resumiera listas y omitiera
            // clientes (p. ej. "¿a quién atiendo hoy?" respondía solo uno de tres).
            'Responde de forma clara y breve, en español, basándote en los datos proporcionados. Si los datos traen una lista, menciona TODOS sus elementos (no resumas ni omitas ninguno) y respeta cualquier aviso que incluyan.',
        [],
        `Datos del sistema:\n${dataResult}\n\nPregunta original: ${message}`,
        esVentas
          ? { maxOutputTokens: 4096, nivel: 'fuerte' }
          : { nivel: 'ligero' },
      );
      let reply = finalResult.reply || dataResult;
      let extra: Record<string, unknown> = {};
      // Las marcas de evidencia que el modelo cite se comprueban contra los
      // datos que se le dieron: una inventada se quita y se avisa.
      if (esVentas) {
        const v = verificarCitas(reply, dataResult);
        reply = v.respuesta;
        extra = { citas: v.citadas, citasNoVerificadas: v.noVerificadas };
      }
      return {
        reply,
        tokensUsed: result.tokensUsed + finalResult.tokensUsed,
        auditoria: { ...auditoria, ...extra },
      };
    } catch {
      return { reply: dataResult, tokensUsed: result.tokensUsed, auditoria };
    }
  }

  // ¿Tiene esta persona asignado el Agente de Ventas (y acceso a Ventas)? Si sí,
  // Agente Gemeseg puede mandarla allá para datos en vivo.
  private async tieneAgenteVentas(
    userId: number,
    allowedKeys: string[],
  ): Promise<boolean> {
    if (!allowedKeys.includes('VENTAS')) return false;
    const n = await this.prisma.userAgent.count({
      where: { userId, agent: { scope: SCOPE_VENTAS, isActive: true } },
    });
    return n > 0;
  }

  private async mockResponse(
    message: string,
    context: string,
  ): Promise<string> {
    await new Promise((r) => setTimeout(r, 800));

    const lower = message.toLowerCase();

    if (lower.includes('proyecto')) {
      const projects = await this.prisma.project.findMany({
        take: 5,
        orderBy: { createdAt: 'desc' },
      });
      if (projects.length === 0) return 'No hay proyectos registrados.';
      const list = projects.map((p) => `- ${p.name} [${p.status}]`).join('\n');
      return `Tus proyectos:\n${list}`;
    }

    if (lower.includes('tarea')) {
      const tasks = await this.prisma.task.groupBy({
        by: ['status'],
        _count: { id: true },
      });
      const counts = tasks.map((t) => `${t.status}: ${t._count.id}`).join(', ');
      return `Resumen de tareas: ${counts || 'No hay tareas'}`;
    }

    if (
      lower.includes('usuario') ||
      lower.includes('perfil') ||
      lower.includes('quién soy')
    ) {
      return 'Puedo mostrarte tu información de perfil. Usa la sección de tu perfil para más detalles.';
    }

    return `Estoy en modo respaldo (IA no disponible temporalmente). Pregúntame sobre proyectos, tareas o tu información. Contexto: ${context}.`;
  }

  // El Agente de Ventas registra su uso con otra acción para poder contarlo aparte.
  private accionLog(perfil: PerfilAgente): string {
    return perfil === 'VENTAS' ? 'chat_message_ventas' : 'chat_message';
  }

  private async checkRateLimit(userId: number, perfil: PerfilAgente = 'GENERAL') {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const count = await this.prisma.aiLog.count({
      where: {
        userId,
        action: { in: ['chat_message', 'chat_message_ventas'] },
        createdAt: { gte: today },
        success: true,
      },
    });

    if (count >= RATE_LIMIT) {
      throw new HttpException(
        `Has alcanzado el límite de ${RATE_LIMIT} mensajes hoy. Intenta mañana.`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    if (perfil === 'VENTAS') {
      const deVentas = await this.prisma.aiLog.count({
        where: {
          userId,
          action: 'chat_message_ventas',
          createdAt: { gte: today },
          success: true,
        },
      });
      if (deVentas >= RATE_LIMIT_VENTAS) {
        throw new HttpException(
          `Has alcanzado el límite de ${RATE_LIMIT_VENTAS} mensajes al Agente de Ventas hoy. Intenta mañana.`,
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
    }
  }

  // Mismo criterio de "autoreparación" que ya usa
  // ReclutamientoIaService.getDocumentReviewerInstructions() para su agente
  // de sistema: si no existe ningún Agent con isDefault:true (nunca se
  // sembró, o se borró por accidente desde /sistemas/agentes), se crea acá
  // mismo en vez de caer silenciosamente al id 1 — así Agente Gemeseg nunca
  // puede desaparecer del catálogo de admin de forma permanente.
  private async getDefaultAgentId(): Promise<number> {
    const existing = await this.prisma.agent.findFirst({
      where: { createdBy: null, isDefault: true },
      select: { id: true },
    });
    if (existing) return existing.id;

    const created = await this.prisma.agent.create({
      data: {
        name: 'Agente Gemeseg',
        instructions: BASE_SYSTEM_PROMPT,
        scope: 'GLOBAL',
        isDefault: true,
      },
    });
    return created.id;
  }

  private async getOrCreateConversation(
    conversationId: number | undefined,
    userId: number,
    context: string,
    agentId: number,
  ) {
    if (conversationId) {
      const conv = await this.prisma.conversation.findUnique({
        where: { id: conversationId },
      });
      if (conv && conv.userId === userId) return conv;
    }

    return this.prisma.conversation.create({
      data: { userId, context, agentId },
    });
  }

  /**
   * Últimos 20 mensajes (antes eran los PRIMEROS 20: en una conversación
   * larga el modelo nunca veía lo más reciente), con el rol real de cada uno
   * en vez de asumir que alternan. Se descartan los generados con una
   * sección que el usuario ya no tiene, y los anteriores a que existiera la
   * columna `sections` (null): no hay forma de saber con qué permisos se
   * respondieron, así que por seguridad no se reenvían al modelo.
   */
  private async getConversationHistory(
    conversationId: number,
    allowedKeys: string[],
  ): Promise<ChatTurn[]> {
    const messages = await this.prisma.chatMessage.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: { role: true, content: true, sections: true },
    });

    const allowed = new Set(allowedKeys);
    return messages
      .reverse()
      .filter(
        (m) =>
          m.sections !== null &&
          m.sections
            .split(',')
            .filter(Boolean)
            .every((key) => allowed.has(key)),
      )
      .map((m) => ({
        role: m.role === 'assistant' ? 'assistant' : 'user',
        content: m.content,
      }));
  }

  private async getSystemPromptForAgent(agentId: number): Promise<string> {
    const agent = await this.prisma.agent.findUnique({
      where: { id: agentId },
      select: { instructions: true, isActive: true },
    });

    if (agent?.isActive) {
      return agent.instructions;
    }

    return BASE_SYSTEM_PROMPT;
  }

  async getConversationsByAgent(userId: number, agentId?: number) {
    const where: any = { userId };
    if (agentId) where.agentId = agentId;

    return this.prisma.conversation.findMany({
      where,
      include: {
        agent: { select: { id: true, name: true } },
        _count: { select: { messages: true } },
      },
      orderBy: { updatedAt: 'desc' },
    });
  }

  async getConversationMessages(conversationId: number, userId: number) {
    const conv = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
    });
    if (!conv || conv.userId !== userId) {
      throw new HttpException(
        'Conversacion no encontrada',
        HttpStatus.NOT_FOUND,
      );
    }

    const messages = await this.prisma.chatMessage.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'asc' },
      select: { id: true, role: true, content: true, createdAt: true },
    });

    return messages.map((m) => ({
      id: String(m.id),
      role: m.role,
      content: m.content,
      timestamp: m.createdAt,
    }));
  }

  async deleteConversation(conversationId: number, userId: number) {
    const conv = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
    });
    if (!conv || conv.userId !== userId) {
      throw new HttpException(
        'Conversacion no encontrada',
        HttpStatus.NOT_FOUND,
      );
    }
    // ChatMessage.conversation tiene onDelete: Cascade — borra sus mensajes
    // solo, sin tocar nada más.
    await this.prisma.conversation.delete({ where: { id: conversationId } });
    return { message: 'Conversación eliminada' };
  }

  private async logAi(
    userId: number,
    action: string,
    tokensUsed: number,
    success: boolean,
    errorMessage?: string,
    metadata?: Record<string, unknown>,
  ) {
    await this.prisma.aiLog.create({
      data: {
        userId,
        action,
        model: this.vertexChat.estaConfigurado()
          ? this.vertexModelForLog(metadata?.perfil as string | undefined)
          : 'mock',
        tokensUsed,
        success,
        errorMessage,
        // Qué agente respondió, qué consulta usó y cuántas citas de evidencia
        // se verificaron: para poder auditar una respuesta del Agente de Ventas.
        ...(metadata ? { metadata: metadata as object } : {}),
      },
    });
  }
}
