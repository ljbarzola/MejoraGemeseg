import { PrismaService } from '../../prisma/prisma.service';
import { VentasClientesService } from './ventas-clientes.service';

// Resumen del Dashboard (2026-10-18): «mis clientes» y «por responsable» se calculan por el responsable de
// cada OPORTUNIDAD, no por el de la empresa (que desde el 16/10 suele quedar vacío). Antes un vendedor
// veía su tablero vacío aunque llevara oportunidades, y el bloque por responsable mostraba casi todo
// como «Sin responsable».
describe('VentasClientesService.getDashboard — por responsable de la oportunidad', () => {
  let prisma: any;
  let servicio: VentasClientesService;

  const etapas = [
    { key: 'RECIBIDO', label: 'Nueva', color: '#aaa', isFinal: false, order: 1 },
    { key: 'ACEPTADO', label: 'Aceptada', color: '#0a0', isFinal: true, order: 2 },
    { key: 'RECHAZADO', label: 'Perdida', color: '#a00', isFinal: true, order: 3 },
  ];
  const ayer = new Date(Date.now() - 2 * 86_400_000);
  const cliente = (id: number, extra: Record<string, unknown> = {}) => ({
    id,
    name: `Empresa ${id}`,
    status: 'RECIBIDO',
    assignedUserId: null,
    assignedUser: null,
    nextActionDate: null,
    createdAt: new Date(),
    referredByUserId: null,
    referredBy: null,
    ...extra,
  });

  beforeEach(() => {
    prisma = {
      salesClientStage: { count: jest.fn().mockResolvedValue(3), findMany: jest.fn().mockResolvedValue(etapas) },
      salesClient: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
        groupBy: jest.fn().mockResolvedValue([]),
      },
      salesOpportunity: { findMany: jest.fn().mockResolvedValue([]), groupBy: jest.fn().mockResolvedValue([]) },
      salesClientStageChange: { findMany: jest.fn().mockResolvedValue([]) },
      salesContract: { groupBy: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(0) },
      user: { findMany: jest.fn().mockResolvedValue([{ id: 7, fullName: 'Ana' }, { id: 8, fullName: 'Beto' }]) },
    };
    servicio = new VentasClientesService(
      prisma as unknown as PrismaService,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
  });

  const opp = (clienteId: number, asignado: number | null, over: Record<string, unknown> = {}) => ({
    salesClientId: clienteId,
    status: 'RECIBIDO',
    closedAt: null,
    outcome: null,
    assignedUserId: asignado,
    ...over,
  });

  it('un vendedor ve como suyos a los clientes donde lleva una oportunidad, aunque la empresa no tenga responsable', async () => {
    await servicio.getDashboard(1, { userId: 7, role: 'EMPLOYEE' }, {});
    const donde = prisma.salesClient.findMany.mock.calls[0][0].where;
    expect(donde.OR).toEqual([
      { assignedUserId: 7 },
      { opportunities: { some: { assignedUserId: 7 } } },
    ]);
    expect(donde.assignedUserId).toBeUndefined();
  });

  it('«toda la empresa» no filtra por responsable', async () => {
    await servicio.getDashboard(1, { userId: 1, role: 'ADMIN' }, { responsable: 'all' });
    const donde = prisma.salesClient.findMany.mock.calls[0][0].where;
    expect(donde.OR).toBeUndefined();
  });

  it('cuenta por el responsable de cada oportunidad: abiertas = activos, ganadas = aceptados, y la cola sin dueño', async () => {
    prisma.salesClient.findMany.mockResolvedValue([
      cliente(1, { nextActionDate: ayer }), // seguimiento vencido
      cliente(2),
      cliente(3, { assignedUserId: 7, assignedUser: { fullName: 'Ana' }, status: 'ACEPTADO' }), // sistema anterior, sin oportunidades
    ]);
    prisma.salesOpportunity.findMany.mockResolvedValue([
      opp(1, 7),
      opp(1, 8),
      opp(2, null),
      opp(2, 7, { closedAt: new Date(), outcome: 'GANADA' }),
    ]);
    const r = await servicio.getDashboard(1, { userId: 1, role: 'ADMIN' }, { responsable: 'all' });
    const fila = (id: number | null) => r.porResponsable.find((f) => f.userId === id);
    expect(fila(7)).toMatchObject({ nombre: 'Ana', activos: 1, vencidos: 1, aceptados: 2 }); // 1 abierta + 1 ganada + cliente 3 (aceptado, del sistema anterior)
    expect(fila(8)).toMatchObject({ nombre: 'Beto', activos: 1, vencidos: 1, aceptados: 0 });
    expect(fila(null)).toMatchObject({ nombre: 'Sin responsable', activos: 1, vencidos: 0, aceptados: 0 });
    // la cola sin dueño va primero
    expect(r.porResponsable[0].userId).toBeNull();
  });

  it('con «mis clientes» solo cuenta MIS oportunidades, no las de otros en la misma empresa', async () => {
    prisma.salesClient.findMany.mockResolvedValue([cliente(1)]);
    prisma.salesOpportunity.findMany.mockResolvedValue([opp(1, 7), opp(1, 8)]);
    const r = await servicio.getDashboard(1, { userId: 7, role: 'EMPLOYEE' }, {});
    expect(r.porResponsable).toHaveLength(1);
    expect(r.porResponsable[0]).toMatchObject({ userId: 7, activos: 1 });
  });

  it('el selector de vendedores del gerente incluye a quienes llevan oportunidades', async () => {
    prisma.salesClient.groupBy.mockResolvedValue([{ assignedUserId: 8 }]);
    prisma.salesOpportunity.groupBy.mockResolvedValue([{ assignedUserId: 7 }, { assignedUserId: 8 }]);
    const r = await servicio.getDashboard(1, { userId: 1, role: 'MANAGER' }, { responsable: 'all' });
    const consulta = prisma.user.findMany.mock.calls.find((c: any[]) => c[0]?.orderBy)?.[0];
    expect([...consulta.where.id.in].sort()).toEqual([7, 8]);
    expect(r.responsables.map((x) => x.id).sort()).toEqual([7, 8]);
  });

  it('los contratos del alcance siguen la misma regla (oportunidad o responsable anterior)', async () => {
    await servicio.getDashboard(1, { userId: 7, role: 'EMPLOYEE' }, {});
    const donde = prisma.salesContract.groupBy.mock.calls[0][0].where;
    expect(donde.salesClient.is.OR).toEqual([
      { assignedUserId: 7 },
      { opportunities: { some: { assignedUserId: 7 } } },
    ]);
  });
  // 2026-10-21: el embudo y la aceptación cuentan OPORTUNIDADES, igual que la lista a la que lleva cada botón.
  describe('embudo y aceptación por oportunidad', () => {
    const ganadaOpp = (clienteId: number, asignado: number | null) =>
      opp(clienteId, asignado, { status: 'ACEPTADO', closedAt: new Date(), outcome: 'GANADA' });
    const cuenta = (r: any, key: string | null) => r.embudo.find((e: any) => e.key === key)?.count ?? 0;

    it('un cliente con dos oportunidades aceptadas cuenta dos, no una (aunque su ficha diga otra cosa)', async () => {
      prisma.salesClient.findMany.mockResolvedValue([cliente(1, { status: 'RECIBIDO' })]);
      prisma.salesOpportunity.findMany.mockResolvedValue([ganadaOpp(1, 7), ganadaOpp(1, 7)]);
      const r = await servicio.getDashboard(1, { userId: 1, role: 'ADMIN' }, { responsable: 'all' });
      expect(cuenta(r, 'ACEPTADO')).toBe(2);
      expect(cuenta(r, 'RECIBIDO')).toBe(0);
      expect(r.aceptacion.aceptados).toBe(2);
    });

    it('con «mis clientes» solo cuentan MIS oportunidades: lo mismo que filtra Oportunidades por responsable', async () => {
      prisma.salesClient.findMany.mockResolvedValue([cliente(1), cliente(2)]);
      prisma.salesOpportunity.findMany.mockResolvedValue([
        opp(1, 7),
        ganadaOpp(1, 8), // del mismo cliente pero de otro vendedor: no es mía
        ganadaOpp(2, 7),
      ]);
      const r = await servicio.getDashboard(1, { userId: 7, role: 'EMPLOYEE' }, {});
      expect(cuenta(r, 'RECIBIDO')).toBe(1);
      expect(cuenta(r, 'ACEPTADO')).toBe(1);
      expect(r.aceptacion.aceptados).toBe(1);
    });

    it('una empresa del sistema anterior, sin oportunidades, cuenta por la etapa de su ficha', async () => {
      prisma.salesClient.findMany.mockResolvedValue([cliente(1, { status: 'ACEPTADO', assignedUserId: 7, assignedUser: { fullName: 'Ana' } })]);
      const r = await servicio.getDashboard(1, { userId: 7, role: 'EMPLOYEE' }, {});
      expect(cuenta(r, 'ACEPTADO')).toBe(1);
      expect(r.aceptacion.aceptados).toBe(1);
    });

    it('una empresa solo de datos (sin oportunidades y sin etapa) no aparece como «Sin etapa» en el embudo', async () => {
      prisma.salesClient.findMany.mockResolvedValue([cliente(1, { status: null })]);
      const r = await servicio.getDashboard(1, { userId: 1, role: 'ADMIN' }, { responsable: 'all' });
      expect(r.embudo.find((e: any) => e.key === null)).toBeUndefined();
    });
  });

  it('el gerente puede elegir a TODAS las personas con acceso a Ventas, tengan o no oportunidades', async () => {
    prisma.salesOpportunity.groupBy.mockResolvedValue([{ assignedUserId: 7 }]);
    prisma.user.findMany
      .mockResolvedValueOnce([{ id: 7 }, { id: 8 }, { id: 9 }]) // con acceso a Ventas (la consulta de acceso)
      .mockResolvedValueOnce([{ id: 7, fullName: 'Ana' }, { id: 8, fullName: 'Beto' }, { id: 9, fullName: 'Carla' }]);
    const r = await servicio.getDashboard(1, { userId: 1, role: 'MANAGER' }, { responsable: 'all' });
    expect(r.responsables.map((x: any) => x.nombre)).toEqual(['Ana', 'Beto', 'Carla']);
    // y la consulta de acceso excluye a quien tiene Ventas negado en sus permisos
    expect(prisma.user.findMany.mock.calls[0][0].where).toEqual({
      companyId: 1, isActive: true, NOT: { permissions: { some: { section: 'VENTAS', canView: false } } },
    });
  });
});
