import type { PrismaService } from '../../prisma/prisma.service';
import { InventarioImportService } from './inventario-import.service';
import type { ArmaImport, ChalecoImport, PlanImportacion } from './inventario-import.util';

/** La carga enlaza al puesto de la aplicación cuando se llama igual, y si no solo guarda el nombre. */
describe('InventarioImportService: enlace con los puestos', () => {
  const arma = (serie: string, puestoNombre: string | null): ArmaImport => ({
    hoja: 'PUBLICOS',
    fila: 1,
    serie,
    clase: 'PISTOLA',
    marca: null,
    calibre: null,
    categoria: 'LETAL',
    municiones: null,
    ciudad: null,
    uso: null,
    estado: puestoNombre ? 'ASIGNADA' : 'DISPONIBLE',
    puestoNombre,
    permisoVence: null,
    notas: null,
    marcadaParaCorregir: false,
  });
  const chaleco = (puestoNombre: string | null, cantidad: number, destino: 'BODEGA' | 'PUESTO' = 'PUESTO'): ChalecoImport => ({
    fila: 1,
    puestoNombre,
    ciudad: null,
    cantidad,
    destino,
    detalle: 'detalle',
  });
  const plan = (): PlanImportacion => ({
    armas: [arma('A-1', 'Distrito Urdaneta'), arma('A-2', 'LOJA'), arma('A-3', null)],
    chalecos: {
      articulo: 'Chaleco nivel IIIA',
      filas: [chaleco('DISTRITO URDANETA', 3), chaleco('LOJA', 2), chaleco(null, 5, 'BODEGA')],
      filasEnCero: 0,
    },
    accesorios: { items: [], sinCantidad: 0 },
    avisos: [],
    errores: [],
  });

  function montar(puestosApp: { id: number; nombre: string }[]) {
    const armasCreadas: Record<string, unknown>[] = [];
    const movimientos: Record<string, unknown>[] = [];
    const tx = {
      invArma: { create: jest.fn((a: { data: Record<string, unknown> }) => { armasCreadas.push(a.data); return Promise.resolve({}); }) },
      invArticulo: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 50 }),
      },
      invMovimiento: {
        createMany: jest.fn((a: { data: Record<string, unknown>[] }) => { movimientos.push(...a.data); return Promise.resolve({}); }),
      },
    };
    const prisma = {
      invArma: { findMany: jest.fn().mockResolvedValue([]) },
      invArticulo: { findFirst: jest.fn().mockResolvedValue(null) },
      cPPuestoServicio: { findMany: jest.fn().mockResolvedValue(puestosApp) },
      $transaction: jest.fn((cb: (t: typeof tx) => Promise<unknown>) => cb(tx)),
    };
    const service = new InventarioImportService(prisma as unknown as PrismaService);
    jest.spyOn(service as unknown as { leerLibro: () => Promise<PlanImportacion> }, 'leerLibro').mockResolvedValue(plan());
    return { service, armasCreadas, movimientos, prisma };
  }
  const actor = { userId: 1, companyId: 1, nombre: 'Leidy' };

  it('la vista previa dice qué puestos existen y cuáles no, y no escribe nada', async () => {
    const { service, prisma } = montar([{ id: 10, nombre: 'Distrito Urdaneta' }]);
    const r = await service.importar(actor, Buffer.from(''), false);
    // «Distrito Urdaneta» (armas) y «DISTRITO URDANETA» (chalecos) son el mismo puesto: cuenta una vez.
    expect(r.puestos).toEqual({ enlazados: ['Distrito Urdaneta'], sinEnlazar: ['LOJA'] });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('al confirmar, enlaza armas y chalecos al puesto que existe y deja el nombre en el resto', async () => {
    const { service, armasCreadas, movimientos } = montar([{ id: 10, nombre: 'Distrito Urdaneta' }]);
    await service.importar(actor, Buffer.from(''), true);

    const a1 = armasCreadas.find((a) => a.serie === 'A-1');
    expect(a1).toMatchObject({ puestoId: 10, puestoNombre: 'Distrito Urdaneta' });
    const a2 = armasCreadas.find((a) => a.serie === 'A-2');
    expect(a2).toMatchObject({ puestoId: null, puestoNombre: 'LOJA' });
    const a3 = armasCreadas.find((a) => a.serie === 'A-3');
    expect(a3).toMatchObject({ puestoId: null, puestoNombre: null });

    const entregas = movimientos.filter((m) => m.tipo === 'ENTREGA');
    expect(entregas).toHaveLength(2);
    expect(entregas.find((m) => m.cantidad === 3)).toMatchObject({ puestoId: 10, puestoNombre: 'Distrito Urdaneta' });
    expect(entregas.find((m) => m.cantidad === 2)).toMatchObject({ puestoId: null, puestoNombre: 'LOJA' });
    // la entrada es por el total y no es de ningún puesto
    expect(movimientos.find((m) => m.tipo === 'ENTRADA')).toMatchObject({ cantidad: 10, puestoId: null, puestoNombre: null });
  });

  it('si el nombre del puesto está repetido en la aplicación, no se enlaza', async () => {
    const { service, armasCreadas } = montar([
      { id: 10, nombre: 'Distrito Urdaneta' },
      { id: 11, nombre: 'DISTRITO URDANETA' },
    ]);
    await service.importar(actor, Buffer.from(''), true);
    expect(armasCreadas.find((a) => a.serie === 'A-1')).toMatchObject({ puestoId: null, puestoNombre: 'Distrito Urdaneta' });
  });
});
