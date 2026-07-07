import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AiProcessor } from './ai.processor';
import { SendMessageDto } from './dto/send-message.dto';

const RATE_LIMIT = 50;
const MODEL = 'gpt-4o-mini';
const API_URL = 'https://models.inference.ai.azure.com/chat/completions';

const SYSTEM_PROMPT = `Eres el agente de GEMESEG, un sistema de gestión de proyectos y tareas.
Puedes responder preguntas sobre los datos del usuario: proyectos, tareas, miembros, estadísticas.
Cuando el usuario pregunte algo, responde de forma concisa y útil en español.
Si necesitas datos específicos, indica la intención con el formato [INTENCION: nombre_intencion].
Intenciones disponibles:
- list_projects: listar proyectos del usuario
- count_tasks_by_status: contar tareas por estado
- user_info: información del usuario actual
- project_summary: resumen de un proyecto
- list_my_tasks: listar tareas asignadas al usuario
Si no necesitas datos, responde directamente.`;

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private githubToken: string;

  constructor(
    private prisma: PrismaService,
    private processor: AiProcessor,
  ) {
    this.githubToken = process.env.GITHUB_TOKEN || '';
    if (this.githubToken && this.githubToken !== 'YOUR_GITHUB_TOKEN_HERE') {
      this.logger.log('Usando GitHub Models (gpt-4o-mini)');
    } else {
      this.logger.warn('GITHUB_TOKEN no configurado — chat funcionará con respuestas mock');
    }
  }

  async sendMessage(dto: SendMessageDto, userId: number) {
    await this.checkRateLimit(userId);

    const conversation = await this.getOrCreateConversation(dto.conversationId, userId, dto.context);

    await this.prisma.chatMessage.create({
      data: {
        conversationId: conversation.id,
        role: 'user',
        content: dto.message,
      },
    });

    const history = await this.getConversationHistory(conversation.id);

    let reply: string;
    let tokensUsed = 0;

    try {
      if (this.githubToken && this.githubToken !== 'YOUR_GITHUB_TOKEN_HERE') {
        const result = await this.callGitHubModels(dto.message, dto.context, history, userId);
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
        model: this.githubToken && this.githubToken !== 'YOUR_GITHUB_TOKEN_HERE' ? MODEL : 'mock',
      },
    });

    await this.logAi(userId, 'chat_message', tokensUsed, true);

    return {
      reply,
      conversationId: conversation.id,
    };
  }

  private async callGitHubModels(message: string, context: string, history: string[], userId: number) {
    const systemPrompt = await this.getSystemPrompt(userId);

    const messages = [
      { role: 'system', content: systemPrompt },
      ...history.map((msg, i) => ({
        role: i % 2 === 0 ? 'user' : 'assistant',
        content: msg,
      })),
      { role: 'user', content: `[Contexto: ${context}] ${message}` },
    ];

    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.githubToken}`,
      },
      body: JSON.stringify({
        model: MODEL,
        messages,
        max_tokens: 1024,
        temperature: 0.7,
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`GitHub Models error ${response.status}: ${errorBody}`);
    }

    const data = await response.json();
    const text = data.choices?.[0]?.message?.content || 'No pude generar una respuesta.';
    const tokensUsed = data.usage?.total_tokens || 0;

    const intentMatch = text.match(/\[INTENCION:\s*(\w+)(?:\(([^)]+)\))?\]/);

    if (intentMatch) {
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

      const dataResult = await this.processor.executeQuery(intent, params, userId);

      try {
        const finalResponse = await fetch(API_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.githubToken}`,
          },
          body: JSON.stringify({
            model: MODEL,
            messages: [
              { role: 'system', content: 'Responde de forma concisa basándote en los datos proporcionados.' },
              { role: 'user', content: `Datos del sistema:\n${dataResult}\n\nPregunta original: ${message}` },
            ],
            max_tokens: 512,
            temperature: 0.5,
          }),
        });

        if (!finalResponse.ok) {
          return { reply: dataResult, tokensUsed };
        }

        const finalData = await finalResponse.json();
        return {
          reply: finalData.choices?.[0]?.message?.content || dataResult,
          tokensUsed: tokensUsed + (finalData.usage?.total_tokens || 0),
        };
      } catch {
        return { reply: dataResult, tokensUsed };
      }
    }

    return { reply: text, tokensUsed };
  }

  private async mockResponse(message: string, context: string): Promise<string> {
    await new Promise((r) => setTimeout(r, 800));

    const lower = message.toLowerCase();

    if (lower.includes('proyecto')) {
      const projects = await this.prisma.project.findMany({ take: 5, orderBy: { createdAt: 'desc' } });
      if (projects.length === 0) return 'No hay proyectos registrados.';
      const list = projects.map((p) => `- ${p.name} [${p.status}]`).join('\n');
      return `Tus proyectos:\n${list}`;
    }

    if (lower.includes('tarea')) {
      const tasks = await this.prisma.task.groupBy({ by: ['status'], _count: { id: true } });
      const counts = tasks.map((t) => `${t.status}: ${t._count.id}`).join(', ');
      return `Resumen de tareas: ${counts || 'No hay tareas'}`;
    }

    if (lower.includes('usuario') || lower.includes('perfil') || lower.includes('quién soy')) {
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

  private async getOrCreateConversation(conversationId: number | undefined, userId: number, context: string) {
    if (conversationId) {
      const conv = await this.prisma.conversation.findUnique({ where: { id: conversationId } });
      if (conv && conv.userId === userId) return conv;
    }

    return this.prisma.conversation.create({
      data: { userId, context },
    });
  }

  private async getConversationHistory(conversationId: number): Promise<string[]> {
    const messages = await this.prisma.chatMessage.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'asc' },
      take: 20,
    });

    return messages.map((m) => m.content);
  }

  private async getSystemPrompt(userId: number): Promise<string> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { activeAgentId: true },
    });

    if (user?.activeAgentId) {
      const agent = await this.prisma.agent.findUnique({
        where: { id: user.activeAgentId },
        select: { instructions: true, isActive: true },
      });
      if (agent?.isActive) {
        return agent.instructions;
      }
    }

    return SYSTEM_PROMPT;
  }

  private async logAi(userId: number, action: string, tokensUsed: number, success: boolean, errorMessage?: string) {
    await this.prisma.aiLog.create({
      data: {
        userId,
        action,
        model: this.githubToken && this.githubToken !== 'YOUR_GITHUB_TOKEN_HERE' ? MODEL : 'mock',
        tokensUsed,
        success,
        errorMessage,
      },
    });
  }
}
