import { PrismaService } from '../../prisma/prisma.service';
import type { PermissionsService } from '../permissions/permissions.service';
import { AgentsService } from './agents.service';

// El Agente de Cacao (2026-11-11) se ve igual que el de Ventas: sin asignarlo, quien tiene acceso a
// la sección Cacao. Quien no la tiene no lo ve ni aunque lo tuviera asignado.
describe('AgentsService.getAvailableForUser — Agente de Cacao', () => {
  let prisma: any;
  let permissions: { getCompanySections: jest.Mock; getFixedSections: jest.Mock; getUserPermissions: jest.Mock };
  let servicio: AgentsService;

  const gemeseg = { id: 2, name: 'Agente GEMESEG', scope: 'GLOBAL', isActive: true, createdBy: null, instructions: '' };
  const cacao = { id: 11, name: 'Agente de Cacao', scope: 'CACAO', isActive: true, createdBy: null, instructions: '' };
  const ventas = { id: 9, name: 'Agente de Ventas', scope: 'VENTAS', isActive: true, createdBy: null, instructions: '' };

  beforeEach(() => {
    prisma = {
      userAgent: { findMany: jest.fn().mockResolvedValue([]) },
      agent: {
        findMany: jest.fn().mockResolvedValue([gemeseg, cacao, ventas]),
        findFirst: jest.fn().mockResolvedValue(gemeseg),
      },
    };
    permissions = {
      getCompanySections: jest.fn().mockResolvedValue([
        { key: 'CACAO', enabled: true },
        { key: 'VENTAS', enabled: true },
      ]),
      getFixedSections: jest.fn().mockResolvedValue(['DASHBOARD']),
      getUserPermissions: jest.fn().mockResolvedValue([]),
    };
    servicio = new AgentsService(prisma as unknown as PrismaService, permissions as unknown as PermissionsService);
  });

  const nombres = (r: { agents: { name: string }[] }) => r.agents.map((a) => a.name);

  it('quien tiene Cacao lo ve sin asignárselo, y la consulta lo pide', async () => {
    const r = await servicio.getAvailableForUser(1, 10);
    expect(nombres(r)).toContain('Agente de Cacao');
    const donde = prisma.agent.findMany.mock.calls[0][0].where;
    expect(donde.OR).toContainEqual({ createdBy: null, scope: 'CACAO' });
  });

  it('los agentes generales del sistema ya no arrastran al de Cacao: solo entra por su permiso', async () => {
    const donde = (await (async () => {
      await servicio.getAvailableForUser(1, 10);
      return prisma.agent.findMany.mock.calls[0][0].where;
    })());
    expect(donde.OR[0].NOT.scope.in).toEqual(expect.arrayContaining(['VENTAS', 'CACAO']));
  });

  it('quien NO tiene Cacao no lo ve, pero conserva el de Ventas si lo tiene', async () => {
    permissions.getUserPermissions.mockResolvedValue([{ section: 'CACAO', canView: false, canWrite: false }]);
    prisma.agent.findMany.mockResolvedValue([gemeseg, ventas]);
    const r = await servicio.getAvailableForUser(1, 10);
    expect(nombres(r)).not.toContain('Agente de Cacao');
    expect(nombres(r)).toContain('Agente de Ventas');
    expect(prisma.agent.findMany.mock.calls[0][0].where.OR).not.toContainEqual({ createdBy: null, scope: 'CACAO' });
  });

  it('aunque lo tuviera asignado de antes, con la sección apagada para la empresa se oculta', async () => {
    permissions.getCompanySections.mockResolvedValue([{ key: 'VENTAS', enabled: true }]);
    const r = await servicio.getAvailableForUser(1, 10); // la base devuelve también el de Cacao
    expect(nombres(r)).toEqual(['Agente GEMESEG', 'Agente de Ventas']);
  });

  it('un super admin (sin empresa) lo ve', async () => {
    const r = await servicio.getAvailableForUser(1, null);
    expect(nombres(r)).toContain('Agente de Cacao');
  });
});
