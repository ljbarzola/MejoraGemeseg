import { AiService } from './ai.service';
import { PrismaService } from '../../prisma/prisma.service';
import { AiProcessor } from './ai.processor';
import { VertexChatClient } from './vertex-chat.client';
import { PermissionsService } from '../permissions/permissions.service';

describe('AiService.canUseIntent — bloqueo de intenciones por permisos', () => {
  let service: AiService;
  let permissions: {
    getCompanySections: jest.Mock;
    getFixedSections: jest.Mock;
    getUserPermissions: jest.Mock;
  };

  beforeEach(() => {
    permissions = {
      getCompanySections: jest.fn(),
      getFixedSections: jest.fn(),
      getUserPermissions: jest.fn(),
    };
    service = new AiService(
      {} as unknown as PrismaService,
      {} as unknown as AiProcessor,
      { estaConfigurado: () => true } as unknown as VertexChatClient,
      permissions as unknown as PermissionsService,
    );
  });

  const canUseIntent = (userId: number, companyId: number | null, section: string | null) =>
    (service as any).canUseIntent(userId, companyId, section);

  it('intención sin sección dueña (las 5 originales de Proyectos/Tareas) siempre se permite, sin consultar permisos', async () => {
    const allowed = await canUseIntent(1, 1, null);
    expect(allowed).toBe(true);
    expect(permissions.getCompanySections).not.toHaveBeenCalled();
  });

  it('super admin (companyId null) siempre pasa, sin consultar permisos', async () => {
    const allowed = await canUseIntent(1, null, 'RRHH');
    expect(allowed).toBe(true);
    expect(permissions.getCompanySections).not.toHaveBeenCalled();
  });

  it('sección no habilitada para la empresa: denegado aunque no exista fila de usuario', async () => {
    permissions.getCompanySections.mockResolvedValue([{ key: 'RRHH', enabled: false }]);
    const allowed = await canUseIntent(1, 1, 'RRHH');
    expect(allowed).toBe(false);
  });

  it('sección fija para todos (fixedForAll): permitido sin mirar UserPermission', async () => {
    permissions.getCompanySections.mockResolvedValue([{ key: 'CACAO', enabled: true }]);
    permissions.getFixedSections.mockResolvedValue(['DASHBOARD', 'PROJECTS', 'CACAO']);
    const allowed = await canUseIntent(1, 1, 'CACAO');
    expect(allowed).toBe(true);
    expect(permissions.getUserPermissions).not.toHaveBeenCalled();
  });

  it('sin fila UserPermission para la sección: permitido (mismo default permisivo del guard)', async () => {
    permissions.getCompanySections.mockResolvedValue([{ key: 'CUSTODIAS', enabled: true }]);
    permissions.getFixedSections.mockResolvedValue(['DASHBOARD', 'PROJECTS']);
    permissions.getUserPermissions.mockResolvedValue([]);
    const allowed = await canUseIntent(1, 1, 'CUSTODIAS');
    expect(allowed).toBe(true);
  });

  it('fila UserPermission con canView:false: denegado', async () => {
    permissions.getCompanySections.mockResolvedValue([{ key: 'CUSTODIAS', enabled: true }]);
    permissions.getFixedSections.mockResolvedValue(['DASHBOARD', 'PROJECTS']);
    permissions.getUserPermissions.mockResolvedValue([
      { section: 'CUSTODIAS', canView: false, canWrite: false },
    ]);
    const allowed = await canUseIntent(1, 1, 'CUSTODIAS');
    expect(allowed).toBe(false);
  });

  it('fila UserPermission con canView:true: permitido', async () => {
    permissions.getCompanySections.mockResolvedValue([{ key: 'VENTAS', enabled: true }]);
    permissions.getFixedSections.mockResolvedValue(['DASHBOARD', 'PROJECTS']);
    permissions.getUserPermissions.mockResolvedValue([
      { section: 'VENTAS', canView: true, canWrite: false },
    ]);
    const allowed = await canUseIntent(1, 1, 'VENTAS');
    expect(allowed).toBe(true);
  });
});

