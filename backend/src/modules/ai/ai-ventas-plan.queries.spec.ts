import { PrismaService } from '../../prisma/prisma.service';
import { hoyEcuador } from '../ventas/agreement-status.util';
import type { VentasCicloService } from '../ventas/ventas-ciclo.service';
import { AiVentasPlanQueries, pesoRecencia } from './ai-ventas-plan.queries';

// El plan del día y los inactivos a recuperar (Agente de Ventas, 2026-10-18).
const hoy = hoyEcuador();
const hace = (dias: number) => new Date(Date.parse(`${hoy}T12:00:00.000Z`) - dias * 86_400_000);
const enDias = (dias: number) => new Date(`${new Date(Date.parse(`${hoy}T00:00:00.000Z`) + dias * 86_400_000).toISOString().slice(0, 10)}T00:00:00.000Z`);

describe('pesoRecencia', () => {
  it('pesa más lo que terminó hace poco', () => {
    expect(pesoRecencia(30)).toBe(1);
    expect(pesoRecencia(150)).toBe(0.7);
    expect(pesoRecencia(300)).toBe(0.4);
    expect(pesoRecencia(900)).toBe(0.2);
  });
});

describe('AiVentasPlanQueries.prioridades', () => {
  let prisma: any;
  let servicio: AiVentasPlanQueries;

  const opp = (id: number, over: Record<string, unknown> = {}) => ({
    id,
    salesClientId: 100 + id,
    title: null,
    status: 'COTIZADO',
    receivedAt: hace(30),
    quotedAmount: null,
    salesClient: { id: 100 + id, name: `Empresa ${id}`, nextActionText: null, nextActionDate: null },
    services: [{ service: { name: 'Agentes de Seguridad' } }],
    stageChanges: [],
    ...over,
  });

  beforeEach(() => {
    prisma = {
      user: { findUnique: jest.fn().mockResolvedValue({ role: 'EMPLOYEE', fullName: 'Ana' }) },
      salesClientStage: {
        findMany: jest.fn().mockResolvedValue([
          { key: 'RECIBIDO', label: 'Nueva' },
          { key: 'COTIZADO', label: 'Cotizada' },
        ]),
      },
      salesOpportunity: {
        findMany: jest.fn().mockImplementation(async (args: any) =>
          args.where.renewsAgreementId ? [] : [],
        ),
      },
      salesAgreement: { findMany: jest.fn().mockResolvedValue([]) },
      salesLead: { findMany: jest.fn().mockResolvedValue([]) },
    };
    servicio = new AiVentasPlanQueries(prisma as unknown as PrismaService, {} as unknown as VentasCicloService);
  });

  it('clasifica seguimientos vencidos, para hoy, nuevas sin tocar, cotizadas sin respuesta y estancadas, con su marca', async () => {
    prisma.salesOpportunity.findMany.mockImplementation(async (args: any) => {
      if (args.where.renewsAgreementId) return [];
      return [
        opp(1, { salesClient: { id: 101, name: 'Hotel Sol', nextActionText: 'Llamar', nextActionDate: enDias(-3) } }),
        opp(2, { salesClient: { id: 102, name: 'Clínica Norte', nextActionText: 'Enviar cotización', nextActionDate: enDias(0) } }),
        opp(3, { status: 'RECIBIDO', receivedAt: hace(5), stageChanges: [] }),
        opp(4, { status: 'COTIZADO', stageChanges: [{ createdAt: hace(10) }] }),
        opp(5, { status: 'RECIBIDO', receivedAt: hace(1), stageChanges: [] }), // reciente: no cuenta
      ];
    });
    const t = await servicio.prioridades(1, 7);
    expect(t).toContain('SEGUIMIENTOS VENCIDOS (1)');
    expect(t).toContain('Hotel Sol');
    expect(t).toContain('vencido hace 3 días');
    expect(t).toContain('[#opp:1]');
    expect(t).toContain('SEGUIMIENTOS PARA HOY (1)');
    expect(t).toContain('Clínica Norte');
    expect(t).toContain('OPORTUNIDADES NUEVAS SIN TOCAR (1');
    expect(t).toContain('[#opp:3]');
    expect(t).not.toContain('[#opp:5]');
    expect(t).toContain('COTIZADAS SIN RESPUESTA (1');
    expect(t).toContain('[#opp:4]');
  });

  it('solo mira las oportunidades de quien pregunta, salvo un administrador que pide el equipo', async () => {
    await servicio.prioridades(1, 7, 'equipo'); // EMPLOYEE: el alcance se ignora
    const donde = prisma.salesOpportunity.findMany.mock.calls[0][0].where;
    expect(donde.assignedUserId).toBe(7);

    prisma.user.findUnique.mockResolvedValue({ role: 'ADMIN', fullName: 'Ana' });
    prisma.salesOpportunity.findMany.mockClear();
    const texto = await servicio.prioridades(1, 7, 'equipo');
    expect(prisma.salesOpportunity.findMany.mock.calls[0][0].where.assignedUserId).toBeUndefined();
    expect(texto).toContain('TODO el equipo');
  });

  it('muestra las renovaciones por atender con el estado de su oportunidad', async () => {
    prisma.salesAgreement.findMany.mockResolvedValue([
      { id: 10, title: 'Servicio Los Álamos', endDate: enDias(12), graceDays: 30, monthlyValue: 3800, salesClient: { name: 'Los Álamos' } },
      { id: 11, title: 'Servicio Tornillo', endDate: enDias(-10), graceDays: 30, monthlyValue: 1900, salesClient: { name: 'El Tornillo' } },
      { id: 12, title: 'Servicio Lejano', endDate: enDias(200), graceDays: 30, monthlyValue: 1, salesClient: { name: 'Lejano' } },
      { id: 13, title: 'Servicio Viejo', endDate: enDias(-40), graceDays: 30, monthlyValue: 1, salesClient: { name: 'Viejo' } },
    ]);
    prisma.salesOpportunity.findMany.mockImplementation(async (args: any) =>
      args.where.renewsAgreementId
        ? [{ id: 90, renewsAgreementId: 10, assignedUserId: null, closedAt: null, outcome: null }]
        : [],
    );
    const t = await servicio.prioridades(1, 7);
    expect(t).toContain('RENOVACIONES POR ATENDER (2');
    expect(t).toContain('Los Álamos');
    expect(t).toContain('SIN responsable');
    expect(t).toContain('[#contrato:10] [#opp:90]');
    expect(t).toContain('El Tornillo');
    expect(t).toContain('todavía no tiene oportunidad de renovación');
    expect(t).toContain('sigue en gracia');
    expect(t).not.toContain('Lejano'); // faltan más de 30 días
    expect(t).not.toContain('Servicio Viejo'); // ya pasó la gracia
  });

  it('lista los posibles clientes sin atender hace 2 días o más, y dice lo que no consta', async () => {
    prisma.salesLead.findMany.mockResolvedValue([
      { id: 5, name: 'Pedro', companyName: 'Textiles', channel: 'WEB_FORM', createdAt: hace(4), contactReason: null },
      { id: 6, name: 'Luis', companyName: null, channel: 'MANUAL', createdAt: hace(0), contactReason: null },
    ]);
    const t = await servicio.prioridades(1, 7);
    expect(t).toContain('POSIBLES CLIENTES SIN ATENDER (1');
    expect(t).toContain('Textiles');
    expect(t).toContain('[#lead:5]');
    expect(t).not.toContain('[#lead:6]');
    expect(t).toContain('Lo que NO consta');
  });
});

