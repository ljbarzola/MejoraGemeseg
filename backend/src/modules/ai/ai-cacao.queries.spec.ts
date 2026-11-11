import { PrismaService } from '../../prisma/prisma.service';
import type { CacaoConfigService } from '../cacao/config/cacao-config.service';
import { AiCacaoQueries } from './ai-cacao.queries';

// Consultas del Agente de Cacao: siempre filtran por la empresa de quien pregunta, ponen fecha a lo
// que dicen y dicen «no consta»/«ninguna» en vez de inventar.
describe('AiCacaoQueries', () => {
  let prisma: any;
  let config: { get: jest.Mock; montoAprobacionAdmin: jest.Mock };
  let q: AiCacaoQueries;

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2026-11-11T15:00:00.000Z'));
    prisma = {
      cacaoReception: { aggregate: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
      cacaoLot: { aggregate: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
      cacaoSettlement: { aggregate: jest.fn(), groupBy: jest.fn().mockResolvedValue([]), findMany: jest.fn().mockResolvedValue([]) },
      cacaoSettlementLot: { groupBy: jest.fn().mockResolvedValue([]) },
      cacaoPayable: { findMany: jest.fn().mockResolvedValue([]) },
      cacaoSupplier: { findMany: jest.fn().mockResolvedValue([]), findFirst: jest.fn().mockResolvedValue(null) },
      cacaoSupplierAdvance: { groupBy: jest.fn().mockResolvedValue([]) },
      cacaoSupplierDocument: { count: jest.fn().mockResolvedValue(0), groupBy: jest.fn().mockResolvedValue([]) },
      cacaoQuality: { findMany: jest.fn().mockResolvedValue([]) },
      cacaoPunto: { count: jest.fn().mockResolvedValue(0) },
      user: { findMany: jest.fn().mockResolvedValue([]), findUnique: jest.fn().mockResolvedValue({ role: 'MANAGER' }) },
    };
    config = {
      get: jest.fn().mockResolvedValue({
        plazoPagoDias: 30,
        plazoCobroDias: 60,
        precioIce: null,
        pagosRequierenAutorizacion: false,
        montoAprobacionAdmin: null,
      }),
      montoAprobacionAdmin: jest.fn().mockResolvedValue(null),
    };
    q = new AiCacaoQueries(prisma as unknown as PrismaService, config as unknown as CacaoConfigService);
  });

  afterEach(() => jest.useRealTimers());

  const cuenta = (o: Partial<{ id: number; supplierId: number; nombre: string; total: number; pagado: number; vence: string }> = {}) => ({
    id: o.id ?? 1,
    supplierId: o.supplierId ?? 3,
    totalAmount: o.total ?? 1000,
    paidAmount: o.pagado ?? 0,
    // 17:00 UTC = mediodía en Ecuador, el mismo día
    dueDate: new Date(`${o.vence ?? '2026-11-20'}T17:00:00.000Z`),
    supplier: { name: o.nombre ?? 'Juan Pérez' },
  });

  describe('cuentas por pagar', () => {
    it('lista solo las vencidas, con cuántos días llevan vencidas, y la empresa en el filtro', async () => {
      prisma.cacaoPayable.findMany.mockResolvedValue([
        cuenta({ id: 1, nombre: 'Ana Ruiz', total: 800, pagado: 300, vence: '2026-11-01' }),
        cuenta({ id: 2, nombre: 'Luis Mora', vence: '2026-11-25' }),
      ]);
      const r = await q.porPagar(10, 'vencidas');
      expect(prisma.cacaoPayable.findMany.mock.calls[0][0].where).toMatchObject({ companyId: 10 });
      expect(r).toContain('consultados el 11/11/2026');
      expect(r).toContain('Ana Ruiz: saldo $500.00 de $800.00, vence el 01/11/2026 (vencida hace 10 día(s))');
      expect(r).not.toContain('Luis Mora');
    });

    it('las próximas son las que vencen en los siguientes 7 días', async () => {
      prisma.cacaoPayable.findMany.mockResolvedValue([
        cuenta({ nombre: 'Ana Ruiz', vence: '2026-11-15' }),
        cuenta({ nombre: 'Luis Mora', vence: '2026-11-30' }),
      ]);
      const r = await q.porPagar(10, 'próximas');
      expect(r).toContain('Ana Ruiz');
      expect(r).not.toContain('Luis Mora');
    });

    it('sin cuentas dice «ninguna» y no ignora las ya pagadas por completo', async () => {
      prisma.cacaoPayable.findMany.mockResolvedValue([cuenta({ total: 500, pagado: 500, vence: '2026-11-01' })]);
      const r = await q.porPagar(10, 'vencidas');
      expect(r).toContain('ninguna');
    });
  });

  describe('proveedor', () => {
    it('sin nombre pide cuál, sin consultar nada', async () => {
      const r = await q.proveedor(10, undefined);
      expect(r).toContain('Falta el nombre del proveedor');
      expect(prisma.cacaoSupplier.findMany).not.toHaveBeenCalled();
    });

    it('un nombre que no existe en la empresa dice que no hay ninguno (sin tildes ni mayúsculas)', async () => {
      prisma.cacaoSupplier.findMany.mockResolvedValue([{ id: 3, name: 'Juan Pérez', idNumber: '0912345678' }]);
      expect(await q.proveedor(10, 'zzz')).toContain('No hay ningún proveedor');
      expect(await q.proveedor(10, 'juan perez')).not.toContain('No hay ningún proveedor');
      expect(prisma.cacaoSupplier.findMany.mock.calls[0][0].where).toEqual({ companyId: 10 });
    });

    it('si varios coinciden, los nombra y pide que elijan', async () => {
      prisma.cacaoSupplier.findMany.mockResolvedValue([
        { id: 3, name: 'Juan Pérez', idNumber: null },
        { id: 4, name: 'Juan Mora', idNumber: null },
      ]);
      const r = await q.proveedor(10, 'juan');
      expect(r).toContain('2 proveedores');
      expect(r).toContain('Juan Pérez');
      expect(r).toContain('Juan Mora');
    });

    it('arma la deuda, el saldo de anticipos, las últimas liquidaciones y la ficha', async () => {
      prisma.cacaoSupplier.findMany.mockResolvedValue([{ id: 3, name: 'Juan Pérez', idNumber: '0912345678' }]);
      prisma.cacaoSupplier.findFirst.mockResolvedValue({ bank: 'Banco X', bankAccountNumber: null, paymentTerms: null, phone: null, rating: 4 });
      prisma.cacaoPayable.findMany.mockResolvedValue([cuenta({ total: 1200, pagado: 200, vence: '2026-11-05' })]);
      // Anticipado 600, descontado 150 en liquidaciones vigentes: saldo 450.
      prisma.cacaoSupplierAdvance.groupBy.mockResolvedValue([{ supplierId: 3, _sum: { amount: 600 } }]);
      prisma.cacaoSettlement.groupBy.mockResolvedValue([{ supplierId: 3, _sum: { advanceApplied: 150 } }]);
      prisma.cacaoSettlement.findMany.mockResolvedValue([
        { date: new Date('2026-10-30T00:00:00.000Z'), status: 'PENDING', totalAmount: 900, advanceApplied: 0 },
      ]);
      prisma.cacaoReception.findMany.mockResolvedValue([
        { date: new Date('2026-10-28T00:00:00.000Z'), netWeight: 4536, consigned: true, lot: { code: 'LOTE-2026-00007', quality: { name: 'CCN51' } } },
      ]);
      prisma.cacaoSupplierDocument.count.mockResolvedValue(2);
      const r = await q.proveedor(10, 'Juan');
      expect(r).toContain('Se le debe $1,000.00 en 1 cuenta(s)');
      expect(r).toContain('VENCIDA hace 6 día(s)');
      expect(r).toContain('Saldo de anticipos disponible para descontarle: $450.00');
      expect(r).toContain('30/10/2026: Por aprobar, valor del cacao $900.00');
      expect(r).toContain('LOTE-2026-00007');
      expect(r).toContain('en consignación');
      expect(r).toContain('sin cuenta bancaria registrada; 2 documento(s) adjunto(s)');
      // Todo filtrado por la empresa de quien pregunta.
      expect(prisma.cacaoSettlement.findMany.mock.calls[0][0].where).toMatchObject({ companyId: 10, supplierId: 3 });
      expect(prisma.cacaoReception.findMany.mock.calls[0][0].where).toMatchObject({ companyId: 10, supplierId: 3 });
    });
  });

  describe('liquidaciones por aprobar', () => {
    const fila = (o: Record<string, unknown>) => ({
      id: 1,
      supplier: { name: 'Ana Ruiz' },
      status: 'PENDING',
      totalAmount: 5000,
      advanceApplied: 0,
      totalNetWeight: 4536,
      createdBy: 20,
      createdAt: new Date('2026-11-08T17:00:00.000Z'),
      decidedAt: null,
      decisionReason: null,
      ...o,
    });

    it('dice quién la creó, cuánto espera y si supera el monto de administrador', async () => {
      config.montoAprobacionAdmin.mockResolvedValue(3000);
      prisma.cacaoSettlement.findMany.mockResolvedValue([fila({})]);
      prisma.user.findMany.mockResolvedValue([{ id: 20, fullName: 'Marta Gómez' }]);
      const r = await q.liquidaciones(10, 1, undefined);
      expect(prisma.cacaoSettlement.findMany.mock.calls[0][0].where).toEqual({ companyId: 10, status: 'PENDING' });
      expect(r).toContain('Ana Ruiz: $5,000.00');
      expect(r).toContain('creada el 08/11/2026 (hace 3 día(s))');
      expect(r).toContain('la creó Marta Gómez');
      expect(r).toContain('supera el monto de administrador');
      expect(r).toContain('$3,000.00');
    });

    it('si la creó quien pregunta, avisa que la debe aprobar otra persona', async () => {
      prisma.cacaoSettlement.findMany.mockResolvedValue([fila({ createdBy: 1 })]);
      prisma.user.findMany.mockResolvedValue([{ id: 1, fullName: 'Yo' }]);
      const r = await q.liquidaciones(10, 1, 'por_aprobar');
      expect(r).toContain('la creó quien pregunta: la debe aprobar otra persona');
      expect(r).toContain('no está configurado (un gerente puede aprobar cualquiera)');
    });

    it('ninguna pendiente → lo dice', async () => {
      const r = await q.liquidaciones(10, 1, undefined);
      expect(r).toContain('«Por aprobar»: ninguna');
    });

    it('una rechazada muestra cuándo y por qué', async () => {
      prisma.cacaoSettlement.findMany.mockResolvedValue([
        fila({ status: 'REJECTED', decidedAt: new Date('2026-11-09T18:00:00.000Z'), decisionReason: 'Peso mal digitado' }),
      ]);
      const r = await q.liquidaciones(10, 1, 'rechazada');
      expect(prisma.cacaoSettlement.findMany.mock.calls[0][0].where).toEqual({ companyId: 10, status: 'REJECTED' });
      expect(r).toContain('decidida el 09/11/2026');
      expect(r).toContain('motivo: Peso mal digitado');
    });
  });

  describe('resumen', () => {
    it('junta recepciones, lotes, liquidaciones por aprobar, cuentas y anticipos de la empresa', async () => {
      prisma.cacaoReception.aggregate.mockResolvedValue({ _count: { id: 5 }, _sum: { netWeight: 9072 } });
      prisma.cacaoLot.aggregate.mockResolvedValue({ _count: { id: 3 }, _sum: { netWeight: 4536 } });
      prisma.cacaoSettlement.aggregate.mockResolvedValue({ _count: { id: 2 }, _sum: { totalAmount: 7000 } });
      prisma.cacaoPayable.findMany.mockResolvedValue([
        cuenta({ total: 1000, pagado: 0, vence: '2026-11-01' }),
        cuenta({ total: 500, pagado: 100, vence: '2026-12-01' }),
      ]);
      prisma.cacaoSupplierAdvance.groupBy.mockResolvedValue([{ supplierId: 3, _sum: { amount: 250 } }]);
      const r = await q.resumen(10);
      expect(r).toContain('últimos 30 días (desde 13/10/2026): 5');
      expect(r).toContain('Lotes abiertos hoy: 3');
      expect(r).toContain('Liquidaciones por aprobar: 2 por $7,000.00');
      expect(r).toContain('2, por $1,400.00 en total; vencidas: 1 por $1,000.00');
      expect(r).toContain('Anticipos a proveedores sin descontar: $250.00');
      expect(prisma.cacaoReception.aggregate.mock.calls[0][0].where).toMatchObject({ companyId: 10, voidedAt: null });
      expect(prisma.cacaoLot.aggregate.mock.calls[0][0].where).toMatchObject({ companyId: 10, status: 'OPEN' });
    });
  });

  describe('anticipos y proveedores incompletos', () => {
    it('lista solo a los proveedores con saldo a favor, del mayor al menor', async () => {
      prisma.cacaoSupplierAdvance.groupBy
        .mockResolvedValueOnce([
          { supplierId: 3, _sum: { amount: 600 } },
          { supplierId: 4, _sum: { amount: 100 } },
          { supplierId: 5, _sum: { amount: 50 } },
        ])
        .mockResolvedValueOnce([{ supplierId: 3, _max: { date: new Date('2026-11-02T00:00:00.000Z') } }]);
      prisma.cacaoSettlement.groupBy.mockResolvedValue([{ supplierId: 5, _sum: { advanceApplied: 50 } }]);
      prisma.cacaoSupplier.findMany.mockResolvedValue([
        { id: 3, name: 'Juan Pérez' },
        { id: 4, name: 'Ana Ruiz' },
      ]);
      const r = await q.anticipos(10);
      expect(r).toContain('2, por $700.00');
      expect(r.indexOf('Juan Pérez')).toBeLessThan(r.indexOf('Ana Ruiz'));
      expect(r).toContain('último anticipo el 02/11/2026');
    });

    it('señala los proveedores sin cuenta bancaria o sin documentos', async () => {
      prisma.cacaoSupplier.findMany.mockResolvedValue([
        { id: 1, name: 'Completo', bankAccountNumber: '123' },
        { id: 2, name: 'Sin cuenta', bankAccountNumber: null },
        { id: 3, name: 'Sin nada', bankAccountNumber: '' },
      ]);
      prisma.cacaoSupplierDocument.groupBy.mockResolvedValue([{ supplierId: 1, _count: { id: 1 } }, { supplierId: 2, _count: { id: 2 } }]);
      const r = await q.proveedoresIncompletos(10);
      expect(r).toContain('Proveedores registrados: 3. Sin cuenta bancaria: 2. Sin documentos adjuntos: 1.');
      expect(r).toContain('- Sin cuenta: sin cuenta bancaria.');
      expect(r).toContain('- Sin nada: sin cuenta bancaria y sin documentos.');
      expect(r).not.toContain('Completo:');
    });
  });

  describe('precios', () => {
    it('promedia por calidad a costo de lote y muestra su rango esperado', async () => {
      prisma.cacaoReception.findMany.mockResolvedValue([
        {
          date: new Date('2026-11-03T00:00:00.000Z'),
          supplierId: 3,
          supplier: { name: 'Juan Pérez' },
          netWeight: 1000,
          provisionalPrice: 2,
          closedAt: null,
          lot: { averageCost: 3, quality: { name: 'CCN51' } },
        },
      ]);
      prisma.cacaoQuality.findMany.mockResolvedValue([{ name: 'CCN51', minPrice: 2.5, maxPrice: 3.5 }]);
      const r = await q.precios(10, 'mes');
      expect(r).toContain('CCN51: $136.08 por quintal ($3.00/kg)');
      expect(r).toContain('rango esperado $2.50 a $3.50 por kg');
      expect(prisma.cacaoQuality.findMany.mock.calls[0][0].where).toEqual({ companyId: 10 });
    });

    it('sin recepciones en el periodo no inventa un precio', async () => {
      const r = await q.precios(10, 'mes');
      expect(r).toContain('no hay precio que promediar');
    });
  });

  describe('reglas', () => {
    it('explica el monto de administrador, la autorización de pagos y el rol de quien pregunta', async () => {
      config.get.mockResolvedValue({
        plazoPagoDias: 15,
        plazoCobroDias: 45,
        precioIce: 8200,
        pagosRequierenAutorizacion: true,
        montoAprobacionAdmin: 3000,
      });
      prisma.cacaoPunto.count.mockResolvedValue(2);
      const r = await q.reglas(10, 1);
      expect(r).toContain('Quien pregunta es gerente');
      expect(r).toContain('superan $3,000.00 solo las aprueba un administrador');
      expect(r).toContain('necesitan autorización');
      expect(r).toContain('15 días');
      expect(r).toContain('$8,200.00 por tonelada');
      expect(r).toContain('Puntos de acopio activos: 2');
    });

    it('sin precio ICE ni monto configurado lo dice', async () => {
      const r = await q.reglas(10, 1);
      expect(r).toContain('no hay monto configurado para administrador');
      expect(r).toContain('Precio ICE de referencia: sin configurar');
    });
  });

  describe('recepciones y lotes', () => {
    it('lista las recepciones del periodo con su estado de liquidación', async () => {
      prisma.cacaoReception.findMany.mockResolvedValue([
        {
          date: new Date('2026-11-09T00:00:00.000Z'),
          supplier: { name: 'Juan Pérez' },
          netWeight: 907.18,
          provisionalPrice: 2.8,
          lotId: 7,
          closedAt: null,
          consigned: false,
          lot: { code: 'LOTE-2026-00007', quality: { name: 'CCN51' } },
        },
      ]);
      prisma.cacaoSettlementLot.groupBy.mockResolvedValue([{ lotId: 7, _sum: { quantity: 907.18 } }]);
      const r = await q.recepciones(10, 'mes');
      expect(r).toContain('09/11/2026 · Juan Pérez');
      expect(r).toContain('liquidada');
      expect(prisma.cacaoReception.findMany.mock.calls[0][0].where).toMatchObject({ companyId: 10, voidedAt: null });
    });

    it('lotes abiertos con peso y costo; sin lotes lo dice', async () => {
      expect(await q.lotes(10, undefined)).toContain('ninguno');
      prisma.cacaoLot.findMany.mockResolvedValue([
        { code: 'LOTE-2026-00001', netWeight: 1000, averageCost: 3, createdAt: new Date('2026-11-01T17:00:00.000Z'), dryWeight: null, quality: { name: 'CCN51' } },
      ]);
      const r = await q.lotes(10, 'abiertos');
      expect(prisma.cacaoLot.findMany.mock.calls[1][0].where).toEqual({ companyId: 10, status: 'OPEN' });
      expect(r).toContain('LOTE-2026-00001 · CCN51');
      expect(r).toContain('valor de inventario de $3,000.00');
    });
  });
});
