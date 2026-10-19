import { PrismaService } from '../../prisma/prisma.service';
import type { NotificationsService } from '../notifications/notifications.service';
import type { PermissionsService } from '../permissions/permissions.service';
import type { VentasOportunidadesService } from './ventas-oportunidades.service';
import { hoyEcuador, parseDiaContrato, sumarDias } from './agreement-status.util';
import { VentasRenovacionesService } from './ventas-renovaciones.service';

// Fase 4 (2026-10-18): el generador diario de oportunidades de renovación.
describe('VentasRenovacionesService.generar', () => {
  const hoyD = parseDiaContrato(hoyEcuador())!;
  const fin = (dias: number) => sumarDias(hoyD, dias);

  const contrato = (id: number, finEnDias: number, extra: Record<string, unknown> = {}) => ({
    id,
    companyId: 1,
    salesClientId: 100 + id,
    title: `Contrato ${id}`,
    endDate: fin(finEnDias),
    graceDays: 30,
    createdBy: 7,
    salesClient: { id: 100 + id, name: `Empresa ${id}` },
    services: [{ serviceId: 1 }],
    ...extra,
  });

  let prisma: any;
  let oportunidades: any;
  let notifications: any;
  let permissions: any;
  let servicio: VentasRenovacionesService;

  beforeEach(() => {
    prisma = {
      salesAgreement: { findMany: jest.fn() },
      salesOpportunity: { findMany: jest.fn().mockResolvedValue([]) },
      salesClientStage: { findFirst: jest.fn().mockResolvedValue({ key: 'RECIBIDO' }) },
      $transaction: jest.fn(async (fn: (tx: unknown) => unknown) => fn({})),
    };
    oportunidades = {
      crearInicial: jest.fn().mockResolvedValue({ id: 900 }),
      espejarCliente: jest.fn().mockResolvedValue(null),
    };
    notifications = { create: jest.fn().mockResolvedValue({}) };
    permissions = {
      getUsersWithExplicitSectionWrite: jest.fn().mockResolvedValue([{ id: 5, companyId: 1 }]),
    };
    servicio = new VentasRenovacionesService(
      prisma as unknown as PrismaService,
      oportunidades as unknown as VentasOportunidadesService,
      notifications as unknown as NotificationsService,
      permissions as unknown as PermissionsService,
    );
  });

  it('abre una oportunidad de renovación sin responsable y avisa al equipo', async () => {
    prisma.salesAgreement.findMany.mockResolvedValue([contrato(1, 12)]);
    const r = await servicio.generar();
    expect(r.creadas).toHaveLength(1);
    expect(oportunidades.crearInicial).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        originType: 'RENOVACION',
        renewsAgreementId: 1,
        assignedUserId: null,
        status: 'RECIBIDO',
        serviceIds: [1],
        title: 'Renovación – Contrato 1',
        createdBy: 7,
      }),
    );
    expect(notifications.create).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 5, title: 'Renovación por atender', link: '/ventas/oportunidades' }),
    );
  });

  it('busca solo contratos de servicio activos con fin dentro de 30 días', async () => {
    prisma.salesAgreement.findMany.mockResolvedValue([]);
    await servicio.generar();
    const donde = prisma.salesAgreement.findMany.mock.calls[0][0].where;
    expect(donde.kind).toBe('SERVICIO');
    expect(donde.status).toBe('ACTIVO');
    expect(donde.endDate.not).toBeNull();
    expect(donde.endDate.lte).toEqual(fin(30));
  });

  it('un contrato vencido dentro de su gracia sí genera; pasada la gracia no', async () => {
    prisma.salesAgreement.findMany.mockResolvedValue([
      contrato(1, -10), // venció hace 10 días, gracia 30: sí
      contrato(2, -31), // venció hace 31 días, gracia 30: ya es Inactivo, no
      contrato(3, -5, { graceDays: 0 }), // sin gracia: no
    ]);
    const r = await servicio.generar();
    expect(r.creadas.map((c) => c.contratoId)).toEqual([1]);
    expect(r.sinGraciaYa).toBe(2);
    expect(r.creadas[0].diasParaFin).toBe(-10);
  });

  it('no repite: un contrato que ya tiene su oportunidad (abierta o cerrada) se salta', async () => {
    prisma.salesAgreement.findMany.mockResolvedValue([contrato(1, 5), contrato(2, 5)]);
    prisma.salesOpportunity.findMany.mockResolvedValue([{ renewsAgreementId: 1 }]);
    const r = await servicio.generar();
    expect(r.creadas.map((c) => c.contratoId)).toEqual([2]);
    expect(r.yaTenian).toBe(1);
  });

  it('dryRun lista lo que crearía sin crear ni avisar nada', async () => {
    prisma.salesAgreement.findMany.mockResolvedValue([contrato(1, 12)]);
    const r = await servicio.generar({ dryRun: true });
    expect(r.dryRun).toBe(true);
    expect(r.creadas).toHaveLength(1);
    expect(oportunidades.crearInicial).not.toHaveBeenCalled();
    expect(notifications.create).not.toHaveBeenCalled();
  });

  it('si falla una, las demás se crean y el error queda en el resultado', async () => {
    prisma.salesAgreement.findMany.mockResolvedValue([contrato(1, 5), contrato(2, 5)]);
    oportunidades.crearInicial
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce({ id: 901 });
    const r = await servicio.generar();
    expect(r.errores).toEqual([{ contratoId: 1, error: 'boom' }]);
    expect(r.creadas.map((c) => c.contratoId)).toEqual([2]);
  });
});
