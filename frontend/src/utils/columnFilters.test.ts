import { describe, expect, it } from 'vitest';
import {
  VACIO,
  aplicarFiltros,
  chipsDeFiltros,
  filtroActivo,
  filtroDeFecha,
  filtroDeValores,
  listaDeUrl,
  numeroDeTexto,
  opcionesDeValores,
  textoFecha,
  tramoEnRango,
  type ColumnaFiltro,
  type FiltrosColumna,
} from './columnFilters';
import { FILTRO_FECHA_VACIO } from './rangoFechas';
import { filtrosDeUrlClientes, filtrosDeUrlContratos, filtrosDeUrlLeads } from './ventasFiltrosUrl';

interface Fila {
  id: number;
  estado: string | null;
  servicios: { id: number; name: string }[];
  nombre: string;
  monto: number | null;
  creado: string; // ISO con hora
  inicio: string; // solo día
}

const FILAS: Fila[] = [
  { id: 1, estado: 'NUEVO', servicios: [{ id: 1, name: 'Alarmas' }], nombre: 'Compañía Ñandú', monto: 100, creado: '2026-10-05T15:00:00Z', inicio: '2026-10-05' },
  { id: 2, estado: 'NUEVO', servicios: [{ id: 1, name: 'Alarmas' }, { id: 2, name: 'Custodia' }], nombre: 'Acme', monto: 250.5, creado: '2026-10-20T03:00:00Z', inicio: '2026-10-20' },
  { id: 3, estado: 'GANADO', servicios: [], nombre: 'Zeta', monto: null, creado: '2026-09-30T12:00:00Z', inicio: '2026-09-30' },
  { id: 4, estado: null, servicios: [{ id: 2, name: 'Custodia' }], nombre: 'Beta', monto: 40, creado: '2026-10-10T12:00:00Z', inicio: '2026-10-10' },
];

const ETIQUETA: Record<string, string> = { NUEVO: 'Sin procesar', GANADO: 'Ganado' };

const COLUMNAS: ColumnaFiltro<Fila>[] = [
  {
    key: 'estado', etiqueta: 'Estado', tipo: 'valores', vacio: 'Sin estado', orden: ['NUEVO', 'GANADO'],
    getValues: (f) => (f.estado ? { valor: f.estado, etiqueta: ETIQUETA[f.estado] } : null),
  },
  {
    key: 'servicios', etiqueta: 'Servicios', tipo: 'valores',
    getValues: (f) => f.servicios.map((s) => ({ valor: String(s.id), etiqueta: s.name })),
  },
  { key: 'nombre', etiqueta: 'Nombre', tipo: 'texto', getValue: (f) => f.nombre },
  { key: 'monto', etiqueta: 'Monto', tipo: 'numero', getValue: (f) => f.monto },
  { key: 'creado', etiqueta: 'Creado', tipo: 'fecha', getValue: (f) => f.creado },
  { key: 'inicio', etiqueta: 'Inicia', tipo: 'fecha', soloDia: true, getValue: (f) => f.inicio },
];

const ids = (fs: Fila[]) => fs.map((f) => f.id);
const filtrar = (filtros: FiltrosColumna) => ids(aplicarFiltros(FILAS, COLUMNAS, filtros));

describe('filtro de valores', () => {
  it('sin filtros deja pasar todo', () => {
    expect(filtrar({})).toEqual([1, 2, 3, 4]);
  });

  it('muestra solo los valores elegidos', () => {
    expect(filtrar({ estado: filtroDeValores(['NUEVO']) })).toEqual([1, 2]);
    expect(filtrar({ estado: filtroDeValores(['NUEVO', 'GANADO']) })).toEqual([1, 2, 3]);
  });

  it('las filas sin dato se eligen con el valor VACIO', () => {
    expect(filtrar({ estado: filtroDeValores([VACIO]) })).toEqual([4]);
    expect(filtrar({ servicios: filtroDeValores([VACIO]) })).toEqual([3]);
  });

  it('una lista vacía no muestra nada (y cuenta como filtro activo)', () => {
    expect(filtroActivo(filtroDeValores([]))).toBe(true);
    expect(filtrar({ estado: filtroDeValores([]) })).toEqual([]);
  });

  it('una fila con varios valores sale si cumple cualquiera', () => {
    expect(filtrar({ servicios: filtroDeValores(['2']) })).toEqual([2, 4]);
  });

  it('los filtros de varias columnas se suman (Y)', () => {
    expect(filtrar({ estado: filtroDeValores(['NUEVO']), servicios: filtroDeValores(['2']) })).toEqual([2]);
  });

  it('un filtro de otro tipo que la columna se ignora', () => {
    expect(filtrar({ estado: { tipo: 'texto', texto: 'x' } })).toEqual([1, 2, 3, 4]);
  });
});

