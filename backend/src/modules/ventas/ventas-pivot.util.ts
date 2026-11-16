import { BadRequestException } from '@nestjs/common';

// Tabla dinámica del Dashboard de Ventas (2026-11-16). Lógica PURA, sin base de datos: el servicio le pasa las
// ventas del periodo (oportunidades aceptadas) y esto arma filas, columnas, subtotales y totales.
//
// Reglas (decididas con Leidy, ver ventas-contratos.md sección 46):
//  - Una «venta» es una oportunidad aceptada en el periodo (como en Metas). «Impacto» = una venta.
//  - Una venta con varios servicios reparte su monto en partes iguales entre ellos (en centavos exactos, así
//    todo suma sin diferencias de centavos). Filtrar por un servicio deja solo su parte del monto.
//  - «Ventas» y «Clientes» cuentan sin repetir: una venta de dos servicios es UNA venta en el total aunque
//    aparezca en dos filas. Por eso, cuando se agrupa por servicio, el total puede ser menor que la suma de las celdas.

export const DIMENSIONES = ['vendedor', 'cliente', 'servicio', 'provincia', 'ciudad', 'mes', 'tipo', 'rango'] as const;
export type Dimension = (typeof DIMENSIONES)[number];

export const MEDIDAS = ['monto', 'ventas', 'clientes', 'ticket'] as const;
export type Medida = (typeof MEDIDAS)[number];

export const ETIQUETA_DIMENSION: Record<Dimension, string> = {
  vendedor: 'Vendedor',
  cliente: 'Cliente o empresa',
  servicio: 'Servicio',
  provincia: 'Provincia',
  ciudad: 'Ciudad',
  mes: 'Mes de la venta',
  tipo: 'Tipo de venta',
  rango: 'Rango de precio',
};

const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

const TIPO_VENTA: Record<string, string> = {
  LEAD: 'Posible cliente',
  REFERIDO: 'Referido',
  CLIENTE_EXISTENTE: 'Nuevo servicio de un cliente',
  RENOVACION: 'Renovación',
};

const RANGOS: Record<string, string> = {
  '1': 'Menos de $500',
  '2': '$500 a $1,999',
  '3': '$2,000 a $9,999',
  '4': '$10,000 o más',
  '5': 'Sin monto',
};

export const CLAVE_OTROS = '__otros';
const MAX_COLUMNAS = 12;
const MAX_COLUMNAS_ORDENADAS = 24; // meses y rangos: son pocos y su orden importa
const MAX_FILAS = 300;
const MAX_HIJOS = 100;
const MAX_OPCIONES = 500;

export interface VentaPivot {
  id: number;
  salesClientId: number;
  clienteNombre: string;
  vendedorNombre: string | null;
  /** Monto cotizado en dólares; null si la oportunidad no lo tiene. */
  monto: number | null;
  /** Día de la aceptación, hora de Ecuador (AAAA-MM-DD). */
  dia: string;
  provincia: string | null;
  ciudad: string | null;
  originType: string | null;
  servicios: string[];
}

export interface Parte {
  ventaId: number;
  clienteId: number;
  centavos: number;
  sinMonto: boolean;
  valores: Record<Dimension, string>;
}

export interface Consulta {
  filas: Dimension[];
  columna: Dimension | null;
  medidas: Medida[];
  filtros: Partial<Record<Dimension, string[]>>;
}

export interface Medidas {
  monto: number;
  ventas: number;
  clientes: number;
  ticket: number | null;
}

export interface FilaPivot {
  clave: string;
  etiqueta: string;
  celdas: Medidas[];
  total: Medidas;
  hijos?: FilaPivot[];
  esOtros?: boolean;
}

export interface ColumnaPivot {
  clave: string;
  etiqueta: string;
  esOtros?: boolean;
}

export interface ResultadoPivot {
  filas: Dimension[];
  columna: Dimension | null;
  medidas: Medida[];
  columnas: ColumnaPivot[];
  datos: FilaPivot[];
  total: { celdas: Medidas[]; total: Medidas };
  /** Ventas distintas que entran en la tabla, y cuántas no traen monto (cuentan como venta, no suman dólares). */
  ventas: number;
  sinMonto: number;
  /** Cuántas filas y columnas se juntaron en «Otros» por ser demasiadas. */
  plegado: { filas: number; columnas: number };
}

// ---------------------------------------------------------------------------
// Valores de cada dimensión
// ---------------------------------------------------------------------------

const ORDENADAS: ReadonlySet<Dimension> = new Set<Dimension>(['mes', 'rango']);

