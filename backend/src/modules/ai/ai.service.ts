import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AiProcessor, INTENT_SECTION } from './ai.processor';
import { VertexChatClient, ChatTurn } from './vertex-chat.client';
import { ALL_SECTIONS, PermissionsService } from '../permissions/permissions.service';
import { parseKnowledgeBase, filterKnowledgeBase } from './knowledge-base.util';
import { buildCapabilitiesPrompt } from './capabilities-prompt.util';
import { buildSystemGuide } from './system-guide.util';
import { SendMessageDto } from './dto/send-message.dto';

const RATE_LIMIT = 50;

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
export class AiService {
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

  async sendMessage(
    dto: SendMessageDto,
    userId: number,
    companyId: number | null,
  ) {
    await this.checkRateLimit(userId);

    const agentId = dto.agentId || (await this.getDefaultAgentId());
    const conversation = await this.getOrCreateConversation(
      dto.conversationId,
      userId,
      dto.context,
      agentId,
    );

    // Permisos de AHORA, no los de cuando se creó la conversación: cada
    // mensaje guarda con qué secciones se generó, y el historial que se le
    // manda al modelo descarta los turnos generados con una sección que el
    // usuario ya perdió — si no, el modelo relee sus propias respuestas
    // viejas y sigue hablando de un módulo que le quitaron (pasó 2026-09-30).
    const allowedKeys = await this.getAllowedSectionKeys(companyId, userId);
    const sections = sectionsSnapshot(allowedKeys);

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
        );
        reply = result.reply;
        tokensUsed = result.tokensUsed;
      } else {
        reply = await this.mockResponse(dto.message, dto.context);
      }
    } catch (error) {
      this.logger.error(`Error en chat: ${error.message}`);
      await this.logAi(userId, 'chat_message', 0, false, error.message);
      this.logger.warn('Error en IA, usando modo mock como fallback');
      reply = await this.mockResponse(dto.message, dto.context);
    }

    await this.prisma.chatMessage.create({
      data: {
        conversationId: conversation.id,
        role: 'assistant',
        content: reply,
        tokensUsed,
        model: configured ? this.vertexModelForLog() : 'mock',
        sections,
      },
    });

    await this.logAi(userId, 'chat_message', tokensUsed, true);

    return {
      reply,
      conversationId: conversation.id,
      agentId: conversation.agentId,
    };
  }

  private vertexModelForLog(): string {
    return process.env.GOOGLE_VERTEX_CHAT_MODEL || 'gemini-2.5-flash';
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
    if (!perm) return true;
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
        return !perm || perm.canView;
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
  ) {
    const basePrompt = await this.getSystemPromptForAgent(agentId);
    const allowedKeys =
      allowedKeysParam ?? (await this.getAllowedSectionKeys(companyId, userId));
    const capabilities = buildCapabilitiesPrompt(allowedKeys);
    const kbContext = await this.getFilteredKnowledgeBase(
      companyId,
      userId,
      allowedKeys,
    );
    const systemPrompt = [
      basePrompt,
      capabilities,
      `Manual de uso del sistema (lo que este usuario puede usar):\n\n${buildSystemGuide(allowedKeys)}`,
      kbContext &&
        `Contexto adicional de la empresa (políticas, procesos internos; complementa el manual):\n${kbContext}`,
    ]
      .filter(Boolean)
      .join('\n\n');

    const result = await this.vertexChat.sendChat(
      systemPrompt,
      chatHistory,
      `[Contexto: ${context}] ${message}`,
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

    const section = INTENT_SECTION[intent] ?? null;
    const allowed = await this.canUseIntent(userId, companyId, section);

    if (!allowed) {
      return {
        reply: 'No tienes acceso a esa información con tu usuario actual.',
        tokensUsed: result.tokensUsed,
      };
    }

    const dataResult = await this.processor.executeQuery(
      intent,
      params,
      userId,
      companyId,
    );

    try {
      const finalResult = await this.vertexChat.sendChat(
        'Responde de forma concisa basándote en los datos proporcionados.',
        [],
        `Datos del sistema:\n${dataResult}\n\nPregunta original: ${message}`,
      );
      return {
        reply: finalResult.reply || dataResult,
        tokensUsed: result.tokensUsed + finalResult.tokensUsed,
      };
    } catch {
      return { reply: dataResult, tokensUsed: result.tokensUsed };
    }
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

  private async checkRateLimit(userId: number) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const count = await this.prisma.aiLog.count({
      where: {
        userId,
        action: 'chat_message',
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
  ) {
    await this.prisma.aiLog.create({
      data: {
        userId,
        action,
        model: this.vertexChat.estaConfigurado()
          ? this.vertexModelForLog()
          : 'mock',
        tokensUsed,
        success,
        errorMessage,
      },
    });
  }
}
