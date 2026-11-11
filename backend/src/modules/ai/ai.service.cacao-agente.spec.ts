import { ForbiddenException, HttpException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AiService } from './ai.service';
import type { AiProcessor } from './ai.processor';
import type { VertexChatClient } from './vertex-chat.client';
import type { PermissionsService } from '../permissions/permissions.service';
import {
  MENSAJE_CACAO_ERROR,
  MENSAJE_CACAO_SIN_IA,
  SYSTEM_REDACCION_CACAO,
} from './cacao-agent-prompt.util';

// Agente de Cacao (2026-11-11): quién lo usa, qué consultas ejecuta, qué conoce, su tope diario y
// los mensajes claros cuando la IA no responde.
describe('AiService — Agente de Cacao', () => {
  let service: AiService;
  let prisma: any;
  let processor: { executeQuery: jest.Mock; expedienteDeCliente: jest.Mock };
  let vertexChat: { sendChat: jest.Mock; estaConfigurado: jest.Mock; modeloPara: jest.Mock };

  beforeEach(() => {
    prisma = {
      agent: { findUnique: jest.fn(), count: jest.fn().mockResolvedValue(1), findFirst: jest.fn(), create: jest.fn() },
      userAgent: { findUnique: jest.fn().mockResolvedValue(null) },
      companyKnowledgeBase: { findUnique: jest.fn().mockResolvedValue(null) },
      conversation: { create: jest.fn().mockResolvedValue({ id: 1, agentId: 7, userId: 1 }) },
      chatMessage: { findMany: jest.fn().mockResolvedValue([]), create: jest.fn().mockResolvedValue({}) },
      aiLog: { count: jest.fn().mockResolvedValue(0), create: jest.fn().mockResolvedValue({}) },
    };
    processor = {
      executeQuery: jest.fn().mockResolvedValue('Cuentas por pagar vencidas: 2, por $1,000.00'),
      expedienteDeCliente: jest.fn(),
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
    const usable = (allowedKeys: string[]) => (service as any).assertAgentUsable(1, 7, allowedKeys);

    it('el Agente de Cacao del sistema lo usa cualquiera con acceso a Cacao, sin asignarlo', async () => {
      prisma.agent.findUnique.mockResolvedValue({ id: 7, scope: 'CACAO', isActive: true, createdBy: null });
      const r = await usable(['CACAO']);
      expect(r.perfil).toBe('CACAO');
      expect(prisma.userAgent.findUnique).not.toHaveBeenCalled();
    });

    it('sin acceso a Cacao no lo usa, aunque tenga Ventas', async () => {
      prisma.agent.findUnique.mockResolvedValue({ id: 7, scope: 'CACAO', isActive: true, createdBy: null });
      await expect(usable(['VENTAS'])).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('desactivado, no responde (no cae al prompt general)', async () => {
      prisma.agent.findUnique.mockResolvedValue({ id: 7, scope: 'CACAO', isActive: false, createdBy: null });
      await expect(usable(['CACAO'])).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('uno de Cacao creado por otra persona sí exige que esté asignado', async () => {
      prisma.agent.findUnique.mockResolvedValue({ id: 7, scope: 'CACAO', isActive: true, createdBy: 99 });
      await expect(usable(['CACAO'])).rejects.toBeInstanceOf(ForbiddenException);
      prisma.userAgent.findUnique.mockResolvedValue({ agentId: 7 });
      await expect(usable(['CACAO'])).resolves.toMatchObject({ perfil: 'CACAO' });
    });
  });

  describe('qué consultas ejecuta', () => {
    const preguntar = (perfil: string, allowed: string[] = ['CACAO']) =>
      (service as any).callVertexChat('¿qué cuentas están vencidas?', 'Cacao', [], 7, 1, 10, allowed, perfil);

    beforeEach(() => {
      (service as any).canUseIntent = jest.fn().mockResolvedValue(true);
    });

    it('ejecuta una consulta de Cacao con sus parámetros y redacta con el prompt del Agente de Cacao', async () => {
      vertexChat.sendChat
        .mockResolvedValueOnce({ reply: '[INTENCION: cacao_por_pagar(estado:vencidas)]', tokensUsed: 3 })
        .mockResolvedValueOnce({ reply: 'Hay 2 vencidas.', tokensUsed: 4 });
      const r = await preguntar('CACAO');
      expect(processor.executeQuery).toHaveBeenCalledWith('cacao_por_pagar', { estado: 'vencidas' }, 1, 10);
      const [sistema, , pregunta, opciones] = vertexChat.sendChat.mock.calls[1];
      expect(sistema).toBe(SYSTEM_REDACCION_CACAO);
      expect(pregunta).toContain('Cuentas por pagar vencidas: 2');
      expect(opciones).toEqual(expect.objectContaining({ nivel: 'fuerte', maxOutputTokens: 4096 }));
      expect(r.reply).toBe('Hay 2 vencidas.');
      expect(r.tokensUsed).toBe(7);
      expect(r.auditoria).toMatchObject({ intent: 'cacao_por_pagar', params: { estado: 'vencidas' } });
    });

    it('no ejecuta una consulta de Ventas ni de otro módulo aunque el modelo la escriba', async () => {
      for (const intent of ['ventas_resumen', 'rrhh_resumen_personal', 'list_projects']) {
        processor.executeQuery.mockClear();
        vertexChat.sendChat.mockResolvedValueOnce({ reply: `[INTENCION: ${intent}]`, tokensUsed: 1 });
        const r = await preguntar('CACAO');
        expect(processor.executeQuery).not.toHaveBeenCalled();
        expect(r.reply).toContain('solo respondo sobre Cacao');
      }
    });

    it('Agente Gemeseg ya no ejecuta ninguna consulta de Cacao', async () => {
      vertexChat.sendChat.mockResolvedValueOnce({ reply: '[INTENCION: cacao_resumen]', tokensUsed: 1 });
      const r = await preguntar('GENERAL', ['CACAO']);
      expect(processor.executeQuery).not.toHaveBeenCalled();
      expect(r.reply).toBe('No tengo esa consulta en este asistente.');
    });

    it('sin permiso de la sección la consulta nunca corre', async () => {
      (service as any).canUseIntent = jest.fn().mockResolvedValue(false);
      vertexChat.sendChat.mockResolvedValueOnce({ reply: '[INTENCION: cacao_resumen]', tokensUsed: 1 });
      const r = await preguntar('CACAO');
      expect(processor.executeQuery).not.toHaveBeenCalled();
      expect(r.reply).toBe('No tienes acceso a esa información con tu usuario actual.');
    });

    it('incluye el final de la conversación en la segunda llamada', async () => {
      const historia = [
        { role: 'user', content: '¿cuánto le debemos a Juan?' },
        { role: 'assistant', content: 'Le debemos $500 (vence el 20/11).' },
      ];
      vertexChat.sendChat
        .mockResolvedValueOnce({ reply: '[INTENCION: cacao_anticipos]', tokensUsed: 1 })
        .mockResolvedValueOnce({ reply: 'ok', tokensUsed: 1 });
      await (service as any).callVertexChat('¿y su anticipo?', 'Cacao', historia, 7, 1, 10, ['CACAO'], 'CACAO');
      expect(vertexChat.sendChat.mock.calls[1][1]).toEqual(historia);
    });
  });

  describe('qué conoce', () => {
    it('solo recibe el manual de Cacao (no el de otros módulos) y sus consultas, aunque el usuario tenga más secciones', async () => {
      vertexChat.sendChat.mockResolvedValueOnce({ reply: 'Pasos…', tokensUsed: 1 });
      prisma.agent.findUnique.mockResolvedValue({ instructions: 'Tono cercano', isActive: true });
      await (service as any).callVertexChat('¿cómo hago una liquidación?', 'Cacao', [], 7, 1, 10, ['CACAO', 'VENTAS', 'RRHH'], 'CACAO');
      const [sistema] = vertexChat.sendChat.mock.calls[0];
      expect(sistema).toContain('Tono cercano');
      expect(sistema).toContain('Agente de Cacao');
      expect(sistema).toContain('cacao_proveedor');
      expect(sistema).toContain('# Cacao — guía');
      expect(sistema).not.toContain('# Ventas y CRM');
      expect(sistema).not.toContain('# Recursos Humanos');
      expect(sistema).not.toContain('ventas_expediente');
    });

    it('Agente Gemeseg, con Cacao, manda a los datos en vivo al Agente de Cacao y ya no anuncia cacao_resumen', async () => {
      vertexChat.sendChat.mockResolvedValueOnce({ reply: 'Pasos…', tokensUsed: 1 });
      prisma.agent.findUnique.mockResolvedValue({ instructions: 'Eres Agente Gemeseg', isActive: true });
      await (service as any).callVertexChat('hola', 'Inicio', [], 2, 1, 10, ['CACAO'], 'GENERAL');
      const [sistema] = vertexChat.sendChat.mock.calls[0];
      expect(sistema).toContain('Agente de Cacao');
      expect(sistema).not.toContain('cacao_resumen');
    });
  });

  describe('tope diario propio', () => {
    it('30 mensajes al día al Agente de Cacao, contados aparte', async () => {
      prisma.aiLog.count.mockResolvedValueOnce(10).mockResolvedValueOnce(30);
      await expect((service as any).checkRateLimit(1, 'CACAO')).rejects.toBeInstanceOf(HttpException);
      const segunda = prisma.aiLog.count.mock.calls[1][0].where;
      expect(segunda.action).toBe('chat_message_cacao');
    });

    it('bajo el tope, deja pasar; y sus mensajes también cuentan para el tope general de 50', async () => {
      prisma.aiLog.count.mockResolvedValueOnce(10).mockResolvedValueOnce(5);
      await expect((service as any).checkRateLimit(1, 'CACAO')).resolves.toBeUndefined();
      const general = prisma.aiLog.count.mock.calls[0][0].where;
      expect(general.action.in).toContain('chat_message_cacao');
    });
  });

  describe('cuando la IA no responde', () => {
    const enviar = () => service.sendMessage({ agentId: 7, message: 'hola', context: 'Cacao' } as any, 1, null);

    beforeEach(() => {
      prisma.agent.findUnique.mockResolvedValue({ id: 7, scope: 'CACAO', isActive: true, createdBy: null, instructions: 'x' });
    });

    it('sin IA configurada, le dice la verdad en vez del modo mock de proyectos y tareas', async () => {
      vertexChat.estaConfigurado.mockReturnValue(false);
      const r = await enviar();
      expect(r.reply).toBe(MENSAJE_CACAO_SIN_IA);
    });

    it('si la IA falla, da un mensaje claro y registra el fallo con la acción de Cacao', async () => {
      vertexChat.sendChat.mockRejectedValue(new Error('boom'));
      const r = await enviar();
      expect(r.reply).toBe(MENSAJE_CACAO_ERROR);
      expect(prisma.aiLog.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ success: false, action: 'chat_message_cacao' }) }),
      );
    });
  });

  describe('siembra', () => {
    it('crea «Agente de Cacao» si no existe y nunca pisa uno existente', async () => {
      prisma.agent.findFirst.mockResolvedValue(null);
      await (service as any).ensureCacaoAgent();
      expect(prisma.agent.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ name: 'Agente de Cacao', scope: 'CACAO', isDefault: false }),
      });
      expect(prisma.agent.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { createdBy: null, scope: 'CACAO' } }),
      );
      prisma.agent.create.mockClear();
      prisma.agent.findFirst.mockResolvedValue({ id: 7 });
      await (service as any).ensureCacaoAgent();
      expect(prisma.agent.create).not.toHaveBeenCalled();
    });
  });
});
