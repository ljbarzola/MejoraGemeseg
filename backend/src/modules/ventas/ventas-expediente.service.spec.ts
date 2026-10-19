import { PrismaService } from '../../prisma/prisma.service';
import type { VentasAnaliticaService } from './ventas-analitica.service';
import type { VentasCicloService } from './ventas-ciclo.service';
import { VentasExpedienteService } from './ventas-expediente.service';

// Expediente de un cliente: lo que lee el Agente de Ventas. Dos cosas que se corrigieron el 2026-10-18:
// no comparar un contrato ADICIONAL con el anterior (parecía haber «quitado» servicios), y mostrar el día
// de Ecuador en los eventos con hora (de noche en UTC ya era «mañana»).
describe('VentasExpedienteService', () => {
  let prisma: any;
  let servicio: VentasExpedienteService;

  const dia = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
  const contrato = (id: number, extra: Record<string, unknown> = {}) => ({
    id,
    salesClientId: 1,
    title: `Contrato ${id}`,
    kind: 'SERVICIO',
    status: 'ACTIVO',
    startDate: dia('2026-01-01'),
    endDate: dia('2027-12-31'),
    monthlyValue: 1000,
    graceDays: 30,
    cancelledAt: null,
    totalValue: null,
    deliveredAt: null,
    warrantyUntil: null,
    renewedFromId: null,
    services: [{ serviceId: 1, service: { id: 1, name: 'Agentes de Seguridad' } }],
    _count: { documents: 0 },
    ...extra,
  });

  beforeEach(() => {
    prisma = {
      salesClient: {
        findFirst: jest.fn().mockResolvedValue({ id: 1 }),
        findFirstOrThrow: jest.fn().mockResolvedValue({
          id: 1,
          name: 'Hotel Sol',
          createdAt: new Date('2026-10-19T03:30:00.000Z'), // 18/10 22:30 en Ecuador
          extra: {},
          referredBy: null,
          assignedUser: null,
          nextActionText: null,
          nextActionDate: null,
        }),
      },
      salesOpportunity: { findMany: jest.fn().mockResolvedValue([]) },
      salesClientActivity: {
        findMany: jest.fn().mockResolvedValue([
          { id: 5, type: 'NOTA', otherLabel: null, text: 'Llamé al gerente', createdBy: 7, createdAt: new Date('2026-10-19T03:30:00.000Z') },
        ]),
      },
      salesAgreement: { findMany: jest.fn().mockResolvedValue([]) },
      salesReasonEntry: { findMany: jest.fn().mockResolvedValue([]) },
      salesContract: { findMany: jest.fn().mockResolvedValue([]) },
      user: { findMany: jest.fn().mockResolvedValue([{ id: 7, fullName: 'Ana' }]) },
      salesAgreementIncident: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const ciclos = { calcular: jest.fn().mockResolvedValue(new Map([[1, { ciclo: 'CLIENTE', razones: [] }]])) };
    const analitica = {
      velocidadEmpresa: jest.fn().mockResolvedValue({
        cotizacionDias: { mediana: null, p75: null, n: 0, pocasMuestras: true },
        respuestaDias: { mediana: null, p75: null, n: 0, pocasMuestras: true },
      }),
    };
    servicio = new VentasExpedienteService(
      prisma as unknown as PrismaService,
      analitica as unknown as VentasAnaliticaService,
      ciclos as unknown as VentasCicloService,
    );
  });

  it('un cliente de otra empresa (o inexistente) no se encuentra', async () => {
    prisma.salesClient.findFirst.mockResolvedValue(null);
    const r = await servicio.armarPorId(1, 999);
    expect(r.estado).toBe('NO_ENCONTRADO');
    expect(r.texto).toContain('No encontré');
  });

  it('un contrato ADICIONAL no se compara con el anterior: se dice que es aparte', async () => {
    prisma.salesAgreement.findMany.mockResolvedValue([
      contrato(1),
      contrato(10, {
        startDate: dia('2026-10-18'),
        endDate: null,
        monthlyValue: null,
        services: [{ serviceId: 2, service: { id: 2, name: 'Monitoreo de Cámaras' } }],
      }),
    ]);
    const { texto } = await servicio.armarPorId(1, 1);
    expect(texto).not.toContain('QUITADOS');
    expect(texto).not.toContain('Frente al contrato anterior');
    expect(texto).toContain('No renueva a otro contrato: es un contrato aparte');
    expect(texto).not.toContain('falta el valor mensual en alguno');
  });

  it('una RENOVACIÓN sí se compara con el contrato que renueva', async () => {
    prisma.salesAgreement.findMany.mockResolvedValue([
      contrato(1, { status: 'RENOVADO', endDate: dia('2026-12-31') }),
      contrato(2, {
        renewedFromId: 1,
        startDate: dia('2027-01-01'),
        monthlyValue: 800,
        services: [{ serviceId: 2, service: { id: 2, name: 'Monitoreo de Cámaras' } }],
      }),
    ]);
    const { texto } = await servicio.armarPorId(1, 1);
    expect(texto).toContain('Frente al contrato anterior (#1)');
    expect(texto).toContain('servicios QUITADOS: Agentes de Seguridad');
    expect(texto).toContain('servicios agregados: Monitoreo de Cámaras');
    expect(texto).toContain('baja 20%');
    expect(texto).not.toContain('No renueva a otro contrato');
  });

  it('los eventos con hora salen con el día de Ecuador, no el de UTC', async () => {
    const { texto } = await servicio.armarPorId(1, 1);
    // 2026-10-19T03:30Z = 18/10/2026 22:30 en Ecuador
    expect(texto).toContain('Registrado el 18/10/2026');
    expect(texto).toContain('- 18/10/2026 [#act:5] Nota (Ana): Llamé al gerente');
    expect(texto).not.toContain('19/10/2026');
    // y nunca «hace -1 días»
    expect(texto).not.toMatch(/hace -\d/);
  });
});
