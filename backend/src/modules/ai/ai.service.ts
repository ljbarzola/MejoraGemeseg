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
import { AgentesHistorialService } from './agentes-historial.service';
import { VertexChatClient, ChatTurn } from './vertex-chat.client';
import {
  ALL_SECTIONS,
  PermissionsService,
  permiteSinFila,
} from '../permissions/permissions.service';
import { parseKnowledgeBase, filterKnowledgeBase } from './knowledge-base.util';
import { buildCapabilitiesPrompt } from './capabilities-prompt.util';
import { buildSystemGuide } from './system-guide.util';
import { esAgenteSinChat } from '../agents/agent-trabajadores.const';
import { buildBitacoraPrompt } from '../contratacion-publica/bitacoras/bitacora-prompt.util';
import { SendMessageDto } from './dto/send-message.dto';
import {
  SCOPE_CACAO,
  SCOPE_VENTAS,
  intencionPermitida,
  perfilDeAgente,
  seccionDePerfil,
  type PerfilAgente,
} from './agent-profiles.util';
import {
  CACAO_AYUDA,
  INSTRUCCIONES_CACAO_POR_DEFECTO,
  MENSAJE_CACAO_ERROR,
  MENSAJE_CACAO_SIN_IA,
  SYSTEM_REDACCION_CACAO,
  buildCacaoAgentPrompt,
} from './cacao-agent-prompt.util';
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
// El Agente de Cacao también consulta datos y redacta con ellos: su propio tope diario.
const RATE_LIMIT_CACAO = 30;

// Nombres de los agentes del sistema con perfil propio (el del chat y Sistemas → Agentes).
const NOMBRE_AGENTE_VENTAS = 'Agente de Ventas';
const NOMBRE_AGENTE_CACAO = 'Agente de Cacao';

// Texto inicial EDITABLE del Agente de Ventas (Sistemas → Agentes). Solo pone
// tono y prioridades; las reglas para investigar sin inventar van en código
// (ventas-agent-prompt.util.ts) y no se pueden borrar desde ahí.
export const INSTRUCCIONES_VENTAS_POR_DEFECTO = `Tono profesional y cercano, directo y sin rodeos. Prioriza lo accionable: qué hacer con el cliente y para cuándo.
Cuando investigues por qué se perdió un cliente, no te quedes en el precio: revisa también la rapidez de la atención, el seguimiento y la calidad del servicio.
Tutea a la persona y usa los nombres de menús y botones tal como se ven en pantalla.`;

// Lo que ve quien le escribe al Agente de Ventas cuando la IA no responde. Antes caía al modo
// mock, que habla de proyectos y tareas y no sirve de nada en Ventas.
export const MENSAJE_VENTAS_SIN_IA =
  'El Agente de Ventas todavía no está conectado a la inteligencia artificial en este entorno (falta configurar Google Vertex AI). Avisa a Sistemas.';
export const MENSAJE_VENTAS_ERROR =
  'No pude consultar al Agente de Ventas en este momento. Intenta de nuevo en unos minutos; si sigue pasando, avisa a Sistemas.';
// Lo que el usuario lee cuando un agente especializado no puede responder, según su perfil.
const MENSAJE_SIN_IA: Partial<Record<PerfilAgente, string>> = {
  VENTAS: MENSAJE_VENTAS_SIN_IA,
  CACAO: MENSAJE_CACAO_SIN_IA,
};
const MENSAJE_ERROR: Partial<Record<PerfilAgente, string>> = {
  VENTAS: MENSAJE_VENTAS_ERROR,
  CACAO: MENSAJE_CACAO_ERROR,
};

// Cuánto de la conversación se le vuelve a mandar al modelo cuando redacta con datos del sistema:
// los últimos turnos, cada uno recortado (los datos ya son largos). Exportada para probarla.
export function historialParaDatos(historial: ChatTurn[]): ChatTurn[] {
  const MAX_TURNOS = 6;
  const MAX_CARACTERES = 1500;
  return historial.slice(-MAX_TURNOS).map((t) => ({
    role: t.role,
    content:
      t.content.length > MAX_CARACTERES
        ? `${t.content.slice(0, MAX_CARACTERES)}…`
        : t.content,
  }));
}

// Primera pregunta de una conversación, en una línea y sin pasar de 70 letras. Exportada para probarla.
export function tituloDeConversacion(texto: string): string | null {
  const limpio = texto.replace(/\s+/g, ' ').trim();
  if (!limpio) return null;
  return limpio.length > 70 ? `${limpio.slice(0, 69).trimEnd()}…` : limpio;
}

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