export function etiquetaValor(dim: Dimension, clave: string): string {
  if (clave === CLAVE_OTROS) return 'Otros';
  if (dim === 'mes') {
    const [anio, mes] = clave.split('-');
    const nombre = MESES[Number(mes) - 1];
    return nombre ? `${nombre} ${anio}` : clave;
  }
  if (dim === 'rango') return RANGOS[clave] ?? clave;
  return clave;
}

function claveRango(monto: number | null): string {
  if (monto === null) return '5';
  if (monto < 500) return '1';
  if (monto < 2000) return '2';
  if (monto < 10000) return '3';
  return '4';
}

/** Reparte `centavos` en n partes enteras que suman exactamente el total. */
export function repartir(centavos: number, n: number): number[] {
  const base = Math.floor(centavos / n);
  const resto = centavos - base * n;
  return Array.from({ length: n }, (_, i) => base + (i < resto ? 1 : 0));
}

/** Convierte las ventas en «partes»: una por servicio (o una sola «Sin servicio»). */
export function construirPartes(ventas: VentaPivot[]): Parte[] {
  const partes: Parte[] = [];
  for (const v of ventas) {
    const servicios = [...new Set(v.servicios.map((s) => s.trim()).filter(Boolean))];
    if (servicios.length === 0) servicios.push('Sin servicio');
    const total = v.monto === null ? 0 : Math.round(v.monto * 100);
    const reparto = repartir(total, servicios.length);
    const base = {
      vendedor: v.vendedorNombre?.trim() || 'Sin responsable',
      cliente: v.clienteNombre.trim() || 'Sin nombre',
      provincia: v.provincia?.trim() || 'Sin provincia',
      ciudad: v.ciudad?.trim() || 'Sin ciudad',
      mes: v.dia.slice(0, 7),
      tipo: TIPO_VENTA[v.originType ?? ''] ?? 'Ingreso manual',
      rango: claveRango(v.monto),
    };
    servicios.forEach((servicio, i) => {
      partes.push({
        ventaId: v.id,
        clienteId: v.salesClientId,
        centavos: reparto[i],
        sinMonto: v.monto === null,
        valores: { ...base, servicio },
      });
    });
  }
  return partes;
}

// ---------------------------------------------------------------------------
// Acumuladores
// ---------------------------------------------------------------------------

interface Acum {
  c: number;
  v: Set<number>;
  k: Set<number>;
}

const acumVacio = (): Acum => ({ c: 0, v: new Set(), k: new Set() });

function sumar(a: Acum, p: Parte) {
  a.c += p.centavos;
  a.v.add(p.ventaId);
  a.k.add(p.clienteId);
}

function unir(a: Acum, b: Acum) {
  a.c += b.c;
  b.v.forEach((x) => a.v.add(x));
  b.k.forEach((x) => a.k.add(x));
}

function aMedidas(a: Acum | undefined): Medidas {
  if (!a) return { monto: 0, ventas: 0, clientes: 0, ticket: null };
  const ventas = a.v.size;
  return {
    monto: a.c / 100,
    ventas,
    clientes: a.k.size,
    ticket: ventas > 0 ? Math.round(a.c / ventas) / 100 : null,
  };
}

interface Nodo {
  clave: string;
  celdas: Map<string, Acum>;
  total: Acum;
  hijos?: Map<string, Nodo>;
  esOtros?: boolean;
}

const nodoVacio = (clave: string): Nodo => ({ clave, celdas: new Map(), total: acumVacio() });

function acumular(n: Nodo, colClave: string | null, p: Parte) {
  sumar(n.total, p);
  if (colClave === null) return;
  let c = n.celdas.get(colClave);
  if (!c) n.celdas.set(colClave, (c = acumVacio()));
  sumar(c, p);
}

function unirNodo(a: Nodo, b: Nodo) {
  unir(a.total, b.total);
  b.celdas.forEach((acum, clave) => {
    let c = a.celdas.get(clave);
    if (!c) a.celdas.set(clave, (c = acumVacio()));
    unir(c, acum);
  });
}

const comparar = (a: string, b: string) => a.localeCompare(b, 'es');

function ordenar(nodos: Nodo[], dim: Dimension): Nodo[] {
  return [...nodos].sort((x, y) => {
    if (ORDENADAS.has(dim)) return x.clave < y.clave ? -1 : x.clave > y.clave ? 1 : 0;
    return y.total.c - x.total.c || comparar(x.clave, y.clave);
  });
}

/** Si hay más nodos que el máximo, junta el resto en un solo «Otros» (al final). */
function plegar(ordenados: Nodo[], max: number): { nodos: Nodo[]; plegados: number } {
  if (ordenados.length <= max) return { nodos: ordenados, plegados: 0 };
  const otros = nodoVacio(CLAVE_OTROS);
  otros.esOtros = true;
  for (const n of ordenados.slice(max)) unirNodo(otros, n);
  return { nodos: [...ordenados.slice(0, max), otros], plegados: ordenados.length - max };
}