describe('AiService.callVertexChat — la consulta nunca se ejecuta si el intento está bloqueado', () => {
  let service: AiService;
  let processor: { executeQuery: jest.Mock };
  let vertexChat: { sendChat: jest.Mock; estaConfigurado: () => boolean };
  let permissions: {
    getCompanySections: jest.Mock;
    getFixedSections: jest.Mock;
    getUserPermissions: jest.Mock;
  };
  let prisma: { agent: { findUnique: jest.Mock }; companyKnowledgeBase: { findUnique: jest.Mock } };

  beforeEach(() => {
    processor = { executeQuery: jest.fn().mockResolvedValue('datos reales') };
    vertexChat = { sendChat: jest.fn(), estaConfigurado: () => true };
    permissions = {
      getCompanySections: jest.fn().mockResolvedValue([{ key: 'RRHH', enabled: true }]),
      getFixedSections: jest.fn().mockResolvedValue(['DASHBOARD', 'PROJECTS']),
      getUserPermissions: jest.fn().mockResolvedValue([]),
    };
    prisma = {
      agent: { findUnique: jest.fn().mockResolvedValue({ instructions: 'system', isActive: true }) },
      companyKnowledgeBase: { findUnique: jest.fn().mockResolvedValue(null) },
    };

    service = new AiService(
      prisma as unknown as PrismaService,
      processor as unknown as AiProcessor,
      vertexChat as unknown as VertexChatClient,
      permissions as unknown as PermissionsService,
    );
  });

  const callVertexChat = (companyId: number | null) =>
    (service as any).callVertexChat(
      '¿cuántas vacantes hay?',
      'dashboard',
      [],
      1,
      1,
      companyId,
    );

  it('usuario SIN acceso a RRHH: nunca ejecuta la consulta, responde con el mensaje de acceso denegado', async () => {
    permissions.getUserPermissions.mockResolvedValue([
      { section: 'RRHH', canView: false, canWrite: false },
    ]);
    vertexChat.sendChat.mockResolvedValueOnce({
      reply: '[INTENCION: rrhh_resumen_personal]',
      tokensUsed: 10,
    });

    const result = await callVertexChat(1);

    expect(processor.executeQuery).not.toHaveBeenCalled();
    expect(result.reply).toBe('No tienes acceso a esa información con tu usuario actual.');
    // No se gasta una segunda llamada al modelo solo para decir que no.
    expect(vertexChat.sendChat).toHaveBeenCalledTimes(1);
  });

  it('usuario CON acceso a RRHH: sí ejecuta la consulta y devuelve una respuesta basada en datos reales', async () => {
    permissions.getUserPermissions.mockResolvedValue([
      { section: 'RRHH', canView: true, canWrite: false },
    ]);
    vertexChat.sendChat
      .mockResolvedValueOnce({ reply: '[INTENCION: rrhh_resumen_personal]', tokensUsed: 10 })
      .mockResolvedValueOnce({ reply: 'Hay 2 vacantes abiertas.', tokensUsed: 5 });

    const result = await callVertexChat(1);

    expect(processor.executeQuery).toHaveBeenCalledWith(
      'rrhh_resumen_personal',
      {},
      1,
      1,
    );
    expect(result.reply).toBe('Hay 2 vacantes abiertas.');
  });

  it('super admin: la consulta se ejecuta sin pasar por la verificación de permisos', async () => {
    vertexChat.sendChat
      .mockResolvedValueOnce({ reply: '[INTENCION: rrhh_resumen_personal]', tokensUsed: 10 })
      .mockResolvedValueOnce({ reply: 'Todo el sistema.', tokensUsed: 5 });

    await callVertexChat(null);

    expect(permissions.getCompanySections).not.toHaveBeenCalled();
    expect(processor.executeQuery).toHaveBeenCalled();
  });
});

describe('AiService.getDefaultAgentId — autoreparación', () => {
  let service: AiService;
  let prisma: { agent: { findFirst: jest.Mock; create: jest.Mock } };

  beforeEach(() => {
    prisma = {
      agent: {
        findFirst: jest.fn(),
        create: jest.fn().mockResolvedValue({ id: 99 }),
      },
    };
    service = new AiService(
      prisma as unknown as PrismaService,
      {} as unknown as AiProcessor,
      { estaConfigurado: () => true } as unknown as VertexChatClient,
      {} as unknown as PermissionsService,
    );
  });

  const getDefaultAgentId = () => (service as any).getDefaultAgentId();

  it('si ya existe un Agent con isDefault:true, lo devuelve sin crear uno nuevo', async () => {
    prisma.agent.findFirst.mockResolvedValue({ id: 2 });

    const id = await getDefaultAgentId();

    expect(id).toBe(2);
    expect(prisma.agent.create).not.toHaveBeenCalled();
  });

  it('si no existe ningún Agent con isDefault:true, lo crea y devuelve su id — nunca cae al id 1 fijo', async () => {
    prisma.agent.findFirst.mockResolvedValue(null);

    const id = await getDefaultAgentId();

    expect(id).toBe(99);
    expect(prisma.agent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ name: 'Agente Gemeseg', isDefault: true }),
      }),
    );
  });
});