describe('opciones de una columna de valores', () => {
  it('cuenta por valor, en el orden pedido y con «vacío» al final', () => {
    const o = opcionesDeValores(FILAS, COLUMNAS, {}, 'estado');
    expect(o.map((x) => [x.valor, x.etiqueta, x.conteo])).toEqual([
      ['NUEVO', 'Sin procesar', 2],
      ['GANADO', 'Ganado', 1],
      [VACIO, 'Sin estado', 1],
    ]);
  });

  it('el conteo respeta los filtros de las OTRAS columnas, no el propio', () => {
    const filtros: FiltrosColumna = { estado: filtroDeValores(['GANADO']), servicios: filtroDeValores(['2']) };
    const o = opcionesDeValores(FILAS, COLUMNAS, filtros, 'estado');
    // Con servicio Custodia hay una fila NUEVO (id 2) y una sin estado (id 4); la de GANADO no tiene Custodia.
    expect(o.map((x) => [x.valor, x.conteo])).toEqual([['NUEVO', 1], ['GANADO', 0], [VACIO, 1]]);
  });

  it('lista con 0 los valores elegidos que hoy no aparecen, para poder quitarlos', () => {
    const o = opcionesDeValores(FILAS, COLUMNAS, { estado: filtroDeValores(['PERDIDO']) }, 'estado');
    expect(o.find((x) => x.valor === 'PERDIDO')).toEqual({ valor: 'PERDIDO', etiqueta: 'PERDIDO', conteo: 0 });
  });

  it('de una columna que no es de valores no hay opciones', () => {
    expect(opcionesDeValores(FILAS, COLUMNAS, {}, 'nombre')).toEqual([]);
  });
});

describe('filtro de texto', () => {
  it('contiene, sin distinguir mayúsculas ni tildes', () => {
    expect(filtrar({ nombre: { tipo: 'texto', texto: 'compania' } })).toEqual([1]);
    expect(filtrar({ nombre: { tipo: 'texto', texto: 'ÑANDU' } })).toEqual([1]);
    expect(filtrar({ nombre: { tipo: 'texto', texto: '  ' } })).toEqual([1, 2, 3, 4]);
  });
});

describe('filtro numérico', () => {
  it('mínimo, máximo y ambos; las filas sin número salen del filtro', () => {
    expect(filtrar({ monto: { tipo: 'numero', min: '100', max: '' } })).toEqual([1, 2]);
    expect(filtrar({ monto: { tipo: 'numero', min: '', max: '100' } })).toEqual([1, 4]);
    expect(filtrar({ monto: { tipo: 'numero', min: '50', max: '200,5' } })).toEqual([1]);
    expect(filtrar({ monto: { tipo: 'numero', min: '', max: '' } })).toEqual([1, 2, 3, 4]);
  });

  it('entiende la coma decimal y rechaza lo que no es número', () => {
    expect(numeroDeTexto('12,5')).toBe(12.5);
    expect(numeroDeTexto('abc')).toBeNull();
    expect(numeroDeTexto(' ')).toBeNull();
  });
});

describe('filtro de fecha', () => {
  it('compara por el día de Ecuador (UTC-5)', () => {
    // 2026-10-20T03:00Z es el 19 de octubre en Guayaquil.
    const f = { atajo: 'personalizado' as const, desde: '2026-10-19', hasta: '2026-10-19' };
    expect(filtrar({ creado: filtroDeFecha(f) })).toEqual([2]);
  });

  it('con soloDia no corre el día por la zona horaria', () => {
    const f = { atajo: 'personalizado' as const, desde: '2026-10-20', hasta: '2026-10-20' };
    expect(filtrar({ inicio: filtroDeFecha(f) })).toEqual([2]);
  });

  it('solo desde o solo hasta', () => {
    expect(filtrar({ inicio: filtroDeFecha({ atajo: 'personalizado', desde: '2026-10-10', hasta: '' }) })).toEqual([2, 4]);
    expect(filtrar({ inicio: filtroDeFecha({ atajo: 'personalizado', desde: '', hasta: '2026-10-05' }) })).toEqual([1, 3]);
  });

  it('un filtro sin fechas no limita', () => {
    expect(filtroActivo(filtroDeFecha(FILTRO_FECHA_VACIO))).toBe(false);
    expect(filtrar({ inicio: filtroDeFecha(FILTRO_FECHA_VACIO) })).toEqual([1, 2, 3, 4]);
  });
});

describe('tramo en pie durante el periodo (contratos)', () => {
  const octubre = { atajo: 'personalizado' as const, desde: '2026-10-01', hasta: '2026-10-31' };

  it('cuenta el contrato que empezó antes y sigue en pie', () => {
    expect(tramoEnRango('2026-01-15', '2027-01-15', octubre)).toBe(true);
    expect(tramoEnRango('2026-01-15', null, octubre)).toBe(true);
  });

  it('cuenta el que empieza o termina dentro del periodo', () => {
    expect(tramoEnRango('2026-10-20', '2027-10-20', octubre)).toBe(true);
    expect(tramoEnRango('2026-03-01', '2026-10-05', octubre)).toBe(true);
  });

  it('no cuenta el que terminó antes o empieza después', () => {
    expect(tramoEnRango('2026-01-01', '2026-09-30', octubre)).toBe(false);
    expect(tramoEnRango('2026-11-01', null, octubre)).toBe(false);
  });

  it('sin fecha de inicio no se puede situar y queda fuera; sin filtro, todo pasa', () => {
    expect(tramoEnRango(null, null, octubre)).toBe(false);
    expect(tramoEnRango(null, null, FILTRO_FECHA_VACIO)).toBe(true);
  });
});