// ---------------------------------------------------------------------------
// Consulta y filtros
// ---------------------------------------------------------------------------

const esDimension = (x: string): x is Dimension => (DIMENSIONES as readonly string[]).includes(x);
const esMedida = (x: string): x is Medida => (MEDIDAS as readonly string[]).includes(x);

export function parsearConsulta(q: { filas?: string; columna?: string; medidas?: string; filtros?: string }): Consulta {
  const filas = [...new Set((q.filas ?? 'vendedor').split(',').map((s) => s.trim()).filter(Boolean))];
  if (filas.length === 0) filas.push('vendedor');
  if (filas.length > 2) throw new BadRequestException('Solo se pueden agrupar las filas en dos niveles.');
  if (!filas.every(esDimension)) throw new BadRequestException('Alguna de las filas elegidas no es válida.');

  let columna: Dimension | null = null;
  if (q.columna && q.columna !== 'ninguna') {
    if (!esDimension(q.columna)) throw new BadRequestException('La columna elegida no es válida.');
    if ((filas as string[]).includes(q.columna)) {
      throw new BadRequestException('La columna no puede ser la misma que una fila.');
    }
    columna = q.columna;
  }

  const medidas = [...new Set((q.medidas ?? 'monto,ventas').split(',').map((s) => s.trim()).filter(Boolean))];
  if (medidas.length === 0) throw new BadRequestException('Elige al menos un dato para mostrar.');
  if (!medidas.every(esMedida)) throw new BadRequestException('Alguno de los datos elegidos no es válido.');
  // Siempre en el mismo orden, sin importar cómo se marcaron.
  const medidasOrdenadas = MEDIDAS.filter((m) => (medidas as string[]).includes(m));

  const filtros: Partial<Record<Dimension, string[]>> = {};
  if (q.filtros) {
    let crudo: unknown;
    try {
      crudo = JSON.parse(q.filtros);
    } catch {
      throw new BadRequestException('Los filtros no son válidos.');
    }
    if (!crudo || typeof crudo !== 'object' || Array.isArray(crudo)) throw new BadRequestException('Los filtros no son válidos.');
    for (const [dim, valores] of Object.entries(crudo as Record<string, unknown>)) {
      if (!esDimension(dim) || !Array.isArray(valores)) throw new BadRequestException('Los filtros no son válidos.');
      const limpios = valores.filter((v): v is string => typeof v === 'string' && v.length > 0 && v.length <= 200);
      if (limpios.length > MAX_OPCIONES) throw new BadRequestException('Hay demasiados valores en un filtro.');
      if (limpios.length) filtros[dim] = limpios;
    }
  }
  return { filas: filas as Dimension[], columna, medidas: medidasOrdenadas, filtros };
}

function pasa(p: Parte, filtros: Consulta['filtros']): boolean {
  for (const dim of DIMENSIONES) {
    const permitidos = filtros[dim];
    if (permitidos && !permitidos.includes(p.valores[dim])) return false;
  }
  return true;
}

/** Los valores que se pueden elegir en cada filtro, de todo lo vendido en el periodo (antes de filtrar). */
export function opcionesDeFiltro(partes: Parte[]): Record<Dimension, { valor: string; etiqueta: string }[]> {
  const out = {} as Record<Dimension, { valor: string; etiqueta: string }[]>;
  for (const dim of DIMENSIONES) {
    const peso = new Map<string, number>();
    for (const p of partes) peso.set(p.valores[dim], (peso.get(p.valores[dim]) ?? 0) + p.centavos);
    const claves = [...peso.keys()].sort((a, b) =>
      ORDENADAS.has(dim) ? (a < b ? -1 : a > b ? 1 : 0) : (peso.get(b) ?? 0) - (peso.get(a) ?? 0) || comparar(a, b),
    );
    out[dim] = claves.slice(0, MAX_OPCIONES).map((valor) => ({ valor, etiqueta: etiquetaValor(dim, valor) }));
  }
  return out;
}

// ---------------------------------------------------------------------------
// La tabla
// ---------------------------------------------------------------------------

