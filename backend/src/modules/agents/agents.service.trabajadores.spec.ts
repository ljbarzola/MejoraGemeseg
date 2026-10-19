import { ConflictException } from '@nestjs/common';
import type { PermissionsService } from '../permissions/permissions.service';
import { AgentsService } from './agents.service';
import { AgentRunService } from './agent-run.service';
import {
  documentacionDeAgente,
  esAgenteSinChat,
} from './agent-trabajadores.const';

// Los agentes que trabajan solos (revisor de bitácoras, 2026-10-18) viven en el catálogo para que
// Sistemas los vea y los ajuste, pero no conversan: el chat no los ofrece ni los acepta.
describe('agentes que trabajan solos', () => {
  it('el revisor de bitácoras no conversa y tiene su documentación', () => {
    expect(esAgenteSinChat('BITACORAS')).toBe(true);
    expect(esAgenteSinChat('VENTAS')).toBe(false);
    expect(esAgenteSinChat('GLOBAL')).toBe(false);
    expect(esAgenteSinChat(null)).toBe(false);
    const doc = documentacionDeAgente('BITACORAS');
    expect(doc?.noHace.join(' ')).toContain('No conoce el horario');
    expect(doc?.decide.join(' ')).toContain('no el modelo');
  });

  describe('AgentsService', () => {
    const montar = () => {
      const prisma: any = {
        userAgent: { findMany: jest.fn().mockResolvedValue([{ agentId: 5 }]) },
        agent: {
          findMany: jest.fn().mockResolvedValue([]),
          findFirst: jest.fn().mockResolvedValue(null),
        },
      };
      const permissions = {
        getCompanySections: jest.fn().mockResolvedValue([]),
        getFixedSections: jest.fn().mockResolvedValue([]),
        getUserPermissions: jest.fn().mockResolvedValue([]),
      };
      return {
        prisma,
        servicio: new AgentsService(
          prisma,
          permissions as unknown as PermissionsService,
        ),
      };
    };

    it('no se crea a mano', async () => {
      const { servicio } = montar();
      await expect(
        servicio.create({
          userId: 1,
          name: 'Otro revisor',
          systemMsg: 'x',
          scope: 'BITACORAS',
        }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('no se ofrece en el chat ni aunque alguien lo tenga asignado', async () => {
      const { servicio, prisma } = montar();
      await servicio.getAvailableForUser(1, null);
      const donde = prisma.agent.findMany.mock.calls[0][0].where;
      expect(donde.NOT).toEqual({ scope: { in: ['BITACORAS'] } });
      expect(donde.OR[0]).toEqual({
        createdBy: null,
        NOT: { scope: { in: ['VENTAS', 'BITACORAS'] } },
      });
    });
  });
});

describe('AgentRunService', () => {
  const montar = () => {
    const prisma: any = {
      agentRun: { create: jest.fn(), findMany: jest.fn(), count: jest.fn() },
      agent: { findFirst: jest.fn(), create: jest.fn() },
      $executeRawUnsafe: jest.fn().mockResolvedValue(undefined),
    };
    return {
      prisma,
      servicio: new AgentRunService(prisma),
    };
  };

  it('al arrancar crea su tabla y siembra el revisor de bitácoras solo si no existe', async () => {
    const { servicio, prisma } = montar();
    prisma.agent.findFirst.mockResolvedValue(null);
    await servicio.onModuleInit();
    expect(prisma.$executeRawUnsafe).toHaveBeenCalled();
    expect(prisma.agent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          scope: 'BITACORAS',
          name: 'Agente Revisor de Bitácoras',
        }),
      }),
    );

    prisma.agent.create.mockClear();
    prisma.agent.findFirst.mockResolvedValue({ id: 4 });
    await servicio.onModuleInit();
    expect(prisma.agent.create).not.toHaveBeenCalled();
  });

  it('un fallo al registrar no se propaga: el agente ya hizo su trabajo', async () => {
    const { servicio, prisma } = montar();
    prisma.agentRun.create.mockRejectedValue(new Error('base caída'));
    await expect(
      servicio.registrar({
        agentId: 4,
        agentNombre: 'A',
        agentScope: 'BITACORAS',
        companyId: 1,
        userId: 1,
        userNombre: 'U',
        accion: 'LEER_BITACORA',
        exito: true,
      }),
    ).resolves.toBeUndefined();
  });

  it('la actividad se limita a la empresa de quien mira (el super admin ve todas)', async () => {
    const { servicio, prisma } = montar();
    prisma.agentRun.count.mockResolvedValue(0);
    prisma.agentRun.findMany.mockResolvedValue([]);
    await servicio.listar(7, {});
    expect(prisma.agentRun.findMany.mock.calls[0][0].where).toEqual({
      companyId: 7,
    });
    await servicio.listar(null, { exito: false });
    expect(prisma.agentRun.findMany.mock.calls[1][0].where).toEqual({
      exito: false,
    });
  });

  it('el resumen cuenta veces, fallos, duración promedio y tokens por agente', async () => {
    const { servicio, prisma } = montar();
    const ahora = new Date();
    prisma.agentRun.findMany.mockResolvedValue([
      {
        agentId: 4,
        agentNombre: 'A',
        exito: true,
        duracionMs: 4000,
        tokensEntrada: 1000,
        tokensSalida: 200,
        createdAt: ahora,
      },
      {
        agentId: 4,
        agentNombre: 'A',
        exito: false,
        duracionMs: 2000,
        tokensEntrada: null,
        tokensSalida: null,
        createdAt: new Date(ahora.getTime() - 1000),
      },
    ]);
    const r = await servicio.resumen(1, 30);
    expect(r.agentes).toEqual([
      {
        agentId: 4,
        agentNombre: 'A',
        ejecuciones: 2,
        errores: 1,
        duracionPromedioMs: 3000,
        tokens: 1200,
        ultima: ahora,
      },
    ]);
  });
});
