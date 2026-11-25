// Compara la dotación que dice una hoja con la dotación REGISTRADA del puesto (2026-11-25).
//
// La dotación registrada del puesto sale de dos lugares, y ninguno depende de un botón que se use una vez:
//  - Inventario: lo que Gemeseg manda al puesto (armas, chalecos y el resto del equipo asignado al puesto).
//  - La lista del puesto (`CPPuestoDotacion`): lo que alguien ya clasificó al ver una hoja (de Gemeseg o del
//    cliente/entidad: tachos de basura, tablero, llaves…).
// Todo lo que la hoja trae y no está en ninguno de los dos se marca «Nuevo»: una persona dice de quién es y desde
// entonces queda registrado. Es código fijo, no el modelo: el agente solo transcribe lo escrito.
//
// Los avisos de dotación nunca pasan de gravedad MEDIA: piden que alguien mire, no son una falta grave.

import { claveArticulo, type LecturaDotacion } from './bitacora.util';
import type { HallazgoRevision } from './bitacora-revisor.util';

/** Una fila de la lista del puesto (lo ya clasificado como de Gemeseg o del cliente/entidad). */
export interface FilaDotacionBase {
  ambito: string;
  articulo: string;
  cantidad: number | null;
}

/** Lo que Inventario tiene asignado a ESTE puesto (null = no se pudo consultar: no se compara con Inventario). */
export interface InventarioPuesto {
  armas: number;
  chalecos: number;
  equipo: { articulo: string; cantidad: number }[];
}

export type EstadoDotacion = 'CONOCIDO' | 'NUEVO';

const ES_ARMA = /\b(PISTOLA|REVOLVER|ESCOPETA|CARABINA|ARMA)S?\b/;
const ES_CHALECO = /\bCHALECOS?\b/;

const normalizar = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase();

const esArma = (articulo: string) => ES_ARMA.test(normalizar(articulo));
const esChaleco = (articulo: string) => ES_CHALECO.test(normalizar(articulo));

/** Palabras que distinguen a un artículo: las de 3 letras o más («radio», «linterna», «tablero»). */
const palabras = (articulo: string) => claveArticulo(articulo).split(' ').filter((t) => t.length >= 3);

/**
 * ¿Es el mismo artículo? Igual escrito, o todas las palabras del más corto están en el más largo
 * («Radios» y «Radio portátil Motorola» son el mismo; «Radio» y «Linterna» no).
 */
export function mismoArticulo(a: string, b: string): boolean {
  const ca = claveArticulo(a);
  const cb = claveArticulo(b);
  if (!ca || !cb) return false;
  if (ca === cb) return true;
  const pa = palabras(a);
  const pb = palabras(b);
  if (pa.length === 0 || pb.length === 0) return false;
  const [corto, largo] = pa.length <= pb.length ? [pa, pb] : [pb, pa];
  return corto.every((p) => largo.includes(p));
}

/** Suma las cantidades de las filas que son el mismo artículo; null si alguna no trae cantidad. */
function sumar(filas: { cantidad: number | null }[]): number | null {
  if (filas.length === 0) return null;
  return filas.some((f) => f.cantidad === null) ? null : filas.reduce((s, f) => s + (f.cantidad ?? 0), 0);
}

/** Para cada artículo de la hoja (en su orden): si ya está registrado en el puesto o es nuevo. */
export function estadoDeDotacion(
  actual: { articulo: string }[],
  base: FilaDotacionBase[],
  inventario?: InventarioPuesto | null,
): EstadoDotacion[] {
  return actual.map((d) => {
    if (base.some((b) => mismoArticulo(b.articulo, d.articulo))) return 'CONOCIDO';
    if (inventario) {
      if (esArma(d.articulo) && inventario.armas > 0) return 'CONOCIDO';
      if (esChaleco(d.articulo) && inventario.chalecos > 0) return 'CONOCIDO';
      if (inventario.equipo.some((e) => mismoArticulo(e.articulo, d.articulo))) return 'CONOCIDO';
    }
    return 'NUEVO';
  });
}

/** «2 chalecos» / «1 chaleco». */
const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