export function armarPivot(partes: Parte[], c: Consulta): ResultadoPivot {
  const filtradas = partes.filter((p) => pasa(p, c.filtros));
  const [d1, d2] = c.filas;

  const raiz = new Map<string, Nodo>();
  const colTotales = new Map<string, Acum>();
  const grande = acumVacio();
  const sinMonto = new Set<number>();

  for (const p of filtradas) {
    const col = c.columna ? p.valores[c.columna] : null;
    const k1 = p.valores[d1];
    let n1 = raiz.get(k1);
    if (!n1) raiz.set(k1, (n1 = nodoVacio(k1)));
    acumular(n1, col, p);
    if (d2) {
      n1.hijos ??= new Map();
      const k2 = p.valores[d2];
      let n2 = n1.hijos.get(k2);
      if (!n2) n1.hijos.set(k2, (n2 = nodoVacio(k2)));
      acumular(n2, col, p);
    }
    if (col !== null) {
      let ct = colTotales.get(col);
      if (!ct) colTotales.set(col, (ct = acumVacio()));
      sumar(ct, p);
    }
    sumar(grande, p);
    if (p.sinMonto) sinMonto.add(p.ventaId);
  }

  // Columnas: las más vendidas (o todas, en orden, si son meses o rangos); el resto va a «Otros».
  let columnas: ColumnaPivot[] = [];
  let columnasPlegadas = 0;
  let conservadas = new Set<string>();
  if (c.columna) {
    const dim = c.columna;
    const ordenadas = [...colTotales.keys()].sort((a, b) =>
      ORDENADAS.has(dim) ? (a < b ? -1 : a > b ? 1 : 0) : (colTotales.get(b)!.c - colTotales.get(a)!.c) || comparar(a, b),
    );
    const tope = ORDENADAS.has(dim) ? MAX_COLUMNAS_ORDENADAS : MAX_COLUMNAS;
    const visibles = ordenadas.slice(0, tope);
    conservadas = new Set(visibles);
    columnas = visibles.map((clave) => ({ clave, etiqueta: etiquetaValor(dim, clave) }));
    columnasPlegadas = ordenadas.length - visibles.length;
    if (columnasPlegadas > 0) columnas.push({ clave: CLAVE_OTROS, etiqueta: 'Otros', esOtros: true });
  }

  const plegarColumnas = (n: Nodo) => {
    if (columnasPlegadas === 0) return;
    const otros = acumVacio();
    for (const [clave, acum] of [...n.celdas]) {
      if (!conservadas.has(clave)) {
        unir(otros, acum);
        n.celdas.delete(clave);
      }
    }
    if (otros.v.size) n.celdas.set(CLAVE_OTROS, otros);
  };

  let filasPlegadas = 0;
  const aFila = (n: Nodo, dim: Dimension, hijos?: FilaPivot[]): FilaPivot => ({
    clave: n.clave,
    etiqueta: etiquetaValor(dim, n.clave),
    celdas: columnas.map((col) => aMedidas(n.celdas.get(col.clave))),
    total: aMedidas(n.total),
    ...(hijos ? { hijos } : {}),
    ...(n.esOtros ? { esOtros: true } : {}),
  });

  const nivel1 = plegar(ordenar([...raiz.values()], d1), MAX_FILAS);
  filasPlegadas += nivel1.plegados;
  const datos = nivel1.nodos.map((n1) => {
    plegarColumnas(n1);
    if (!d2 || !n1.hijos) return aFila(n1, d1);
    const nivel2 = plegar(ordenar([...n1.hijos.values()], d2), MAX_HIJOS);
    filasPlegadas += nivel2.plegados;
    const hijos = nivel2.nodos.map((n2) => {
      plegarColumnas(n2);
      return aFila(n2, d2);
    });
    return aFila(n1, d1, hijos);
  });

  const totalColumnas = nodoVacio('total');
  for (const [clave, acum] of colTotales) totalColumnas.celdas.set(clave, acum);
  plegarColumnas(totalColumnas);

  return {
    filas: c.filas,
    columna: c.columna,
    medidas: c.medidas,
    columnas,
    datos,
    total: {
      celdas: columnas.map((col) => aMedidas(totalColumnas.celdas.get(col.clave))),
      total: aMedidas(grande),
    },
    ventas: grande.v.size,
    sinMonto: sinMonto.size,
    plegado: { filas: filasPlegadas, columnas: columnasPlegadas },
  };
}

/** Quién se mira: null = toda la empresa. Misma regla de «Cifras de» del Dashboard. */
export function vendedorDeLaConsulta(a: { userId: number; role: string; alcance?: string }): number | null {
  const privilegiado = a.role === 'ADMIN' || a.role === 'MANAGER';
  if (a.alcance === 'all') return privilegiado ? null : a.userId;
  if (a.alcance === 'mine') return a.userId;
  if (!privilegiado) return a.userId;
  if (!a.alcance) return null;
  const id = Number(a.alcance);
  return Number.isInteger(id) && id > 0 ? id : null;
}
