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
      cPContrato: { findFirst: jest.fn().mockResolvedValue({ id: 100 }) },
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
    expect(r[0].equipo).toEqual([{ articuloId: 5, articulo: 'Chaleco nivel IIIA', variante: '', unidad: 'unidad', clase: 'CHALECO', cantidad: 5 }]);
    expect(r[0].totalEquipo).toBe(5);
    expect(r[0]).toMatchObject({ chalecos: 5, municion: 0, otroEquipo: 0 });
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

  it('un contrato que no existe en la empresa da «Contrato no encontrado», no una lista vacía', async () => {
    const { service, prisma } = montar({ delContrato: [], todos: [] });
    prisma.cPContrato.findFirst.mockResolvedValueOnce(null);
    await expect(service.inventarioPorContrato(1, 999)).rejects.toThrow('Contrato no encontrado');
    expect(prisma.cPContrato.findFirst).toHaveBeenCalledWith({ where: { id: 999, companyId: 1 }, select: { id: true } });
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

/** Todos los contratos en una pasada: por contrato, sin enlazar y rastrillo, y la suma cuadra con el inventario. */
describe('InventarioService.inventarioPorContratos', () => {
  const armaBase = {
    companyId: 1,
    clase: 'PISTOLA',
    marca: 'BLOW',
    modelo: null,
    calibre: '9 MM',
    guardiaCedula: null,
    guardiaNombre: null,
    asignadaAt: null,
    permisoNumero: null,
    categoria: 'LETAL',
    municiones: null,
    ciudad: null,
    uso: null,
  };
  const arma = (id: number, estado: string, puestoId: number | null, puestoNombre: string | null, extra: object = {}) => ({
    ...armaBase,
    id,
    serie: `S-${id}`,
    estado,
    puestoId,
    puestoNombre,
    permisoVence: null,
    notas: null,
    ...extra,
  });
  const chaleco = { nombre: 'Chaleco nivel IIIA', variante: '', tipo: 'IMPLEMENTO', unidad: 'unidad' };
  const balas = { nombre: 'MUNICION CAL 38 SPL', variante: 'LETAL', tipo: 'MUNICION', unidad: 'unidad' };
  const mov = (articuloId: number, articulo: typeof chaleco, tipo: string, cantidad: number, puestoId: number | null, puestoNombre: string | null, cedula: string | null = null) => ({
    id: Math.random(),
    companyId: 1,
    articuloId,
    tipo,
    cantidad,
    fecha: new Date('2026-11-01T00:00:00.000Z'),
    puestoId,
    puestoNombre,
    guardiaCedula: cedula,
    guardiaNombre: cedula ? 'Guardia Uno' : null,
    articulo,
  });

  const movsChaleco = [
    mov(5, chaleco, 'ENTRADA', 20, null, null),
    mov(5, chaleco, 'ENTREGA', 4, 10, 'Garita Norte'), // a un puesto enlazado por id
    mov(5, chaleco, 'ENTREGA', 3, null, 'NO EXISTE'), // a un puesto que la aplicación no tiene
    mov(5, chaleco, 'ENTREGA', 2, null, null, '0912345678'), // a un guardia
  ];
  const movsBalas = [mov(6, balas, 'ENTRADA', 50, null, null), mov(6, balas, 'ENTREGA', 10, 20, 'Patio')];

  function montar() {
    const prisma = {
      cPContrato: {
        findMany: jest.fn().mockResolvedValue([
          { id: 100, numero: 'C-100', estado: 'ACTIVO', fechaInicio: new Date('2026-01-01'), fechaFin: new Date('2026-12-31'), entidad: { nombre: 'Ministerio', tipo: 'PUBLICA' } },
          { id: 200, numero: 'C-200', estado: 'ACTIVO', fechaInicio: new Date('2026-01-01'), fechaFin: new Date('2026-12-31'), entidad: { nombre: 'Cliente', tipo: 'PRIVADA' } },
          { id: 300, numero: 'C-300', estado: 'ACTIVO', fechaInicio: new Date('2026-01-01'), fechaFin: new Date('2026-12-31'), entidad: { nombre: 'Vacío', tipo: 'PUBLICA' } },
        ]),
      },
      cPPuestoServicio: {
        findMany: jest.fn().mockResolvedValue([
          { id: 10, nombre: 'Garita Norte', contratoId: 100 },
          { id: 11, nombre: 'CNEL - COLONCHE', contratoId: 100 },
          { id: 20, nombre: 'Patio', contratoId: 200 },
        ]),
      },
      invArma: {
        findMany: jest.fn().mockResolvedValue([
          arma(1, 'ASIGNADA', 10, 'Garita Norte', { permisoVence: new Date('2020-01-01T00:00:00.000Z') }), // permiso vencido
          arma(2, 'ASIGNADA', null, 'CNEL COLONCHE', { notas: 'CORREGIR (leído del Excel): revisar' }), // enlaza por nombre sin guion
          arma(3, 'ASIGNADA', null, 'NO EXISTE'), // sin enlazar
          arma(4, 'DISPONIBLE', null, null), // en el rastrillo
        ]),
      },
      invMovimiento: { findMany: jest.fn().mockResolvedValue([...movsChaleco, ...movsBalas]) },
      invArticulo: {
        findMany: jest.fn().mockResolvedValue([
          { id: 5, ...chaleco, stockMinimo: 0, stockMaximo: null, activo: true, movimientos: movsChaleco },
          { id: 6, ...balas, stockMinimo: 0, stockMaximo: null, activo: true, movimientos: movsBalas },
        ]),
      },
    };
    return { service: new InventarioService(prisma as unknown as PrismaService, {} as never, {} as never), prisma };
  }

  it('reparte armas y equipo por contrato, deja aparte lo sin enlazar y lo del rastrillo', async () => {
    const { service } = montar();
    const r = await service.inventarioPorContratos(1);

    const c100 = r.contratos.find((c) => c.contratoId === 100)!;
    expect(c100).toMatchObject({ numero: 'C-100', entidad: 'Ministerio', tipoEntidad: 'PUBLICA', puestos: 2, armas: 2, armasVencidas: 1, armasPorVencer: 0, armasPorCorregir: 1, chalecos: 4, municion: 0 });
    const c200 = r.contratos.find((c) => c.contratoId === 200)!;
    expect(c200).toMatchObject({ tipoEntidad: 'PRIVADA', puestos: 1, armas: 0, chalecos: 0, municion: 10 });
    // un contrato sin puestos sigue en la lista, con ceros
    expect(r.contratos.find((c) => c.contratoId === 300)).toMatchObject({ puestos: 0, armas: 0, chalecos: 0 });

    // el chaleco entregado a un puesto que no existe y el entregado a un guardia no se pierden
    expect(r.sinEnlazar).toMatchObject({ armas: 1, chalecos: 3 + 2, municion: 0, puestos: ['NO EXISTE'] });
    // 20 recibidos − 9 entregados = 11 en el rastrillo; 50 − 10 = 40 balas
    expect(r.rastrillo).toEqual({ armas: 1, chalecos: 11, municion: 40, otroEquipo: 0 });
  });

  it('la suma de contratos + sin enlazar + rastrillo es lo que hay en total', async () => {
    const { service } = montar();
    const r = await service.inventarioPorContratos(1);
    expect(r.totales).toEqual({ armas: 4, chalecos: 20, municion: 50, otroEquipo: 0 });
  });

  it('lo hace en una sola pasada: cada tabla se consulta una vez', async () => {
    const { service, prisma } = montar();
    await service.inventarioPorContratos(1);
    expect(prisma.cPContrato.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.cPPuestoServicio.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.invArma.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.invMovimiento.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.invArticulo.findMany).toHaveBeenCalledTimes(1);
  });
});
