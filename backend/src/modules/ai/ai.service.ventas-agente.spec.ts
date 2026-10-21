import { ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  AiService,
  historialParaDatos,
  MENSAJE_VENTAS_ERROR,
  MENSAJE_VENTAS_SIN_IA,
  tituloDeConversacion,
} from './ai.service';
import type { AiProcessor } from './ai.processor';
import type { VertexChatClient } from './vertex-chat.client';
import type { PermissionsService } from '../permissions/permissions.service';

// Agente de Ventas (2026-10-18): acceso sin asignar, apertura desde la ficha de un cliente,
// historial en la respuesta con datos, citas verificadas y mensajes claros cuando la IA no responde.
describe('AiService — Agente de Ventas', () => {
  let service: AiService;
  let prisma: any;
  let processor: { executeQuery: jest.Mock; expedienteDeCliente: jest.Mock };
  let vertexChat: { sendChat: jest.Mock; estaConfigurado: jest.Mock; modeloPara: jest.Mock };

  beforeEach(() => {
    prisma = {
      agent: { findUnique: jest.fn(), count: jest.fn() },
      userAgent: { findUnique: jest.fn().mockResolvedValue(null) },
      companyKnowledgeBase: { findUnique: jest.fn().mockResolvedValue(null) },
      conversation: { create: jest.fn().mockResolvedValue({ id: 1, agentId: 5, userId: 1 }) },
      chatMessage: { findMany: jest.fn().mockResolvedValue([]), create: jest.fn().mockResolvedValue({}) },
      aiLog: { count: jest.fn().mockResolvedValue(0), create: jest.fn().mockResolvedValue({}) },
    };
    processor = {
      executeQuery: jest.fn().mockResolvedValue('Plan del día: Hotel Sol [#opp:1]'),
      expedienteDeCliente: jest.fn().mockResolvedValue('EXPEDIENTE Hotel Sol [#opp:1] [#act:2]'),
    };
    vertexChat = {
      sendChat: jest.fn(),
      estaConfigurado: jest.fn().mockReturnValue(true),
      modeloPara: jest.fn().mockReturnValue('modelo-x'),
    };
    service = new AiService(
      prisma as unknown as PrismaService,
      processor as unknown as AiProcessor,
      vertexChat as unknown as VertexChatClient,
      {} as unknown as PermissionsService,
    );
  });

  describe('quién puede usarlo', () => {
    const usable = (allowedKeys: string[]) => (service as any).assertAgentUsable(1, 5, allowedKeys);

    it('el Agente de Ventas del sistema lo usa cualquiera con acceso a Ventas, sin asignarlo', async () => {
      prisma.agent.findUnique.mockResolvedValue({ id: 5, scope: 'VENTAS', isActive: true, createdBy: null });
      const r = await usable(['VENTAS']);
      expect(r.perfil).toBe('VENTAS');
      expect(prisma.userAgent.findUnique).not.toHaveBeenCalled();
    });

    it('sin acceso a Ventas no lo usa, aunque exista', async () => {
      prisma.agent.findUnique.mockResolvedValue({ id: 5, scope: 'VENTAS', isActive: true, createdBy: null });
      await expect(usable(['RRHH'])).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('uno de Ventas creado por otra persona sí exige que esté asignado', async () => {
      prisma.agent.findUnique.mockResolvedValue({ id: 5, scope: 'VENTAS', isActive: true, createdBy: 99 });
      await expect(usable(['VENTAS'])).rejects.toBeInstanceOf(ForbiddenException);
      prisma.userAgent.findUnique.mockResolvedValue({ agentId: 5 });
      await expect(usable(['VENTAS'])).resolves.toMatchObject({ perfil: 'VENTAS' });
    });
  });

  describe('abierto desde la ficha de un cliente', () => {
    const desdeFicha = (history: any[] = []) =>
      (service as any).callVertexChat('¿qué hago con él?', 'Ventas', history, 5, 1, 1, ['VENTAS'], 'VENTAS', 42);

    it('arma el expediente por id y responde en UNA sola llamada, sin que el modelo lo tenga que pedir', async () => {
      vertexChat.sendChat.mockResolvedValue({ reply: 'Llámalo hoy [#opp:1].', tokensUsed: 7 });
      const r = await desdeFicha();
      expect(processor.expedienteDeCliente).toHaveBeenCalledWith(1, 42);
      expect(processor.executeQuery).not.toHaveBeenCalled();
      expect(vertexChat.sendChat).toHaveBeenCalledTimes(1);
      const [, , pregunta, opciones] = vertexChat.sendChat.mock.calls[0];
      expect(pregunta).toContain('EXPEDIENTE Hotel Sol');
      expect(pregunta).toContain('¿qué hago con él?');
      expect(opciones).toEqual(expect.objectContaining({ nivel: 'fuerte', maxOutputTokens: 4096 }));
      // Las marcas internas nunca llegan a la persona.
      expect(r.reply).toBe('Llámalo hoy.');
      expect(r.auditoria).toMatchObject({ intent: 'ventas_expediente', params: { clienteId: 42 } });
    });

    it('quita todas las marcas, también las inventadas, y deja constancia en la auditoría', async () => {
      vertexChat.sendChat.mockResolvedValue({ reply: 'Hubo una queja [#act:2] y un cierre [#opp:999].', tokensUsed: 1 });
      const r = await desdeFicha();
      expect(r.reply).toBe('Hubo una queja y un cierre.');
      expect(r.reply).not.toMatch(/quité algunas referencias/);
      expect(r.auditoria).toMatchObject({ citas: 2, citasNoVerificadas: ['opp:999'] });
    });

    it('un super admin sin empresa no puede analizar a un cliente', async () => {
      const r = await (service as any).callVertexChat('hola', 'Ventas', [], 5, 1, null, ['VENTAS'], 'VENTAS', 42);
      expect(r.reply).toContain('usuario de una empresa');
      expect(vertexChat.sendChat).not.toHaveBeenCalled();
    });
  });

  describe('respuesta con datos del sistema', () => {
    const conPregunta = (history: any[], perfil: string) =>
      (service as any).callVertexChat('¿y qué le digo?', 'Ventas', history, 5, 1, 1, ['VENTAS'], perfil);

    const historia = [
      { role: 'user', content: 'plan de hoy' },
      { role: 'assistant', content: 'Atiende a Hotel Sol [#act:55].' },
    ];

    // El permiso de Ventas ya se prueba en ai.service.spec.ts: aquí se da por bueno.
    beforeEach(() => {
      (service as any).canUseIntent = jest.fn().mockResolvedValue(true);
    });

    it('el Agente de Ventas incluye el final de la conversación en la segunda llamada', async () => {
      vertexChat.sendChat
        .mockResolvedValueOnce({ reply: '[INTENCION: ventas_prioridades]', tokensUsed: 1 })
        .mockResolvedValueOnce({ reply: 'Dile esto.', tokensUsed: 1 });
      await conPregunta(historia, 'VENTAS');
      const segunda = vertexChat.sendChat.mock.calls[1];
      expect(segunda[1]).toEqual(historia);
    });

    it('una referencia ya verificada en una respuesta anterior tampoco se muestra al repetirla', async () => {
      vertexChat.sendChat
        .mockResolvedValueOnce({ reply: '[INTENCION: ventas_prioridades]', tokensUsed: 1 })
        .mockResolvedValueOnce({ reply: 'Como te dije [#act:55] y ahora [#opp:1].', tokensUsed: 1 });
      const r = await conPregunta(historia, 'VENTAS');
      expect(r.reply).not.toContain('[#');
      expect(r.auditoria).toMatchObject({ citasNoVerificadas: [] });
    });

    it('Agente Gemeseg sigue sin historial en la segunda llamada (no cambia)', async () => {
      vertexChat.sendChat
        .mockResolvedValueOnce({ reply: '[INTENCION: rrhh_resumen_personal]', tokensUsed: 1 })
        .mockResolvedValueOnce({ reply: 'ok', tokensUsed: 1 });
      (service as any).canUseIntent = jest.fn().mockResolvedValue(true);
      await (service as any).callVertexChat('hola', 'dashboard', historia, 2, 1, 1, ['RRHH'], 'GENERAL');
      expect(vertexChat.sendChat.mock.calls[1][1]).toEqual([]);
    });
  });

  describe('cuando la IA no responde', () => {
    const enviar = () =>
      service.sendMessage({ agentId: 5, message: 'hola', context: 'Ventas' } as any, 1, null);

    beforeEach(() => {
      prisma.agent.findUnique.mockResolvedValue({ id: 5, scope: 'VENTAS', isActive: true, createdBy: null, instructions: 'x' });
    });

    it('sin IA configurada, le dice la verdad en vez del modo mock de proyectos y tareas', async () => {
      vertexChat.estaConfigurado.mockReturnValue(false);
      const r = await enviar();
      expect(r.reply).toBe(MENSAJE_VENTAS_SIN_IA);
    });

    it('si la IA falla, da un mensaje claro y registra el fallo', async () => {
      vertexChat.sendChat.mockRejectedValue(new Error('boom'));
      const r = await enviar();
      expect(r.reply).toBe(MENSAJE_VENTAS_ERROR);
      expect(prisma.aiLog.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ success: false, action: 'chat_message_ventas' }) }),
      );
    });
  });

  describe('historial de conversaciones', () => {
    it('cada conversación lleva por título su primera pregunta', async () => {
      prisma.conversation.findMany = jest.fn().mockResolvedValue([
        { id: 1, agent: { id: 5, name: 'Agente de Ventas' }, _count: { messages: 4 } },
        { id: 2, agent: { id: 5, name: 'Agente de Ventas' }, _count: { messages: 0 } },
      ]);
      prisma.chatMessage.findMany.mockResolvedValue([{ conversationId: 1, content: '¿Qué debo   atender\nhoy?' }]);
      const r: any[] = await service.getConversationsByAgent(1, 5);
      expect(r[0].title).toBe('¿Qué debo atender hoy?');
      expect(r[1].title).toBeNull();
      const donde = prisma.chatMessage.findMany.mock.calls[0][0];
      expect(donde.distinct).toEqual(['conversationId']);
      expect(donde.where.role).toBe('user');
    });
  });
});

describe('historialParaDatos y tituloDeConversacion', () => {
  it('conserva solo los últimos 6 turnos y recorta los muy largos', () => {
    const turnos = Array.from({ length: 10 }, (_, i) => ({
      role: (i % 2 ? 'assistant' : 'user') as 'user' | 'assistant',
      content: i === 9 ? 'x'.repeat(2000) : `t${i}`,
    }));
    const r = historialParaDatos(turnos);
    expect(r).toHaveLength(6);
    expect(r[0].content).toBe('t4');
    expect(r[5].content.length).toBe(1501);
    expect(r[5].content.endsWith('…')).toBe(true);
  });

  it('el título es la primera pregunta en una línea, con tope de 70 letras', () => {
    expect(tituloDeConversacion('  hola   mundo \n ok ')).toBe('hola mundo ok');
    expect(tituloDeConversacion('   ')).toBeNull();
    const largo = tituloDeConversacion('a'.repeat(200))!;
    expect(largo.length).toBe(70);
    expect(largo.endsWith('…')).toBe(true);
  });
});
