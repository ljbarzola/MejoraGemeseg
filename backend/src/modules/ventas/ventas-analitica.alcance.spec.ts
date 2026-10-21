import { PrismaService } from '../../prisma/prisma.service';
import { VentasAnaliticaService } from './ventas-analitica.service';

// «Mis clientes» en el Dashboard (Cartera, Retención, Motivos y las listas a las que lleva) = las empresas o
// personas donde llevo una OPORTUNIDAD, más las que aún traen mi nombre del sistema anterior. Antes solo
// contaba el responsable de la empresa y un vendedor veía su cartera casi vacía (2026-10-21).
describe('VentasAnaliticaService.clientesDelAlcance', () => {
  let prisma: any;
  let servicio: VentasAnaliticaService;

  beforeEach(() => {
    prisma = { salesClient: { findMany: jest.fn().mockResolvedValue([{ id: 3 }, { id: 9 }]) } };
    servicio = new VentasAnaliticaService(prisma as unknown as PrismaService, {} as never);
  });

  it('un vendedor (EMPLOYEE) ve las empresas donde lleva una oportunidad o que traen su nombre', async () => {
    const r = await servicio.clientesDelAlcance(1, { userId: 7, role: 'EMPLOYEE' });
    expect(r.ids).toEqual([3, 9]);
    expect(prisma.salesClient.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { companyId: 1, OR: [{ assignedUserId: 7 }, { opportunities: { some: { assignedUserId: 7 } } }] },
      }),
    );
  });

  it('un vendedor no puede pedir toda la empresa ni a otro: siempre ve lo suyo', async () => {
    await servicio.clientesDelAlcance(1, { userId: 7, role: 'EMPLOYEE', alcance: 'all' });
    await servicio.clientesDelAlcance(1, { userId: 7, role: 'EMPLOYEE', alcance: '8' });
    for (const llamada of prisma.salesClient.findMany.mock.calls) {
      expect(llamada[0].where.OR[0]).toEqual({ assignedUserId: 7 });
    }
  });

  it('el administrador con «toda la empresa» no tiene límite (ids = null) y con un vendedor elegido ve el de ese vendedor', async () => {
    expect((await servicio.clientesDelAlcance(1, { userId: 1, role: 'ADMIN', alcance: 'all' })).ids).toBeNull();
    expect(prisma.salesClient.findMany).not.toHaveBeenCalled();
    await servicio.clientesDelAlcance(1, { userId: 1, role: 'ADMIN', alcance: '8' });
    expect(prisma.salesClient.findMany.mock.calls[0][0].where.OR[0]).toEqual({ assignedUserId: 8 });
  });
});