export function compararDotacion(opciones: {
  base: FilaDotacionBase[];
  actual: LecturaDotacion[];
  inventario?: InventarioPuesto | null;
  /** Día de la hoja (para el aviso); null si la hoja no trae día. */
  fecha: string | null;
}): HallazgoRevision[] {
  const { base, actual, inventario, fecha } = opciones;
  const hallazgos: HallazgoRevision[] = [];

  // 1) Lo registrado en la lista del puesto: falta, menos, más.
  const yaVistos = new Set<string>();
  for (const fb of base) {
    const clave = claveArticulo(fb.articulo);
    if (!clave || yaVistos.has(clave)) continue;
    yaVistos.add(clave);
    const mismas = base.filter((x) => mismoArticulo(x.articulo, fb.articulo));
    const enHoja = actual.filter((a) => mismoArticulo(a.articulo, fb.articulo));
    const delCliente = fb.ambito === 'CLIENTE';
    const severidad = delCliente ? 'BAJA' : 'MEDIA';
    const de = delCliente ? ' (del cliente o la entidad)' : '';
    const cantBase = sumar(mismas);
    if (enHoja.length === 0) {
      hallazgos.push({
        fecha,
        tipo: 'DOTACION_DIFERENTE',
        severidad,
        mensaje: `Falta «${fb.articulo}»${de} en la dotación de la hoja${cantBase !== null ? `: el puesto tiene registrado ${cantBase}` : ' (está registrado en la dotación del puesto)'}.`,
        clave: `DOTACION_DIFERENTE|-|${clave}`,
      });
      continue;
    }
    const cantHoja = sumar(enHoja);
    if (cantBase === null || cantHoja === null || cantBase === cantHoja) continue;
    hallazgos.push({
      fecha,
      tipo: 'DOTACION_DIFERENTE',
      severidad: cantHoja < cantBase ? severidad : 'BAJA',
      mensaje:
        cantHoja < cantBase
          ? `Hay menos «${fb.articulo}»${de}: la hoja dice ${cantHoja} y el puesto tiene registrado ${cantBase}.`
          : `Hay más «${fb.articulo}»${de}: la hoja dice ${cantHoja} y el puesto tiene registrado ${cantBase}.`,
      clave: `DOTACION_DIFERENTE|-|${clave}`,
    });
  }

  // 2) Lo que Inventario manda al puesto: armas y chalecos por total; el resto del equipo, artículo por artículo.
  if (inventario) {
    const contar = (sirve: (a: string) => boolean) =>
      actual.filter((d) => sirve(d.articulo)).reduce((s, d) => s + (d.cantidad ?? 0), 0);
    const revisarTotal = (sirve: (a: string) => boolean, enInventario: number, uno: string, varios: string, clave: string) => {
      // Si Inventario no tiene nada asignado al puesto, lo más probable es que no esté enlazado: no es culpa de la hoja.
      if (enInventario <= 0) return;
      const enHoja = contar(sirve);
      if (enHoja === enInventario) return;
      hallazgos.push({
        fecha,
        tipo: 'DOTACION_INVENTARIO',
        severidad: 'MEDIA',
        mensaje: `La hoja dice ${plural(enHoja, uno, varios)} y Inventario tiene ${plural(enInventario, uno, varios)} en este puesto.`,
        clave: `DOTACION_INVENTARIO|-|${clave}`,
      });
    };
    revisarTotal(esArma, inventario.armas, 'arma', 'armas', 'ARMAS');
    revisarTotal(esChaleco, inventario.chalecos, 'chaleco', 'chalecos', 'CHALECOS');

    for (const e of inventario.equipo) {
      // Lo que ya está en la lista del puesto se comparó arriba; armas y chalecos, por total.
      if (base.some((b) => mismoArticulo(b.articulo, e.articulo)) || esArma(e.articulo) || esChaleco(e.articulo)) continue;
      const enHoja = actual.filter((a) => mismoArticulo(a.articulo, e.articulo));
      const cantHoja = sumar(enHoja);
      if (cantHoja === null || cantHoja === e.cantidad) continue;
      hallazgos.push({
        fecha,
        tipo: 'DOTACION_INVENTARIO',
        severidad: 'MEDIA',
        mensaje: `La hoja dice ${cantHoja} de «${e.articulo}» e Inventario tiene ${e.cantidad} en este puesto.`,
        clave: `DOTACION_INVENTARIO|-|${claveArticulo(e.articulo)}`,
      });
    }
  }

  // 3) Lo que la hoja trae y el puesto no tiene registrado: se marca para que una persona diga de quién es.
  const estados = estadoDeDotacion(actual, base, inventario);
  const nuevos = new Set<string>();
  actual.forEach((d, i) => {
    const clave = claveArticulo(d.articulo);
    if (estados[i] !== 'NUEVO' || !clave || nuevos.has(clave)) return;
    nuevos.add(clave);
    hallazgos.push({
      fecha,
      tipo: 'DOTACION_NUEVO',
      severidad: 'MEDIA',
      mensaje: `«${d.articulo}» no está en la dotación registrada del puesto. Indica si es de Gemeseg o del cliente o la entidad.`,
      clave: `DOTACION_NUEVO|-|${clave}`,
    });
  });

  return hallazgos;
}