// Segunda llamada de Agente Gemeseg (redactar con los datos que devolvió el sistema).
// "Concisa" a secas hacía que el modelo resumiera listas y omitiera clientes (p. ej.
// "¿a quién atiendo hoy?" respondía solo uno de tres).
export const SYSTEM_REDACCION_GENERAL =
  'Responde de forma clara y breve, en español, basándote en los datos proporcionados. Si los datos traen una lista, menciona TODOS sus elementos (no resumas ni omitas ninguno) y respeta cualquier aviso que incluyan.';

/** Un bloque del prompt que recibe el modelo, para mostrarlo a Sistemas tal cual se envía. */
export interface ParteDelPrompt {
  titulo: string;
  texto: string;
  /** Quién lo cambia: el texto del agente (Sistemas), la base de conocimiento, el código o se calcula por persona. */
  origen: 'agente' | 'codigo' | 'persona' | 'empresa';
}

@Injectable()
export class AiService implements OnModuleInit {
  private readonly logger = new Logger(AiService.name);

  constructor(
    private prisma: PrismaService,
    private processor: AiProcessor,
    private vertexChat: VertexChatClient,
    private permissionsService: PermissionsService,
    // Opcional para que las pruebas que arman AiService a mano no tengan que pasarlo.
    private historial?: AgentesHistorialService,
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
    try {
      await this.ensureCacaoAgent();
    } catch (err: any) {
      this.logger.warn(`No se pudo sembrar el Agente de Cacao: ${err.message}`);
    }
  }

  private ensureSalesAgent() {
    return this.ensureSystemAgent(
      NOMBRE_AGENTE_VENTAS,
      SCOPE_VENTAS,
      INSTRUCCIONES_VENTAS_POR_DEFECTO,
    );
  }

  private ensureCacaoAgent() {
    return this.ensureSystemAgent(
      NOMBRE_AGENTE_CACAO,
      SCOPE_CACAO,
      INSTRUCCIONES_CACAO_POR_DEFECTO,
    );
  }

  // Siembra un agente del sistema (sin dueño) de un módulo: nunca pisa uno que ya exista, porque su
  // texto se edita desde Sistemas → Agentes.
  private async ensureSystemAgent(name: string, scope: string, instructions: string) {
    const existe = await this.prisma.agent.findFirst({
      where: { createdBy: null, scope },
      select: { id: true },
    });
    if (existe) return;
    await this.prisma.agent.create({
      data: { name, instructions, scope, isDefault: false },
    });
  }

