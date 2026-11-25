import { compararDotacion, estadoDeDotacion, mismoArticulo, type InventarioPuesto } from './bitacora-dotacion.util';
import type { LecturaDotacion } from './bitacora.util';

const g = (articulo: string, cantidad: number | null, ambito: LecturaDotacion['ambito'] = 'GEMESEG'): LecturaDotacion => ({
  ambito,
  articulo,
  cantidad,
  detalle: null,
});

const inv = (parcial: Partial<InventarioPuesto> = {}): InventarioPuesto => ({ armas: 0, chalecos: 0, equipo: [], ...parcial });

// Lo ya clasificado en la lista del puesto.
const base = [
  { ambito: 'GEMESEG', articulo: 'Radios', cantidad: 2 },
  { ambito: 'GEMESEG', articulo: 'Linterna', cantidad: 3 },
  { ambito: 'CLIENTE', articulo: 'Tachos de basura', cantidad: 2 },
];

describe('mismoArticulo', () => {
  it('junta singular y plural, tildes y mayúsculas', () => {
    expect(mismoArticulo('Tachos de basura', 'tacho de BASURA.')).toBe(true);
    expect(mismoArticulo('Radio', 'radios')).toBe(true);
  });
  it('reconoce el nombre corto dentro del largo, pero no artículos distintos', () => {
    expect(mismoArticulo('Radios', 'Radio portátil Motorola')).toBe(true);
    expect(mismoArticulo('Radio', 'Linterna')).toBe(false);
    expect(mismoArticulo('Chaleco antibalas', 'Radio portátil')).toBe(false);
  });
  it('un texto vacío no es igual a nada', () => {
    expect(mismoArticulo('', 'Radio')).toBe(false);
  });
});

describe('estadoDeDotacion', () => {
  it('lo de la lista del puesto es conocido; lo que no está en ningún lado es nuevo', () => {
    const e = estadoDeDotacion([{ articulo: 'Radio' }, { articulo: 'Tablero' }], base, null);
    expect(e).toEqual(['CONOCIDO', 'NUEVO']);
  });
  it('lo que Inventario tiene asignado al puesto también es conocido', () => {
    const e = estadoDeDotacion(
      [{ articulo: 'Pistola 9mm' }, { articulo: 'Chalecos' }, { articulo: 'Radio portátil' }, { articulo: 'Tablero' }],
      [],
      inv({ armas: 1, chalecos: 2, equipo: [{ articulo: 'Radio portátil Motorola', cantidad: 2 }] }),
    );
    expect(e).toEqual(['CONOCIDO', 'CONOCIDO', 'CONOCIDO', 'NUEVO']);
  });
  it('un arma de la hoja es nueva si Inventario no tiene armas asignadas al puesto ni está en la lista', () => {
    expect(estadoDeDotacion([{ articulo: 'Pistola' }], [], inv())).toEqual(['NUEVO']);
  });
});

