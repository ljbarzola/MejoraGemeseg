// Emparejar el nombre que un guardia escribió a mano en la bitácora con los
// guardias asignados al puesto. Es lo que decide si "Pedro" es un intruso o es
// Pedro Gómez Ruiz escrito corto. Reglas fijas y sin IA a propósito: una
// coincidencia tiene que poder explicarse y repetirse igual cada vez.
//
// Sin orden: en el puesto el nombre va "Apellidos Nombres" y la gente escribe
// "Nombre Apellido", así que se comparan los conjuntos de palabras.

const PALABRAS_VACIAS = ['de', 'del', 'la', 'las', 'los', 'el'];

export function normalizarTexto(s: string): string {
  return (s || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function palabras(s: string): string[] {
  return (
    normalizarTexto(s)
      .split(' ')
      // "de", "la", "del": no distinguen a nadie ("María de los Ángeles").
      .filter((t) => t.length >= 2 && !PALABRAS_VACIAS.includes(t))
  );
}

function distanciaEdicion(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(
        prev[j] + 1,
        cur[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    prev = cur;
  }
  return prev[b.length];
}

// 1 = igual; una letra mal leída en una palabra de 5+ letras aún cuenta (0.8).
// Una inicial ("J." por "Juan") vale poco: sirve de apoyo, no de prueba.
function similitudPalabra(a: string, b: string): number {
  if (a === b) return 1;
  if (a.length === 1 || b.length === 1) {
    const [corta, larga] = a.length === 1 ? [a, b] : [b, a];
    return larga.startsWith(corta) ? 0.5 : 0;
  }
  const largo = Math.max(a.length, b.length);
  const ratio = 1 - distanciaEdicion(a, b) / largo;
  return ratio >= 0.8 ? ratio : 0;
}

/**
 * Qué tan parecidos son dos nombres de persona, de 0 a 1. Se mira el nombre MÁS
 * CORTO contra el más largo: "Juan Pérez" está contenido en "Pérez Mora Juan
 * Carlos". Un nombre de una sola palabra nunca pasa de 0.7: "Juan" solo no
 * identifica a nadie.
 */
export function similitudNombrePersona(a: string, b: string): number {
  const pa = palabras(a);
  const pb = palabras(b);
  if (!pa.length || !pb.length) return 0;
  const [corto, largo] = pa.length <= pb.length ? [pa, pb] : [pb, pa];
  const libres = [...largo];
  let suma = 0;
  for (const p of corto) {
    let mejor = 0;
    let idx = -1;
    libres.forEach((q, i) => {
      const s = similitudPalabra(p, q);
      if (s > mejor) {
        mejor = s;
        idx = i;
      }
    });
    if (idx >= 0) libres.splice(idx, 1);
    suma += mejor;
  }
  const score = suma / corto.length;
  return corto.length === 1 ? Math.min(score, 0.7) : score;
}

/** Desde aquí se da por la misma persona; entre PROBABLE y SEGURO se avisa que se revise. */
export const UMBRAL_NOMBRE_SEGURO = 0.85;
export const UMBRAL_NOMBRE_PROBABLE = 0.6;

export interface GuardiaPuesto {
  cedula: string;
  nombre: string;
}

export interface EmparejamientoGuardia {
  guardia: GuardiaPuesto | null;
  coincidencia: number;
  /** Dos guardias del puesto se parecen casi igual al nombre leído. */
  ambiguo: boolean;
}

export function emparejarGuardia(
  nombreLeido: string,
  guardias: GuardiaPuesto[],
): EmparejamientoGuardia {
  const puntuados = guardias
    .map((g) => ({ g, s: similitudNombrePersona(nombreLeido, g.nombre) }))
    .sort((x, y) => y.s - x.s);
  const mejor = puntuados[0];
  if (!mejor || mejor.s < UMBRAL_NOMBRE_PROBABLE) {
    return { guardia: null, coincidencia: mejor?.s ?? 0, ambiguo: false };
  }
  const segundo = puntuados[1];
  const ambiguo =
    !!segundo &&
    segundo.s >= UMBRAL_NOMBRE_PROBABLE &&
    mejor.s - segundo.s < 0.1;
  return { guardia: mejor.g, coincidencia: mejor.s, ambiguo };
}

/** Texto libre (puesto, entidad): cuánto del más corto aparece en el más largo. */
export function similitudTexto(a: string, b: string): number {
  const ta = new Set(
    normalizarTexto(a)
      .split(' ')
      .filter((t) => t.length >= 3),
  );
  const tb = new Set(
    normalizarTexto(b)
      .split(' ')
      .filter((t) => t.length >= 3),
  );
  if (!ta.size || !tb.size) return 0;
  const [chico, grande] = ta.size <= tb.size ? [ta, tb] : [tb, ta];
  let comunes = 0;
  chico.forEach((t) => {
    if (grande.has(t)) comunes++;
  });
  return comunes / chico.size;
}
