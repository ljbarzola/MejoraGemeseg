import { PrismaService } from '../../prisma/prisma.service';
import { VentasAnaliticaService } from './ventas-analitica.service';

// «Motivos de pérdida» tiene que sumar lo mismo que el medidor de Aceptación y que la lista a la que lleva cada botón.
// Lo perdido o descartado antes de que el sistema pidiera un motivo no tiene registro: cuenta como «Sin información»
// (Dashboard de producción, 2026-10-21: 12 perdidas en el medidor y 10 en la dona).
describe('VentasAnaliticaService.motivos', () => {
  const ahora = new Date();
  let prisma: any;
  let servicio: VentasAnaliticaService;

  const entradaPerdida = (label: string) => ({ kind: 'OPP_PERDIDA', reasonLabel: label, source: 'CLIENTE' });

  beforeEach(() => {
    prisma = {
      salesClient: { findMany: jest.fn().mockResolvedValue([]) },
      salesLead: { findMany: jest.fn().mockResolvedValue([]) },
      salesOpportunity: {
        // 12 perdidas: las ids 1 y 2 no tienen ningún motivo registrado.
        findMany: jest.fn().mockResolvedValue(Array.from({ length: 12 }, (_, i) => ({ id: i + 1 }))),
      },
      salesReasonEntry: {
        findMany: jest.fn().mockImplementation((args: any) => {
          // Consulta de los motivos del periodo (trae kind, reasonLabel y source).
          if (args.select?.reasonLabel) {
            return Promise.resolve([...Array.from({ length: 6 }, () => entradaPerdida('Sin respuesta del cliente')), ...Array.from({ length: 4 }, () => entradaPerdida('Precio'))]);
          }
          // Consulta de qué oportunidades ya tienen motivo: todas menos la 1 y la 2.
          return Promise.resolve(Array.from({ length: 10 }, (_, i) => ({ opportunityId: i + 3 })));
        }),
      },
    };
    servicio = new VentasAnaliticaService(prisma as unknown as PrismaService, {} as never);
  });

  it('las perdidas sin motivo cuentan como «Sin información» y la dona suma lo mismo que las perdidas', async () => {
    const r = await servicio.motivos(1, { userId: 1, role: 'ADMIN', alcance: 'all' });
    const perdidas = r.porCierre.find((c) => c.kind === 'OPP_PERDIDA')!;
    expect(perdidas.total).toBe(12);
    expect(perdidas.items.find((i) => i.label === 'Sin información')?.count).toBe(2);
    expect(perdidas.items.reduce((n, i) => n + i.count, 0)).toBe(12);
    expect(perdidas.sinInformacionPct).toBeCloseTo(16.7, 1);
  });

  it('una perdida con motivo no se cuenta dos veces', async () => {
    prisma.salesOpportunity.findMany.mockResolvedValue(Array.from({ length: 10 }, (_, i) => ({ id: i + 3 })));
    const r = await servicio.motivos(1, { userId: 1, role: 'ADMIN', alcance: 'all' });
    expect(r.porCierre.find((c) => c.kind === 'OPP_PERDIDA')!.total).toBe(10);
  });

  it('un posible cliente descartado sin motivo también cuenta como «Sin información»', async () => {
    prisma.salesOpportunity.findMany.mockResolvedValue([]);
    prisma.salesLead.findMany.mockResolvedValue([{ id: 40, triagedAt: ahora, updatedAt: ahora }]);
    prisma.salesReasonEntry.findMany.mockImplementation((args: any) =>
      Promise.resolve(args.select?.reasonLabel ? [] : []),
    );
    const r = await servicio.motivos(1, { userId: 1, role: 'ADMIN', alcance: 'all' });
    const descartes = r.porCierre.find((c) => c.kind === 'LEAD_DESCARTE')!;
    expect(descartes.total).toBe(1);
    expect(descartes.items).toEqual([{ label: 'Sin información', count: 1, pct: 100 }]);
  });
});