describe('compararDotacion contra la dotación registrada del puesto', () => {
  it('no avisa nada cuando la hoja coincide', () => {
    const r = compararDotacion({
      base,
      actual: [g('RADIO', 2), g('linternas', 3), g('Tacho de basura', 2, 'CLIENTE')],
      fecha: '2026-11-25',
    });
    expect(r).toEqual([]);
  });

  it('avisa lo que falta, lo que hay de menos, de más y lo nuevo', () => {
    const r = compararDotacion({ base, actual: [g('Radios', 1), g('Linterna', 5), g('Gas', 1)], fecha: '2026-11-25' });
    const m = r.map((h) => h.mensaje);
    expect(m.some((x) => x.includes('Hay menos «Radios»') && x.includes('la hoja dice 1') && x.includes('registrado 2'))).toBe(true);
    expect(m.some((x) => x.includes('Hay más «Linterna»'))).toBe(true);
    expect(m.some((x) => x.includes('Falta «Tachos de basura» (del cliente o la entidad)'))).toBe(true);
    expect(m.some((x) => x.includes('«Gas» no está en la dotación registrada'))).toBe(true);
    expect(r.filter((h) => h.tipo === 'DOTACION_NUEVO')).toHaveLength(1);
  });

  it('un artículo nuevo es MEDIA y pide decir si es de Gemeseg o del cliente o la entidad', () => {
    const r = compararDotacion({ base, actual: [g('Radios', 2), g('Linterna', 3), g('Tablero', 1)], fecha: null });
    const nuevo = r.find((h) => h.tipo === 'DOTACION_NUEVO')!;
    expect(nuevo.severidad).toBe('MEDIA');
    expect(nuevo.mensaje).toContain('Gemeseg o del cliente o la entidad');
  });

  it('falta o menos de Gemeseg es MEDIA; lo del cliente y lo de más son BAJA; nunca ALTA', () => {
    const r = compararDotacion({ base, actual: [g('Radios', 1), g('Linterna', 5)], fecha: null });
    const por = (txt: string) => r.find((h) => h.mensaje.includes(txt))!;
    expect(por('Hay menos «Radios»').severidad).toBe('MEDIA');
    expect(por('Hay más «Linterna»').severidad).toBe('BAJA');
    expect(por('Falta «Tachos de basura»').severidad).toBe('BAJA');
    expect(r.some((h) => h.severidad === 'ALTA')).toBe(false);
  });

  it('una cantidad que no se leyó no genera aviso de cantidad, pero un artículo ausente sí', () => {
    const r = compararDotacion({ base, actual: [g('Radios', null), g('Linterna', 3)], fecha: null });
    expect(r.map((h) => h.mensaje).join(' ')).not.toContain('Radios');
    expect(r.some((h) => h.mensaje.includes('Tachos de basura'))).toBe(true);
  });

  it('la clave es estable para recordar lo que la persona ya resolvió', () => {
    const a = compararDotacion({ base, actual: [g('Radios', 1), g('Linterna', 3), g('Tablero', 1)], fecha: '2026-11-25' });
    const b = compararDotacion({ base, actual: [g('RADIO', 1), g('Linterna', 3), g('tablero', 1)], fecha: '2026-12-01' });
    expect(a.map((h) => h.clave)).toEqual(b.map((h) => h.clave));
  });

  it('sin lista del puesto ni Inventario, todo lo de la hoja es nuevo (hay que decir de quién es)', () => {
    const r = compararDotacion({ base: [], actual: [g('Radios', 2)], fecha: null });
    expect(r.map((h) => h.tipo)).toEqual(['DOTACION_NUEVO']);
  });

  it('con la hoja vacía no se inventa nada', () => {
    expect(compararDotacion({ base: [], actual: [], fecha: null })).toEqual([]);
  });
});

describe('compararDotacion contra Inventario', () => {
  it('avisa si la hoja dice otras armas o chalecos que los de Inventario', () => {
    const r = compararDotacion({
      base: [],
      actual: [g('Pistola 9mm', 1), g('Chalecos antibalas', 2)],
      inventario: inv({ armas: 2, chalecos: 3 }),
      fecha: null,
    });
    const inventario = r.filter((h) => h.tipo === 'DOTACION_INVENTARIO');
    expect(inventario).toHaveLength(2);
    expect(inventario.map((h) => h.mensaje).join(' ')).toContain('1 arma');
    expect(inventario.map((h) => h.mensaje).join(' ')).toContain('Inventario tiene 3 chalecos');
    // Lo que Inventario ya tiene no se marca como nuevo.
    expect(r.some((h) => h.tipo === 'DOTACION_NUEVO')).toBe(false);
  });

  it('avisa también si la hoja no menciona armas y Inventario sí tiene asignadas', () => {
    const r = compararDotacion({ base: [], actual: [g('Radios', 1)], inventario: inv({ armas: 1 }), fecha: null });
    expect(r.find((h) => h.tipo === 'DOTACION_INVENTARIO')!.mensaje).toContain('0 armas');
  });

  it('compara el resto del equipo de Inventario artículo por artículo', () => {
    const r = compararDotacion({
      base: [],
      actual: [g('Radios', 1)],
      inventario: inv({ equipo: [{ articulo: 'Radio portátil', cantidad: 2 }] }),
      fecha: null,
    });
    expect(r).toHaveLength(1);
    expect(r[0].tipo).toBe('DOTACION_INVENTARIO');
    expect(r[0].mensaje).toContain('dice 1');
    expect(r[0].mensaje).toContain('Inventario tiene 2');
  });

  it('si Inventario no tiene nada asignado al puesto no avisa por armas (lo más probable es que no esté enlazado)', () => {
    const r = compararDotacion({ base: [{ ambito: 'GEMESEG', articulo: 'Pistola', cantidad: 2 }], actual: [g('Pistola', 2)], inventario: inv(), fecha: null });
    expect(r).toEqual([]);
  });

  it('si no se pudo consultar Inventario (null) no compara con él', () => {
    const r = compararDotacion({ base: [{ ambito: 'GEMESEG', articulo: 'Pistola', cantidad: 2 }], actual: [g('Pistola', 2)], inventario: null, fecha: null });
    expect(r).toEqual([]);
  });

  it('«alarma» no cuenta como arma', () => {
    const r = compararDotacion({ base: [], actual: [g('Alarma', 1)], inventario: inv({ armas: 1 }), fecha: null });
    expect(r.find((h) => h.tipo === 'DOTACION_INVENTARIO')!.mensaje).toContain('0 armas');
  });
});
