import type { PrismaService } from '../../prisma/prisma.service';
import { InventarioService } from './inventario.service';

/** Armas y equipo por puesto de un contrato: enlazado por `puestoId` o por nombre único. */
describe('InventarioService.inventarioPorContrato', () => {
  const arma = (id: number, serie: string, puestoId: number | null, puestoNombre: string | null) => ({
    id,
    companyId: 1,
    serie,
    clase: 'PISTOLA',
    marca: 'BLOW',
    modelo: null,
    calibre: '9 MM',
    estado: 'ASIGNADA',
    puestoId,
    puestoNombre,
    guardiaCedula: null,
    guardiaNombre: null,
    asignadaAt: null,
    permisoNumero: null,
    permisoVence: null,
    notas: null,
    categoria: 'LETAL',
    municiones: 12,
    ciudad: null,
    uso: null,
  });
  const mov = (articuloId: number, tipo: string, cantidad: number, puestoId: number | null, puestoNombre: string | null) => ({
    id: Math.random(),
    companyId: 1,
    articuloId,
    tipo,
    cantidad,
    fecha: new Date('2026-11-01T00:00:00.000Z'),
    puestoId,
    puestoNombre,
    guardiaCedula: null,
    guardiaNombre: null,
    articulo: { nombre: 'Chaleco nivel IIIA', variante: '', tipo: 'IMPLEMENTO', unidad: 'unidad' },
  });

  function montar(opts: { delContrato: { id: number; nombre: string }[]; todos: { id: number; nombre: string }[] }) {
    const findPuestos = jest
      .fn()
      .mockResolvedValueOnce(opts.delContrato) // los del contrato
      .mockResolvedValueOnce(opts.todos); // todos los de la empresa (para el nombre único)
    const prisma = {
      cPPuestoServicio: { findMany: findPuestos },
      invArma: {
        findMany: jest.fn().mockResolvedValue([
          arma(1, 'S-1', 10, 'Garita Norte'), // enlazada por id
          arma(2, 'S-2', null, 'GARITA NORTE'), // cargada solo con el nombre
          arma(3, 'S-3', null, 'OTRO PUESTO'), // de un puesto de otro contrato
        ]),
      },
      invMovimiento: {
        findMany: jest.fn().mockResolvedValue([
          mov(5, 'ENTREGA', 4, 10, 'Garita Norte'),
          mov(5, 'ENTREGA', 2, null, 'GARITA NORTE'),
          mov(5, 'DEVOLUCION', 1, null, 'GARITA NORTE'),
          mov(5, 'ENTREGA', 9, null, 'OTRO PUESTO'),
        ]),
      },
    };
    const service = new InventarioService(prisma as unknown as PrismaService, {} as never, {} as never);
    return { service, prisma };
  }

  it('suma por puesto lo enlazado por id y lo cargado solo con el nombre', async () => {
    const { service } = montar({
      delContrato: [{ id: 10, nombre: 'Garita Norte' }],
      todos: [
        { id: 10, nombre: 'Garita Norte' },
        { id: 20, nombre: 'Otro puesto' },
      ],
    });
    const r = await service.inventarioPorContrato(1, 100);
    expect(r).toHaveLength(1);
    expect(r[0].puestoId).toBe(10);
    expect(r[0].armas.map((a) => a.serie)).toEqual(['S-1', 'S-2']);
    expect(r[0].totalArmas).toBe(2);
    // 4 por id + (2 - 1) por nombre = 5; lo del otro puesto no entra
    expect(r[0].equipo).toEqual([{ articuloId: 5, articulo: 'Chaleco nivel IIIA', variante: '', unidad: 'unidad', cantidad: 5 }]);
    expect(r[0].totalEquipo).toBe(5);
  });

  it('un nombre repetido en la empresa no se adivina: solo cuenta lo enlazado por id', async () => {
    const { service } = montar({
      delContrato: [{ id: 10, nombre: 'Garita Norte' }],
      todos: [
        { id: 10, nombre: 'Garita Norte' },
        { id: 11, nombre: 'GARITA NORTE' }, // otro contrato, mismo nombre
      ],
    });
    const r = await service.inventarioPorContrato(1, 100);
    expect(r[0].armas.map((a) => a.serie)).toEqual(['S-1']);
    expect(r[0].totalEquipo).toBe(4);
  });

  it('un contrato sin puestos devuelve vacío y no consulta el inventario', async () => {
    const { service, prisma } = montar({ delContrato: [], todos: [] });
    expect(await service.inventarioPorContrato(1, 100)).toEqual([]);
    expect(prisma.invArma.findMany).not.toHaveBeenCalled();
    expect(prisma.invMovimiento.findMany).not.toHaveBeenCalled();
  });

  it('un puesto sin nada asignado sale con ceros', async () => {
    const { service } = montar({
      delContrato: [{ id: 30, nombre: 'Patio' }],
      todos: [{ id: 30, nombre: 'Patio' }],
    });
    const r = await service.inventarioPorContrato(1, 100);
    expect(r[0]).toMatchObject({ puestoId: 30, totalArmas: 0, totalEquipo: 0, armas: [], equipo: [] });
  });
});
