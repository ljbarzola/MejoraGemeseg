import { PrismaService } from '../../prisma/prisma.service';
import { VentasAnaliticaService } from './ventas-analitica.service';

// Mapa del Dashboard: el periodo (desde/hasta, días de Ecuador) filtra por la fecha en que LLEGÓ la oportunidad,
// igual que el filtro «Llegó» de la lista a la que lleva «Ver en oportunidades» (2026-10-28).
describe('VentasAnaliticaService.mapa — periodo y paridad con la lista', () => {
  let prisma: any;
  let servicio: VentasAnaliticaService;
  const admin = { userId: 1, role: 'ADMIN', alcance: 'all' };

  beforeEach(() => {
    prisma = { salesOpportunity: { findMany: jest.fn().mockResolvedValue([]) } };
    servicio = new VentasAnaliticaService(prisma as unknown as PrismaService, {} as never);
  });

  it('sin periodo no filtra por fecha de llegada', async () => {
    await servicio.mapa(1, admin, 'todas');
    expect(prisma.salesOpportunity.findMany.mock.calls[0][0].where.receivedAt).toBeUndefined();
  });

  it('con periodo filtra receivedAt por días de Ecuador (UTC-5), incluyendo todo el día «hasta»', async () => {
    await servicio.mapa(1, admin, 'todas', '2026-05-01', '2026-05-31');
    const { receivedAt } = prisma.salesOpportunity.findMany.mock.calls[0][0].where;
    expect(receivedAt.gte.toISOString()).toBe('2026-05-01T05:00:00.000Z');
    expect(receivedAt.lte.toISOString()).toBe('2026-06-01T04:59:59.999Z');
  });

  it('un periodo mal escrito se rechaza con un mensaje claro', async () => {
    await expect(servicio.mapa(1, admin, 'todas', '2026-13-01', undefined)).rejects.toThrow('no es válida');
    expect(prisma.salesOpportunity.findMany).not.toHaveBeenCalled();
  });

  it('sigue dejando fuera las renovaciones y los clientes históricos (la lista abre con «Ventas nuevas»)', async () => {
    await servicio.mapa(1, admin, 'todas');
    expect(prisma.salesOpportunity.findMany.mock.calls[0][0].where.originType).toEqual({ notIn: ['HISTORICO', 'RENOVACION'] });
  });

  it('el alcance «mine» limita al responsable de la oportunidad', async () => {
    await servicio.mapa(1, { userId: 7, role: 'EMPLOYEE', alcance: 'mine' }, 'todas');
    expect(prisma.salesOpportunity.findMany.mock.calls[0][0].where.assignedUserId).toBe(7);
  });
});