describe('chips', () => {
  it('uno por filtro activo, en el orden de las columnas', () => {
    const chips = chipsDeFiltros(FILAS, COLUMNAS, {
      inicio: filtroDeFecha({ atajo: 'personalizado', desde: '2026-10-01', hasta: '2026-10-28' }),
      estado: filtroDeValores(['NUEVO']),
      monto: { tipo: 'numero', min: '100', max: '' },
      nombre: { tipo: 'texto', texto: 'ac' },
    }, '2026');
    expect(chips).toEqual([
      { key: 'estado', columna: 'Estado', texto: 'Sin procesar' },
      { key: 'nombre', columna: 'Nombre', texto: 'contiene «ac»' },
      { key: 'monto', columna: 'Monto', texto: '≥ 100' },
      { key: 'inicio', columna: 'Inicia', texto: '01/10–28/10' },
    ]);
  });

  it('muchos valores se resumen; sin filtro activo no hay chip', () => {
    const chips = chipsDeFiltros(FILAS, COLUMNAS, { estado: filtroDeValores(['NUEVO', 'GANADO', VACIO, 'OTRO']), nombre: { tipo: 'texto', texto: '' } });
    expect(chips).toEqual([{ key: 'estado', columna: 'Estado', texto: '4 valores' }]);
  });

  it('el nombre del vacío sale en el chip', () => {
    expect(chipsDeFiltros(FILAS, COLUMNAS, { estado: filtroDeValores([VACIO]) })[0].texto).toBe('Sin estado');
  });

  it('textoFecha: atajos por su nombre y rangos con el año solo si es otro', () => {
    expect(textoFecha({ atajo: 'mes', desde: '2026-10-01', hasta: '2026-10-28' })).toBe('Este mes');
    expect(textoFecha({ atajo: 'personalizado', desde: '2025-12-01', hasta: '2026-01-05' }, '2026')).toBe('01/12/25–05/01');
    expect(textoFecha({ atajo: 'personalizado', desde: '2026-10-03', hasta: '' }, '2026')).toBe('desde 03/10');
  });
});

describe('enlaces profundos', () => {
  const url = (s: string) => new URLSearchParams(s);

  it('listaDeUrl separa por comas', () => {
    expect(listaDeUrl('A, B,,C')).toEqual(['A', 'B', 'C']);
    expect(listaDeUrl(null)).toEqual([]);
  });

  it('Posibles clientes: estado, motivo de descarte, responsable y periodo', () => {
    expect(filtrosDeUrlLeads(url('estado=DESCARTADO&motivoDescarte=Spam&responsable=mine&desde=2026-09-03&hasta=2026-09-15'), 7)).toEqual({
      estado: filtroDeValores(['DESCARTADO']),
      motivoDescarte: filtroDeValores(['Spam']),
      responsable: filtroDeValores(['7']),
      llego: filtroDeFecha({ atajo: 'personalizado', desde: '2026-09-03', hasta: '2026-09-15' }),
    });
    expect(filtrosDeUrlLeads(url('estado=pendientes'))).toEqual({ estado: filtroDeValores(['NUEVO', 'EN_SEGUIMIENTO']) });
    expect(filtrosDeUrlLeads(url('responsable=12'))).toEqual({ responsable: filtroDeValores(['12']) });
  });

  it('Posibles clientes: «all» y «mine» sin usuario no filtran', () => {
    expect(filtrosDeUrlLeads(url('responsable=all'), 7)).toEqual({});
    expect(filtrosDeUrlLeads(url('responsable=mine'), null)).toEqual({});
    expect(filtrosDeUrlLeads(url('nuevo=1&ficha=3'))).toEqual({});
  });

  it('Directorio: ciclo válido y periodo', () => {
    const f = filtrosDeUrlClientes(url('ciclo=PROSPECTO&desde=2026-10-01'), ['CLIENTE', 'PROSPECTO'], '__fecha');
    expect(f.__ciclo).toEqual(filtroDeValores(['PROSPECTO']));
    expect(f.__fecha).toEqual(filtroDeFecha({ atajo: 'personalizado', desde: '2026-10-01', hasta: '' }));
    expect(filtrosDeUrlClientes(url('ciclo=INVENTADO'), ['CLIENTE'], '__fecha')).toEqual({});
  });

  it('Contratos: «En curso» agrupa tres estados; motivo y periodo', () => {
    expect(filtrosDeUrlContratos(url('estado=EN_CURSO')).estado).toEqual(filtroDeValores(['VIGENTE', 'POR_VENCER', 'POR_INICIAR']));
    expect(filtrosDeUrlContratos(url('estado=VENCIDO&motivo=Precio')).motivoCierre).toEqual(filtroDeValores(['Precio']));
    expect(filtrosDeUrlContratos(url('desde=2026-10-01&hasta=2026-10-31')).vigencia).toBeDefined();
  });
});