  // Quién puede usar qué agente. Antes `agentId` llegaba del cliente y no se
  // validaba: cualquiera podía usar un agente que no tenía asignado. Los agentes
  // generales del sistema (sin dueño) los usa cualquiera, como en el selector;
  // un agente propio exige que esté asignado a la persona. El Agente de Ventas del
  // sistema (sin dueño) lo usa cualquiera que tenga acceso a Ventas, sin asignarlo
  // (2026-10-18); uno de Ventas creado por una persona sí exige asignación.
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
    // (prompt base), salvo los de Ventas y Cacao, que no tienen "prompt base" que los cubra.
    const especializado = perfilDeAgente(agent?.scope) !== 'GENERAL';
    if (!agent || (!agent.isActive && !especializado)) {
      // La conversación se crea con el agente que se devuelva aquí: uno que no
      // existe rompería la clave foránea, así que se usa el predeterminado.
      return {
        id: agent ? agentId : await this.getDefaultAgentId(),
        scope: null,
        perfil: 'GENERAL',
      };
    }
    // Un agente que trabaja solo (revisor de bitácoras) no conversa.
    if (esAgenteSinChat(agent.scope)) {
      throw new ForbiddenException(
        'Ese agente no conversa: se usa desde su pantalla (por ejemplo, Contratación Pública → Bitácoras).',
      );
    }
    if (especializado && !agent.isActive) {
      throw new ForbiddenException(
        agent.scope === SCOPE_CACAO
          ? 'El Agente de Cacao no está disponible ahora.'
          : 'El Agente de Ventas no está disponible ahora.',
      );
    }
    const esDelSistema = agent.createdBy === null;
    if (!esDelSistema && agent.createdBy !== userId) {
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
    if (agent.scope === SCOPE_CACAO && !allowedKeys.includes('CACAO')) {
      throw new ForbiddenException('No tienes acceso a Cacao con tu usuario actual.');
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
    const inicioRespuesta = Date.now();

    let reply: string;
    let tokensUsed = 0;
    let auditoria: Record<string, unknown> | undefined;
    let errorDeRespuesta: string | null = null;

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
          dto.clienteId,
        );
        reply = result.reply;
        tokensUsed = result.tokensUsed;
        auditoria = result.auditoria;
      } else if (agente.perfil !== 'GENERAL') {
        // El modo mock habla de proyectos y tareas: a un agente especializado se le dice la verdad.
        reply = MENSAJE_SIN_IA[agente.perfil] ?? MENSAJE_VENTAS_SIN_IA;
      } else {
        reply = await this.mockResponse(dto.message, dto.context);
      }
    } catch (error) {
      this.logger.error(`Error en chat: ${error.message}`);
      errorDeRespuesta = String(error.message ?? 'Error desconocido');
      await this.logAi(userId, this.accionLog(agente.perfil), 0, false, error.message, {
        agentId,
        perfil: agente.perfil,
      });
      if (agente.perfil !== 'GENERAL') {
        reply = MENSAJE_ERROR[agente.perfil] ?? MENSAJE_VENTAS_ERROR;
      } else {
        this.logger.warn('Error en IA, usando modo mock como fallback');
        reply = await this.mockResponse(dto.message, dto.context);
      }
    }

    const modeloUsado = configured ? this.vertexModelForLog(agente.perfil) : 'mock';
    const respuestaGuardada = await this.prisma.chatMessage.create({
      data: {
        conversationId: conversation.id,
        role: 'assistant',
        content: reply,
        tokensUsed,
        model: modeloUsado,
        sections,
      },
    });

    await this.logAi(userId, this.accionLog(agente.perfil), tokensUsed, true, undefined, {
      agentId,
      perfil: agente.perfil,
      ...(auditoria ?? {}),
    });

    // Copia propia de la pregunta y la respuesta para Sistemas → Agentes: sigue ahí aunque la persona
    // borre luego su conversación. Nunca rompe el chat (registrar() atrapa sus propios errores).
    await this.historial?.registrar({
      chatMessageId: respuestaGuardada.id,
      agentId,
      userId,
      companyId,
      contexto: dto.context ?? null,
      pregunta: dto.message,
      respuesta: reply,
      modelo: modeloUsado,
      tokens: tokensUsed,
      duracionMs: Date.now() - inicioRespuesta,
      exito: errorDeRespuesta === null,
      error: errorDeRespuesta,
      detalle: { agentId, perfil: agente.perfil, ...(auditoria ?? {}) },
    });

    return {
      reply,
      conversationId: conversation.id,
      agentId: conversation.agentId,
    };
  }

  // Los agentes especializados (Ventas y Cacao) usan el modelo 'fuerte': trabajan con cifras y
  // listas que no deben resumirse mal. El resto 'ligero'.
  private nivelDePerfil(perfil?: string | null): 'fuerte' | 'ligero' {
    return perfil === 'VENTAS' || perfil === 'CACAO' ? 'fuerte' : 'ligero';
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

  // Los bloques del prompt de la primera llamada, en el orden en que se envían. Lo usan el chat (los
  // une con una línea en blanco) y la pantalla Sistemas → Agentes (los muestra), así lo que se ve ahí
  // es exactamente lo que recibe el modelo.
  private armarPartesDelPrompt(p: {
    basePrompt: string;
    perfil: PerfilAgente;
    clavesVisibles: string[];
    ventasAgenteDisponible: boolean;
    cacaoAgenteDisponible: boolean;
    kbContext: string;
  }): ParteDelPrompt[] {
    const esVentas = p.perfil === 'VENTAS';
    const esCacao = p.perfil === 'CACAO';
    const especializado = esVentas || esCacao;
    const capabilities = esVentas
      ? `Consultas disponibles (datos reales de Ventas de la empresa):\n${VENTAS_AYUDA}`
      : esCacao
        ? `Consultas disponibles (datos reales de Cacao de la empresa):\n${CACAO_AYUDA}`
        : buildCapabilitiesPrompt(p.clavesVisibles, {
            ventasAgenteDisponible: p.ventasAgenteDisponible,
            cacaoAgenteDisponible: p.cacaoAgenteDisponible,
          });
    const partes: ParteDelPrompt[] = [
      {
        titulo: 'Texto propio del agente',
        texto: p.basePrompt,
        origen: 'agente',
      },
      {
        titulo: esCacao ? 'Reglas fijas del Agente de Cacao' : 'Reglas fijas del Agente de Ventas',
        texto: esVentas ? buildSalesAgentPrompt() : esCacao ? buildCacaoAgentPrompt() : '',
        origen: 'codigo',
      },
      {
        titulo: especializado
          ? 'Consultas que puede pedir al sistema'
          : 'Módulos y consultas disponibles',
        texto: capabilities,
        origen: especializado ? 'codigo' : 'persona',
      },
      {
        titulo: 'Manual de uso del sistema',
        texto: `Manual de uso del sistema (lo que este usuario puede usar):\n\n${buildSystemGuide(p.clavesVisibles)}`,
        origen: 'persona',
      },
      {
        titulo: 'Base de conocimiento de la empresa',
        texto: p.kbContext
          ? `Contexto adicional de la empresa (políticas, procesos internos; complementa el manual):\n${p.kbContext}`
          : '',
        origen: 'empresa',
      },
    ];
    return partes.filter((x) => x.texto);
  }

  /**
   * El prompt REAL de un agente, para Sistemas → Agentes. Un agente de chat recibe partes que dependen
   * de quién pregunta (el manual y los módulos salen de sus permisos), así que aquí se arma con TODAS
   * las secciones: es el caso más completo. El lector de bitácoras no conversa y tiene un prompt fijo.
   */
  async promptRealDeAgente(agentId: number, companyId: number | null) {
    const agente = await this.prisma.agent.findUnique({
      where: { id: agentId },
      select: { id: true, name: true, scope: true, isActive: true, instructions: true },
    });
    if (!agente) {
      throw new HttpException('Agente no encontrado', HttpStatus.NOT_FOUND);
    }

    if (esAgenteSinChat(agente.scope)) {
      const modelo = this.vertexChat.modeloPara('fuerte');
      return {
        agentId: agente.id,
        nombre: agente.name,
        scope: agente.scope,
        modelo,
        avisos: [
          'Este agente no conversa: recibe la foto o el PDF de la hoja junto con este texto, en una sola llamada.',
          'La fecha de hoy que aparece en la regla 3 se completa en cada lectura.',
          'El bloque «INSTRUCCIONES PROPIAS DE ESTA EMPRESA» sale del texto que se edita en «Editar agente»; todo lo demás está en el código.',
        ],
        partes: [
          {
            titulo: 'Prompt completo del lector',
            texto: buildBitacoraPrompt({
              hoy: new Date().toISOString().slice(0, 10),
              instruccionesDeLaEmpresa: agente.instructions,
            }),
            origen: 'codigo' as const,
          },
        ] as ParteDelPrompt[],
      };
    }

    const perfil = perfilDeAgente(agente.scope);
    const seccion = seccionDePerfil(perfil);
    const especializado = seccion !== null;
    const todas = ALL_SECTIONS.map((s) => s.key);
    const clavesVisibles = seccion ? todas.filter((k) => k === seccion) : todas;
    const basePrompt = agente.isActive ? agente.instructions : BASE_SYSTEM_PROMPT;
    const kbContext = await this.getFilteredKnowledgeBase(
      companyId,
      0,
      clavesVisibles,
    );
    const partes = this.armarPartesDelPrompt({
      basePrompt,
      perfil,
      clavesVisibles,
      ventasAgenteDisponible: !especializado,
      cacaoAgenteDisponible: !especializado,
      kbContext,
    });
    partes.push({
      titulo: 'Segunda llamada: redactar con los datos del sistema',
      texto: this.systemRedaccion(perfil),
      origen: 'codigo',
    });

    const avisos = [
      'Cada pregunta viaja así: «[Contexto: pantalla desde la que se pregunta] pregunta de la persona», junto con los últimos mensajes de esa conversación.',
      'Si la respuesta pide datos del sistema, hay una SEGUNDA llamada al modelo con el último bloque de abajo y los datos que devolvió la consulta («Datos del sistema: … Pregunta original: …»).',
      'Los bloques «Módulos y consultas» y «Manual de uso» cambian según los permisos de cada persona: aquí se muestran con todas las secciones, que es la versión más completa.',
    ];
    if (!agente.isActive && !especializado) {
      avisos.push(
        'Este agente está inactivo: el chat usa el texto base de Agente Gemeseg en lugar del suyo.',
      );
    }
    if (!companyId) {
      avisos.push(
        'Con una cuenta sin empresa no se muestra la base de conocimiento (es de cada empresa).',
      );
    }
    return {
      agentId: agente.id,
      nombre: agente.name,
      scope: agente.scope,
      modelo: this.vertexChat.modeloPara(this.nivelDePerfil(perfil)),
      avisos,
      partes,
    };
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
    clienteId?: number,
  ): Promise<{
    reply: string;
    tokensUsed: number;
    auditoria?: Record<string, unknown>;
  }> {
    const basePrompt = await this.getSystemPromptForAgent(agentId);
    const allowedKeys =
      allowedKeysParam ?? (await this.getAllowedSectionKeys(companyId, userId));
    const esVentas = perfil === 'VENTAS';
    const seccion = seccionDePerfil(perfil);
    // Un agente especializado solo conoce su módulo: ni el manual ni la base de
    // conocimiento de otros módulos le llegan.
    const clavesVisibles = seccion
      ? allowedKeys.filter((k) => k === seccion)
      : allowedKeys;

    const kbContext = await this.getFilteredKnowledgeBase(
      companyId,
      userId,
      clavesVisibles,
    );
    const systemPrompt = this.armarPartesDelPrompt({
      basePrompt,
      perfil,
      clavesVisibles,
      ventasAgenteDisponible:
        seccion === null && (await this.tieneAgenteDeSistema(allowedKeys, SCOPE_VENTAS, 'VENTAS')),
      cacaoAgenteDisponible:
        seccion === null && (await this.tieneAgenteDeSistema(allowedKeys, SCOPE_CACAO, 'CACAO')),
      kbContext,
    })
      .map((p) => p.texto)
      .join('\n\n');

    // Abierto desde la ficha de un cliente: su expediente ya se conoce, así que no hace falta que
    // el modelo lo pida (una sola llamada, más rápida y sin riesgo de buscar al cliente equivocado).
    if (esVentas && clienteId) {
      if (!companyId) {
        return {
          reply: 'Para analizar a un cliente hace falta entrar con un usuario de una empresa.',
          tokensUsed: 0,
        };
      }
      const inicioExp = Date.now();
      const datosCliente = await this.processor.expedienteDeCliente(companyId, clienteId);
      return this.redactarConDatos({
        perfil,
        message,
        chatHistory,
        dataResult: datosCliente,
        tokensPrevios: 0,
        auditoria: {
          intent: 'ventas_expediente',
          params: { clienteId },
          ms: Date.now() - inicioExp,
          caracteresDeDatos: datosCliente.length,
        },
      });
    }

    const result = await this.vertexChat.sendChat(
      systemPrompt,
      chatHistory,
      `[Contexto: ${context}] ${message}`,
      seccion
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

    // Cada perfil ejecuta solo lo suyo: Agente Gemeseg ya no consulta Ventas ni Cacao y
    // los agentes especializados no consultan nada fuera de su módulo, aunque el modelo
    // escriba el nombre de otra intención.
    if (!intencionPermitida(perfil, intent)) {
      return {
        reply: esVentas
          ? 'Esa consulta no es de este asistente: aquí solo respondo sobre Ventas.'
          : perfil === 'CACAO'
            ? 'Esa consulta no es de este asistente: aquí solo respondo sobre Cacao.'
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
    return this.redactarConDatos({
      perfil,
      message,
      chatHistory,
      dataResult,
      tokensPrevios: result.tokensUsed,
      auditoria: {
        intent,
        params,
        ms: Date.now() - inicio,
        caracteresDeDatos: dataResult.length,
      },
    });
  }

  // Segunda llamada: redactar la respuesta con los datos que devolvió el sistema. Para el Agente de
  // Ventas incluye el final de la conversación (antes iba vacía y una pregunta de seguimiento como
  // «¿y qué le digo?» perdía el hilo) y las marcas de evidencia que el modelo cite se comprueban
  // contra los datos de ahora Y contra sus respuestas anteriores ya verificadas.
  private async redactarConDatos(p: {
    perfil: PerfilAgente;
    message: string;
    chatHistory: ChatTurn[];
    dataResult: string;
    tokensPrevios: number;
    auditoria: Record<string, unknown>;
  }): Promise<{
    reply: string;
    tokensUsed: number;
    auditoria?: Record<string, unknown>;
  }> {
    const { perfil, message, dataResult, tokensPrevios, auditoria } = p;
    const esVentas = perfil === 'VENTAS';
    const especializado = perfil !== 'GENERAL';
    const historial = especializado ? historialParaDatos(p.chatHistory) : [];
    try {
      const finalResult = await this.vertexChat.sendChat(
        this.systemRedaccion(perfil),
        historial,
        `Datos del sistema:\n${dataResult}\n\nPregunta original: ${message}`,
        especializado
          ? { maxOutputTokens: 4096, nivel: 'fuerte' }
          : { nivel: 'ligero' },
      );
      let reply = finalResult.reply || dataResult;
      let extra: Record<string, unknown> = {};
      if (esVentas) {
        const yaVerificado = historial
          .filter((t) => t.role === 'assistant')
          .map((t) => t.content)
          .join('\n');
        const v = verificarCitas(reply, `${dataResult}\n${yaVerificado}`);
        reply = v.respuesta;
        extra = { citas: v.citadas, citasNoVerificadas: v.noVerificadas };
      }
      return {
        reply,
        tokensUsed: tokensPrevios + finalResult.tokensUsed,
        auditoria: { ...auditoria, ...extra },
      };
    } catch {
      return { reply: dataResult, tokensUsed: tokensPrevios, auditoria };
    }
  }

  // ¿Puede esta persona usar el agente del sistema de un módulo (Ventas o Cacao)? Con acceso a la
  // sección y el agente activo, sí (no hace falta asignarlo). Si sí, Agente Gemeseg puede mandarla
  // allá para datos en vivo.
  private async tieneAgenteDeSistema(
    allowedKeys: string[],
    scope: string,
    seccion: string,
  ): Promise<boolean> {
    if (!allowedKeys.includes(seccion)) return false;
    const n = await this.prisma.agent.count({
      where: { scope, isActive: true, createdBy: null },
    });
    return n > 0;
  }

  // Instrucción de la segunda llamada (redactar con los datos del sistema), según el perfil.
  private systemRedaccion(perfil: PerfilAgente): string {
    if (perfil === 'VENTAS') return SYSTEM_REDACCION_VENTAS;
    if (perfil === 'CACAO') return SYSTEM_REDACCION_CACAO;
    return SYSTEM_REDACCION_GENERAL;
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

  // Cada agente especializado registra su uso con otra acción para poder contarlo aparte.
  private accionLog(perfil: PerfilAgente): string {
    if (perfil === 'VENTAS') return 'chat_message_ventas';
    if (perfil === 'CACAO') return 'chat_message_cacao';
    return 'chat_message';
  }

  private async checkRateLimit(userId: number, perfil: PerfilAgente = 'GENERAL') {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const count = await this.prisma.aiLog.count({
      where: {
        userId,
        action: { in: ['chat_message', 'chat_message_ventas', 'chat_message_cacao'] },
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

    if (perfil === 'VENTAS' || perfil === 'CACAO') {
      const tope = perfil === 'VENTAS' ? RATE_LIMIT_VENTAS : RATE_LIMIT_CACAO;
      const propios = await this.prisma.aiLog.count({
        where: {
          userId,
          action: this.accionLog(perfil),
          createdAt: { gte: today },
          success: true,
        },
      });
      if (propios >= tope) {
        throw new HttpException(
          `Has alcanzado el límite de ${tope} mensajes al ${perfil === 'VENTAS' ? 'Agente de Ventas' : 'Agente de Cacao'} hoy. Intenta mañana.`,
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

    const conversaciones = await this.prisma.conversation.findMany({
      where,
      include: {
        agent: { select: { id: true, name: true } },
        _count: { select: { messages: true } },
      },
      orderBy: { updatedAt: 'desc' },
    });
    if (conversaciones.length === 0) return conversaciones;

    // Título de cada conversación = su primera pregunta (así el historial se lee como
    // «¿Qué debo atender hoy?» en vez de mostrar solo «Ventas» en todas). Sin columna nueva.
    const primeras = await this.prisma.chatMessage.findMany({
      where: {
        conversationId: { in: conversaciones.map((c) => c.id) },
        role: 'user',
      },
      orderBy: [{ conversationId: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
      distinct: ['conversationId'],
      select: { conversationId: true, content: true },
    });
    const porConversacion = new Map(
      primeras.map((m) => [m.conversationId, tituloDeConversacion(m.content)]),
    );
    return conversaciones.map((c) => ({
      ...c,
      title: porConversacion.get(c.id) ?? null,
    }));
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