describe('AiVentasPlanQueries.inactivos', () => {
  let prisma: any;
  let ciclos: { calcular: jest.Mock };
  let servicio: AiVentasPlanQueries;

  const contrato = (id: number, clienteId: number, finDias: number, valor: number | null, extra: Record<string, unknown> = {}) => ({
    id,
    salesClientId: clienteId,
    kind: 'SERVICIO',
    startDate: enDias(finDias - 365),
    endDate: enDias(finDias),
    cancelledAt: null,
    monthlyValue: valor,
    services: [{ service: { name: 'Monitoreo de Cámaras' } }],
    ...extra,
  });

  beforeEach(() => {
    ciclos = { calcular: jest.fn() };
    prisma = {
      salesClient: {
        findMany: jest.fn().mockResolvedValue([
          { id: 1, name: 'Ferretería El Tornillo', email: 'a@x.com', phone: '099' },
          { id: 2, name: 'Colegio Antiguo', email: null, phone: null },
          { id: 3, name: 'Hotel Grande', email: null, phone: null },
        ]),
      },
      salesAgreement: {
        findMany: jest.fn().mockResolvedValue([
          contrato(11, 1, -30, 1900),
          contrato(12, 2, -800, 9000),
          contrato(13, 3, -60, 6500),
        ]),
      },
      salesReasonEntry: {
        findMany: jest.fn().mockResolvedValue([
          { id: 70, salesClientId: 3, kind: 'CONTRATO_NO_RENOVADO', reasonLabel: 'Precio', source: 'CLIENTE', comment: null },
        ]),
      },
      salesClientActivity: { groupBy: jest.fn().mockResolvedValue([]) },
      salesOpportunity: { findMany: jest.fn().mockResolvedValue([{ id: 99, salesClientId: 1, title: null }]) },
      salesAgreementIncident: { groupBy: jest.fn().mockResolvedValue([{ agreementId: 13, _count: { _all: 2 } }]) },
    };
    servicio = new AiVentasPlanQueries(prisma as unknown as PrismaService, ciclos as unknown as VentasCicloService);
  });

  it('sin inactivos lo dice claro', async () => {
    ciclos.calcular.mockResolvedValue(new Map([[1, { ciclo: 'CLIENTE', razones: [], oportunidadesAbiertas: 0 }]]));
    expect(await servicio.inactivos(1)).toContain('No hay clientes inactivos');
  });

  it('ordena por valor mensual y recencia, y trae motivo, incidentes y oportunidad abierta con su marca', async () => {
    ciclos.calcular.mockResolvedValue(
      new Map([
        [1, { ciclo: 'EX_CLIENTE', razones: [], oportunidadesAbiertas: 1 }],
        [2, { ciclo: 'EX_CLIENTE', razones: [], oportunidadesAbiertas: 0 }],
        [3, { ciclo: 'EX_CLIENTE', razones: [], oportunidadesAbiertas: 0 }],
        [4, { ciclo: 'CLIENTE', razones: [], oportunidadesAbiertas: 0 }],
      ]),
    );
    const t = await servicio.inactivos(1);
    expect(t).toContain('inactivos (tuvieron contrato de servicio y hoy no tienen ninguno vigente): 3');
    // Hotel Grande (6.500, hace 60 días) > Ferretería (1.900, hace 30) > Colegio (9.000 pero hace más de 2 años)
    expect(t.indexOf('Hotel Grande')).toBeLessThan(t.indexOf('Ferretería El Tornillo'));
    expect(t.indexOf('Ferretería El Tornillo')).toBeLessThan(t.indexOf('Colegio Antiguo'));
    expect(t).toContain('Precio');
    expect(t).toContain('lo dijo el cliente');
    expect(t).toContain('[#motivo:70]');
    expect(t).toContain('incidentes del servicio registrados: 2');
    expect(t).toContain('YA hay una oportunidad abierta');
    expect(t).toContain('[#opp:99]');
    expect(t).toContain('[#contrato:13]');
    expect(t).toContain('no consta (nadie registró el motivo)'); // Ferretería y Colegio no tienen motivo
    expect(t).toContain('Lo que NO consta');
  });
});