describe('AiService.deleteConversation', () => {
  let service: AiService;
  let prisma: {
    conversation: { findUnique: jest.Mock; delete: jest.Mock };
  };

  beforeEach(() => {
    prisma = {
      conversation: {
        findUnique: jest.fn(),
        delete: jest.fn().mockResolvedValue({ id: 5 }),
      },
    };
    service = new AiService(
      prisma as unknown as PrismaService,
      {} as unknown as AiProcessor,
      { estaConfigurado: () => true } as unknown as VertexChatClient,
      {} as unknown as PermissionsService,
    );
  });

  it('borra una conversación propia', async () => {
    prisma.conversation.findUnique.mockResolvedValue({ id: 5, userId: 1 });

    await service.deleteConversation(5, 1);

    expect(prisma.conversation.delete).toHaveBeenCalledWith({ where: { id: 5 } });
  });

  it('rechaza borrar la conversación de otro usuario, y nunca llama a delete', async () => {
    prisma.conversation.findUnique.mockResolvedValue({ id: 5, userId: 2 });

    await expect(service.deleteConversation(5, 1)).rejects.toThrow();
    expect(prisma.conversation.delete).not.toHaveBeenCalled();
  });

  it('conversación inexistente da un error claro, no una excepción cruda', async () => {
    prisma.conversation.findUnique.mockResolvedValue(null);

    await expect(service.deleteConversation(999, 1)).rejects.toThrow(
      'Conversacion no encontrada',
    );
    expect(prisma.conversation.delete).not.toHaveBeenCalled();
  });
});

describe('AiService.getConversationHistory — permisos vigentes, no los de cuando se creó', () => {
  let service: AiService;
  let prisma: { chatMessage: { findMany: jest.Mock } };

  beforeEach(() => {
    prisma = { chatMessage: { findMany: jest.fn() } };
    service = new AiService(
      prisma as unknown as PrismaService,
      {} as unknown as AiProcessor,
      { estaConfigurado: () => true } as unknown as VertexChatClient,
      {} as unknown as PermissionsService,
    );
  });

  const history = (allowed: string[]) =>
    (service as any).getConversationHistory(1, allowed);

  it('descarta los turnos generados con una sección que el usuario ya perdió', async () => {
    // findMany viene en orden desc (lo más nuevo primero).
    prisma.chatMessage.findMany.mockResolvedValue([
      { role: 'assistant', content: 'Tus tareas...', sections: '' },
      { role: 'user', content: '¿mis tareas?', sections: '' },
      { role: 'assistant', content: 'Hay 3 vacantes', sections: 'RRHH,VENTAS' },
      { role: 'user', content: '¿vacantes?', sections: 'RRHH,VENTAS' },
    ]);

    const turns = await history(['VENTAS']);

    expect(turns).toEqual([
      { role: 'user', content: '¿mis tareas?' },
      { role: 'assistant', content: 'Tus tareas...' },
    ]);
  });

  it('conserva los turnos si el usuario sigue teniendo (o ganó) esas secciones', async () => {
    prisma.chatMessage.findMany.mockResolvedValue([
      { role: 'assistant', content: 'Hay 3 vacantes', sections: 'RRHH' },
      { role: 'user', content: '¿vacantes?', sections: 'RRHH' },
    ]);

    const turns = await history(['RRHH', 'VENTAS']);

    expect(turns.map((t: any) => t.content)).toEqual(['¿vacantes?', 'Hay 3 vacantes']);
  });

  it('mensajes antiguos sin registro de secciones (null) no se reenvían al modelo', async () => {
    prisma.chatMessage.findMany.mockResolvedValue([
      { role: 'assistant', content: 'viejo', sections: null },
      { role: 'user', content: 'viejo', sections: null },
    ]);

    expect(await history(['RRHH'])).toEqual([]);
  });

  it('pide los últimos 20 mensajes, no los primeros', async () => {
    prisma.chatMessage.findMany.mockResolvedValue([]);
    await history([]);
    expect(prisma.chatMessage.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { createdAt: 'desc' }, take: 20 }),
    );
  });
});
