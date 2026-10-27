import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AGENT_CHAT_REGISTRO_DDL } from './agentes-chat-registro.schema';

const HORAS_ECUADOR_MS = 5 * 3600 * 1000;
const DIA_MS = 24 * 3600 * 1000;
const ACCIONES_CHAT = ['chat_message', 'chat_message_ventas'];
// Tope de filas que se leen para el resumen: con el límite diario por persona sobra de largo.
const MAX_FILAS_RESUMEN = 20000;
// Cuántas respuestas antiguas se copian por vuelta al traer el historial que ya existía.
const LOTE_COPIA = 200;

export interface FiltrosHistorial {
  agentId?: number;
  userId?: number;
  /** Días de Ecuador, 'YYYY-MM-DD'. */
  desde?: string;
  hasta?: string;
  limit?: number;
  offset?: number;
}

export interface RegistroDePregunta {
  chatMessageId: number;
  agentId: number;
  userId: number;
  companyId: number | null;
  contexto: string | null;
  pregunta: string;
  respuesta: string;
  modelo: string | null;
  tokens: number;
  duracionMs: number;
  exito: boolean;
  error?: string | null;
  detalle?: Record<string, unknown> | null;
}

// Medianoche de Ecuador (UTC-5) de un día 'YYYY-MM-DD' como instante.
function inicioDiaEcuador(dia: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dia)) return null;
  const d = new Date(`${dia}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? null : new Date(d.getTime() + HORAS_ECUADOR_MS);
}

/**
 * Historial de lo que se les ha preguntado a los agentes de chat (Agente Gemeseg, Agente de Ventas…)
 * para Sistemas → Agentes. Vive en su propia tabla (AgentChatRegistro, sin claves foráneas): cada
 * pregunta respondida se guarda al responder, así que sigue ahí aunque la persona borre su conversación.
 * Lo que ya existía en ChatMessage antes de esta tabla se copia al arrancar (ver `copiarHistorialAnterior`).
 */
@Injectable()
export class AgentesHistorialService implements OnModuleInit {
  private readonly logger = new Logger(AgentesHistorialService.name);

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    try {
      for (const sql of AGENT_CHAT_REGISTRO_DDL) await this.prisma.$executeRawUnsafe(sql);
    } catch (err) {
      this.logger.warn(
        `No se pudo asegurar la tabla AgentChatRegistro: ${(err as Error).message}`,
      );
      return;
    }
    // Sin await: no retrasa el arranque, y si la instancia se apaga a medias la siguiente continúa donde quedó.
    void this.copiarHistorialAnterior().catch((err) =>
      this.logger.warn(`No se pudo copiar el historial anterior: ${(err as Error).message}`),
    );
  }

  /** Guarda una pregunta respondida. Un fallo aquí nunca debe romper el chat: solo se anota en el log. */
  async registrar(r: RegistroDePregunta): Promise<void> {
    try {
      const [agente, persona] = await Promise.all([
        this.prisma.agent.findUnique({
          where: { id: r.agentId },
          select: { name: true, scope: true },
        }),
        this.prisma.user.findUnique({ where: { id: r.userId }, select: { fullName: true } }),
      ]);
      const consulta = typeof r.detalle?.intent === 'string' ? r.detalle.intent : null;
      await this.prisma.agentChatRegistro.create({
        data: {
          chatMessageId: r.chatMessageId,
          agentId: r.agentId,
          agentNombre: agente?.name ?? `Agente ${r.agentId}`,
          agentScope: agente?.scope ?? null,
          companyId: r.companyId,
          userId: r.userId,
          userNombre: persona?.fullName ?? null,
          contexto: r.contexto,
          pregunta: r.pregunta,
          respuesta: r.respuesta,
          modelo: r.modelo,
          tokens: r.tokens,
          duracionMs: r.duracionMs,
          exito: r.exito,
          error: r.error ? r.error.slice(0, 500) : null,
          consulta,
          ...(r.detalle ? { detalle: r.detalle as Prisma.InputJsonObject } : {}),
        },
      });
    } catch (err) {
      this.logger.warn(`No se pudo guardar la pregunta en el historial: ${(err as Error).message}`);
    }
  }

  /**
   * Copia a AgentChatRegistro las respuestas que ya estaban en ChatMessage antes de que existiera la
   * tabla (las conversaciones que alguien ya borró no se pueden recuperar). Se puede repetir sin
   * duplicar: solo toma las respuestas que todavía no tienen su fila.
   */
  private async copiarHistorialAnterior() {
    for (;;) {
      const faltan = await this.prisma.$queryRaw<{ id: number }[]>`
        SELECT m."id" FROM "ChatMessage" m
        WHERE m."role" = 'assistant'
          AND NOT EXISTS (SELECT 1 FROM "AgentChatRegistro" r WHERE r."chatMessageId" = m."id")
        ORDER BY m."id" ASC
        LIMIT ${LOTE_COPIA}`;
      if (faltan.length === 0) return;
      const items = await this.armarDesdeChat({ id: { in: faltan.map((f) => f.id) } });
      if (items.length > 0) {
        await this.prisma.agentChatRegistro.createMany({
          data: items.map((i) => ({
            chatMessageId: i.id,
            agentId: i.agentId,
            agentNombre: i.agentNombre,
            agentScope: i.agentScope,
            companyId: i.companyId,
            userId: i.userId,
            userNombre: i.userNombre,
            contexto: i.contexto,
            pregunta: i.pregunta,
            respuesta: i.respuesta,
            modelo: i.modelo,
            tokens: i.tokens,
            duracionMs: i.duracionMs,
            exito: i.exito,
            error: i.error,
            consulta: i.consulta,
            ...(i.detalle ? { detalle: i.detalle as Prisma.InputJsonObject } : {}),
            createdAt: i.createdAt,
          })),
          skipDuplicates: true,
        });
      }
      // Si por algún motivo no se pudo armar ninguna, no se repite el mismo lote para siempre.
      if (items.length === 0) return;
    }
  }

  /** Arma cada respuesta de ChatMessage con su pregunta, su fallo y la consulta que usó (de AiLog). */
  private async armarDesdeChat(where: Prisma.ChatMessageWhereInput) {
    const respuestas = await this.prisma.chatMessage.findMany({
      where: { role: 'assistant', ...where },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: {
        id: true,
        conversationId: true,
        content: true,
        tokensUsed: true,
        model: true,
        createdAt: true,
        conversation: {
          select: {
            context: true,
            agent: { select: { id: true, name: true, scope: true } },
            user: { select: { id: true, fullName: true, companyId: true } },
          },
        },
      },
    });
    if (respuestas.length === 0) return [];

    // La pregunta de cada respuesta: el último mensaje de la persona anterior a ella en esa conversación.
    const preguntas = await this.prisma.chatMessage.findMany({
      where: {
        role: 'user',
        conversationId: { in: [...new Set(respuestas.map((r) => r.conversationId))] },
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: { id: true, conversationId: true, content: true, createdAt: true },
    });
    const porConversacion = new Map<number, typeof preguntas>();
    for (const q of preguntas) {
      const lista = porConversacion.get(q.conversationId) ?? [];
      lista.push(q);
      porConversacion.set(q.conversationId, lista);
    }

    // Registro de uso: un fallo se anota justo antes de la respuesta; el resto (consulta usada, citas)
    // justo después. Se busca por persona y por la ventana de tiempo de esa pregunta.
    const parejas = respuestas.map((r) => {
      const q = [...(porConversacion.get(r.conversationId) ?? [])]
        .reverse()
        .find((m) => m.createdAt.getTime() <= r.createdAt.getTime());
      return { r, q: q ?? null };
    });
    const usuarios = [...new Set(respuestas.map((r) => r.conversation.user.id))];
    const inicio = Math.min(...parejas.map(({ r, q }) => (q ?? r).createdAt.getTime()));
    const fin = Math.max(...respuestas.map((r) => r.createdAt.getTime())) + 15000;
    const registros = await this.prisma.aiLog.findMany({
      where: {
        userId: { in: usuarios },
        action: { in: ACCIONES_CHAT },
        createdAt: { gte: new Date(inicio - 1000), lte: new Date(fin) },
      },
      orderBy: { createdAt: 'asc' },
      select: {
        userId: true,
        success: true,
        errorMessage: true,
        metadata: true,
        createdAt: true,
      },
    });

    return parejas.map(({ r, q }) => {
      const t0 = (q ?? r).createdAt.getTime();
      const t1 = r.createdAt.getTime();
      const deEsaPersona = registros.filter((g) => g.userId === r.conversation.user.id);
      const fallo = deEsaPersona.find(
        (g) => !g.success && g.createdAt.getTime() >= t0 - 1000 && g.createdAt.getTime() <= t1 + 1000,
      );
      const uso = deEsaPersona.find(
        (g) => g.success && g.createdAt.getTime() >= t1 - 1000 && g.createdAt.getTime() <= t1 + 15000,
      );
      const detalle =
        uso?.metadata && typeof uso.metadata === 'object' && !Array.isArray(uso.metadata)
          ? (uso.metadata as Record<string, unknown>)
          : null;
      return {
        id: r.id,
        agentId: r.conversation.agent.id,
        agentNombre: r.conversation.agent.name,
        agentScope: r.conversation.agent.scope,
        companyId: r.conversation.user.companyId,
        userId: r.conversation.user.id,
        userNombre: r.conversation.user.fullName,
        contexto: r.conversation.context,
        pregunta: q?.content ?? null,
        respuesta: r.content,
        createdAt: r.createdAt,
        duracionMs: q ? Math.max(t1 - t0, 0) : null,
        tokens: r.tokensUsed,
        modelo: r.model,
        exito: !fallo,
        error: fallo?.errorMessage ? fallo.errorMessage.slice(0, 500) : null,
        consulta: typeof detalle?.intent === 'string' ? detalle.intent : null,
        detalle,
      };
    });
  }

  private deLaEmpresa(
    companyId: number | null,
    f: Pick<FiltrosHistorial, 'agentId' | 'userId'>,
  ): Prisma.AgentChatRegistroWhereInput {
    return {
      ...(companyId !== null ? { companyId } : {}),
      ...(f.agentId ? { agentId: f.agentId } : {}),
      ...(f.userId ? { userId: f.userId } : {}),
    };
  }

  /** `companyId` null = super admin: ve todas las empresas. */
  async listar(companyId: number | null, f: FiltrosHistorial) {
    const desde = f.desde ? inicioDiaEcuador(f.desde) : null;
    const hastaDia = f.hasta ? inicioDiaEcuador(f.hasta) : null;
    const hastaExclusivo = hastaDia ? new Date(hastaDia.getTime() + DIA_MS) : null;
    const where: Prisma.AgentChatRegistroWhereInput = {
      ...this.deLaEmpresa(companyId, f),
      ...(desde || hastaExclusivo
        ? {
            createdAt: {
              ...(desde ? { gte: desde } : {}),
              ...(hastaExclusivo ? { lt: hastaExclusivo } : {}),
            },
          }
        : {}),
    };
    const limit = Math.min(Math.max(f.limit ?? 20, 1), 100);

    const [total, filas] = await Promise.all([
      this.prisma.agentChatRegistro.count({ where }),
      this.prisma.agentChatRegistro.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: limit,
        skip: Math.max(f.offset ?? 0, 0),
      }),
    ]);

    const items = filas.map((r) => ({
      id: r.id,
      agentId: r.agentId,
      agentNombre: r.agentNombre,
      agentScope: r.agentScope,
      userId: r.userId,
      userNombre: r.userNombre ?? 'Persona eliminada',
      contexto: r.contexto,
      pregunta: r.pregunta,
      respuesta: r.respuesta,
      createdAt: r.createdAt,
      duracionMs: r.duracionMs,
      tokens: r.tokens,
      modelo: r.modelo,
      exito: r.exito,
      error: r.error,
      consulta: r.consulta,
      detalle:
        r.detalle && typeof r.detalle === 'object' && !Array.isArray(r.detalle)
          ? (r.detalle as Record<string, unknown>)
          : null,
    }));
    return { total, items };
  }

  /** Por agente, lo que se le preguntó en los últimos `dias`; y las personas que preguntaron (para filtrar). */
  async resumen(companyId: number | null, dias = 30) {
    const desde = new Date(Date.now() - Math.max(dias, 1) * DIA_MS);
    const filas = await this.prisma.agentChatRegistro.findMany({
      where: { createdAt: { gte: desde }, ...this.deLaEmpresa(companyId, {}) },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: MAX_FILAS_RESUMEN,
      select: {
        agentId: true,
        agentNombre: true,
        userId: true,
        userNombre: true,
        tokens: true,
        duracionMs: true,
        exito: true,
        createdAt: true,
      },
    });

    const porAgente = new Map<
      number,
      {
        agentId: number;
        agentNombre: string;
        preguntas: number;
        fallos: number;
        tokens: number;
        duraciones: number[];
        personas: Set<number>;
        ultima: Date;
      }
    >();
    const personas = new Map<number, string>();
    for (const f of filas) {
      if (f.agentId === null) continue;
      if (f.userId !== null) personas.set(f.userId, f.userNombre ?? `Persona ${f.userId}`);
      const a = porAgente.get(f.agentId) ?? {
        agentId: f.agentId,
        agentNombre: f.agentNombre,
        preguntas: 0,
        fallos: 0,
        tokens: 0,
        duraciones: [],
        personas: new Set<number>(),
        ultima: f.createdAt,
      };
      a.preguntas++;
      if (!f.exito) a.fallos++;
      a.tokens += f.tokens ?? 0;
      if (f.userId !== null) a.personas.add(f.userId);
      if (f.duracionMs !== null) a.duraciones.push(f.duracionMs);
      if (f.createdAt > a.ultima) a.ultima = f.createdAt;
      porAgente.set(f.agentId, a);
    }

    return {
      dias,
      agentes: [...porAgente.values()]
        .sort((x, y) => y.ultima.getTime() - x.ultima.getTime())
        .map((a) => ({
          agentId: a.agentId,
          agentNombre: a.agentNombre,
          preguntas: a.preguntas,
          personas: a.personas.size,
          fallos: a.fallos,
          tokens: a.tokens,
          tokensPorPregunta: a.preguntas ? Math.round(a.tokens / a.preguntas) : 0,
          duracionPromedioMs: a.duraciones.length
            ? Math.round(a.duraciones.reduce((x, y) => x + y, 0) / a.duraciones.length)
            : null,
          ultima: a.ultima,
        })),
      personas: [...personas.entries()]
        .map(([id, nombre]) => ({ id, nombre }))
        .sort((x, y) => x.nombre.localeCompare(y.nombre, 'es')),
    };
  }
}
