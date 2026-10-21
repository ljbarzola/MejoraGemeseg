import { PrismaService } from '../../prisma/prisma.service';
import type { PermissionsService } from '../permissions/permissions.service';
import { AgentsService } from './agents.service';

// El Agente de Ventas ya no se asigna uno a uno (2026-10-18): lo ve en el selector del chat
// cualquiera que tenga acceso a Ventas.
describe('AgentsService.getAvailableForUser — Agente de Ventas', () => {
  let prisma: any;
  let permissions: { getCompanySections: jest.Mock; getFixedSections: jest.Mock; getUserPermissions: jest.Mock };
  let servicio: AgentsService;

  const gemeseg = { id: 2, name: 'Agente GEMESEG', scope: 'GLOBAL', isActive: true, createdBy: null, instructions: '' };
  const ventas = { id: 9, name: 'Agente de Ventas', scope: 'VENTAS', isActive: true, createdBy: null, instructions: '' };

  beforeEach(() => {
    prisma = {
      userAgent: { findMany: jest.fn().mockResolvedValue([]) },
      agent: {
        findMany: jest.fn().mockResolvedValue([gemeseg, ventas]),
        findFirst: jest.fn().mockResolvedValue(gemeseg),
      },
    };
    permissions = {
      getCompanySections: jest.fn().mockResolvedValue([{ key: 'VENTAS', enabled: true }]),
      getFixedSections: jest.fn().mockResolvedValue(['DASHBOARD']),
      getUserPermissions: jest.fn().mockResolvedValue([]),
    };
    servicio = new AgentsService(prisma as unknown as PrismaService, permissions as unknown as PermissionsService);
  });

  const nombres = (r: { agents: { name: string }[] }) => r.agents.map((a) => a.name);

  it('quien tiene Ventas lo ve sin asignárselo, y la consulta lo incluye', async () => {
    const r = await servicio.getAvailableForUser(1, 10);
    expect(nombres(r)).toContain('Agente de Ventas');
    const donde = prisma.agent.findMany.mock.calls[0][0].where;
    expect(donde.OR).toContainEqual({ createdBy: null, scope: 'VENTAS' });
  });

  it('quien NO tiene Ventas no lo ve, y la consulta ni lo pide', async () => {
    permissions.getUserPermissions.mockResolvedValue([{ section: 'VENTAS', canView: false, canWrite: false }]);
    prisma.agent.findMany.mockResolvedValue([gemeseg]);
    const r = await servicio.getAvailableForUser(1, 10);
    expect(nombres(r)).not.toContain('Agente de Ventas');
    expect(prisma.agent.findMany.mock.calls[0][0].where.OR).not.toContainEqual({ createdBy: null, scope: 'VENTAS' });
  });

  it('aunque lo tuviera asignado de antes, sin acceso a Ventas se oculta', async () => {
    permissions.getCompanySections.mockResolvedValue([{ key: 'VENTAS', enabled: false }]);
    const r = await servicio.getAvailableForUser(1, 10); // la base devuelve también el de Ventas (asignado)
    expect(nombres(r)).toEqual(['Agente GEMESEG']);
  });

  it('un super admin (sin empresa) lo ve', async () => {
    const r = await servicio.getAvailableForUser(1, null);
    expect(nombres(r)).toContain('Agente de Ventas');
    expect(permissions.getCompanySections).not.toHaveBeenCalled();
  });

  it('sin fila de permiso rige el valor por defecto de Ventas (permitido)', async () => {
    permissions.getUserPermissions.mockResolvedValue([]);
    const r = await servicio.getAvailableForUser(1, 10);
    expect(nombres(r)).toContain('Agente de Ventas');
  });
});
