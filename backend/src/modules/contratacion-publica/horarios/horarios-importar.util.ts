/**
 * Lectura de un horario hecho en Excel (el formato que ya usa Operaciones).
 * Funciones puras sobre una matriz de textos: no tocan la base ni el archivo,
 * así se pueden probar solas. El servicio (horarios-importar.service.ts) las
 * junta con la base de datos.
 *
 * Formato que reconoce (uno o varios bloques por hoja):
 *   fila de título:   «FERROCARRIL DURAN» | CEDULA | D | L | M ...   (opcional)
 *   fila de cabecera: «NOMBRES Y APELLIDOS» | CEDULA (opcional) | 1 | 2 | 3 ...
 *   filas de gente:   nombre | cédula (opcional) | D | N | L ...
 *   una fila vacía cierra el bloque.
 */

export interface PersonaExcel {
  fila: number; // 1-based, para decirle a la persona dónde mirar
  nombre: string;
  cedula: string | null;
  turnos: { col: number; codigo: string }[];
  /** Palabras escritas letra por letra en las celdas (DESCANSO, MEDICO…): no son turnos. */
  palabras: string[];
}

export interface BloqueExcel {
  titulo: string;
  fila: number; // fila de la cabecera (1-based)
  columnasDia: { col: number; dia: number }[];
  personas: PersonaExcel[];
}

/** Mayúsculas, sin tildes ni signos: para comparar nombres escritos distinto. */
export function normalizarTexto(t: string): string {
  return (t ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim();
}

/** Solo dígitos; una cédula de 9 dígitos perdió su 0 inicial en Excel y se repone. */
export function normalizarCedula(t: string | null | undefined): string | null {
  const d = (t ?? '').replace(/\D/g, '');
  if (!d) return null;
  return d.length === 9 ? `0${d}` : d;
}

/** Lo que dos nombres tienen que cumplir para ser la misma persona (sin importar el orden). */
export function mismoNombre(a: string, b: string): boolean {
  const ta = normalizarTexto(a).split(' ').filter(Boolean);
  const tb = normalizarTexto(b).split(' ').filter(Boolean);
  if (!ta.length || !tb.length) return false;
  const [corto, largo] = ta.length <= tb.length ? [ta, tb] : [tb, ta];
  if (corto.length < 2) return false; // un solo nombre no alcanza para afirmar nada
  return corto.every((x) => largo.includes(x));
}

/** Palabras que el equipo escribe una letra por celda en lugar de un código. */
const PALABRAS_POR_LETRAS = ['VACACIONES', 'DESCANSO', 'MEDICO', 'PERMISO', 'ENFERMO'];

/**
 * Quita de los turnos las palabras escritas letra por letra («D E S C A N S O»
 * en celdas seguidas, o salteando una celda vacía). Sin esto, la D de
 * «DESCANSO» se importaría como un turno de día.
 */
export function quitarPalabras(
  turnos: { col: number; codigo: string }[],
): { turnos: { col: number; codigo: string }[]; palabras: string[] } {
  const letras = turnos.filter((t) => /^[A-Z]$/.test(t.codigo)).sort((a, b) => a.col - b.col);
  const quitar = new Set<number>();
  const palabras: string[] = [];
  // Cadenas de letras con, como mucho, una celda vacía entre una y otra.
  const cadenas: { col: number; codigo: string }[][] = [];
  for (const t of letras) {
    const ultima = cadenas[cadenas.length - 1];
    if (ultima && t.col - ultima[ultima.length - 1].col <= 2) ultima.push(t);
    else cadenas.push([t]);
  }
  for (const cadena of cadenas) {
    const texto = cadena.map((t) => t.codigo).join('');
    for (const palabra of PALABRAS_POR_LETRAS) {
      const i = texto.indexOf(palabra);
      if (i < 0) continue;
      cadena.slice(i, i + palabra.length).forEach((t) => quitar.add(t.col));
      palabras.push(palabra);
    }
  }
  return { turnos: turnos.filter((t) => !quitar.has(t.col)), palabras };
}

/** Busca los bloques «NOMBRES Y APELLIDOS» de una hoja ya convertida a texto. */
export function detectarBloques(m: string[][]): BloqueExcel[] {
  const bloques: BloqueExcel[] = [];
  for (let r = 0; r < m.length; r++) {
    const fila = m[r] ?? [];
    const c = fila.findIndex((x) => normalizarTexto(x) === 'NOMBRES Y APELLIDOS');
    if (c < 0) continue;

    const hayCedula = normalizarTexto(fila[c + 1] ?? '') === 'CEDULA';
    const colCedula = hayCedula ? c + 1 : null;
    const desde = hayCedula ? c + 2 : c + 1;

    const columnasDia: { col: number; dia: number }[] = [];
    for (let cc = desde; cc < fila.length; cc++) {
      const t = (fila[cc] ?? '').trim();
      if (/^\d{1,2}$/.test(t) && +t >= 1 && +t <= 31) columnasDia.push({ col: cc, dia: +t });
    }
    if (!columnasDia.length) continue;

    const titulo = ((m[r - 1] ?? [])[c] ?? '').trim().replace(/[.\s]+$/, '');

    const personas: PersonaExcel[] = [];
    for (let rr = r + 1; rr < m.length; rr++) {
      const f = m[rr] ?? [];
      const nombre = (f[c] ?? '').trim();
      if (!nombre) break;
      // Otro título o cabecera pegado: el bloque terminó.
      if (normalizarTexto(f[c + 1] ?? '') === 'CEDULA') break;
      if (normalizarTexto(nombre) === 'NOMBRES Y APELLIDOS') break;
      const { turnos, palabras } = quitarPalabras(
        columnasDia
          .map(({ col }) => ({ col, codigo: (f[col] ?? '').trim().toUpperCase() }))
          .filter((t) => t.codigo),
      );
      personas.push({
        fila: rr + 1,
        nombre,
        cedula: colCedula === null ? null : normalizarCedula(f[colCedula]),
        turnos,
        palabras,
      });
    }
    bloques.push({ titulo, fila: r + 1, columnasDia, personas });
  }
  return bloques;
}

/**
 * Asigna a cada columna de día una fecha del horario. Las columnas van en
 * orden: la primera busca su número de día en el rango y las siguientes
 * avanzan desde ahí, así «30, 1, 2, 3…» (un ciclo que cruza de mes) cae bien.
 * Una columna cuyo día no existe en el rango no se asigna.
 */
export function mapearColumnasAFechas(
  columnasDia: { col: number; dia: number }[],
  fechasRango: string[], // 'YYYY-MM-DD' ordenadas
): Map<number, string> {
  const out = new Map<number, string>();
  let desde = 0;
  for (const { col, dia } of columnasDia) {
    let idx = -1;
    for (let i = desde; i < fechasRango.length; i++) {
      if (+fechasRango[i].slice(8, 10) === dia) {
        idx = i;
        break;
      }
    }
    if (idx >= 0) {
      out.set(col, fechasRango[idx]);
      desde = idx + 1;
    }
  }
  return out;
}

const MESES_HOJA = ['ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO', 'JULIO', 'AGOSTO', 'SEPTIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE'];

/**
 * El periodo que representa una hoja: el mes sale del nombre de la hoja («DICIEMBRE», «publicos-junio»), el primer día
 * de la primera columna y la cantidad de columnas dan el fin (una hoja de 31 columnas que empieza en 1 de febrero
 * termina el 3 de marzo). El año es el que deja la fecha más cerca de `hoy`. Sin mes en el nombre no se puede saber.
 * `diaCorte` es el día en que empieza el ciclo cuando no es el 1.
 */
export function periodoDeHoja(
  nombreHoja: string,
  columnasDia: { dia: number }[],
  hoy: string,
): { desde: string; hasta: string; diaCorte: number | null } | null {
  const nombre = normalizarTexto(nombreHoja);
  const mes = MESES_HOJA.findIndex((m) => nombre.split(' ').some((p) => p === m || (p.length >= 3 && p.startsWith(m.slice(0, 3)) && m.startsWith(p))));
  if (mes < 0 || columnasDia.length === 0) return null;
  const dia1 = columnasDia[0].dia;
  const ref = Date.parse(`${hoy}T00:00:00Z`);
  const hoyAnio = +hoy.slice(0, 4);
  let mejor: number | null = null;
  for (const anio of [hoyAnio - 1, hoyAnio, hoyAnio + 1]) {
    const ms = Date.UTC(anio, mes, dia1);
    if (new Date(ms).getUTCMonth() !== mes) continue; // el mes no tiene ese día
    if (mejor === null || Math.abs(ms - ref) < Math.abs(mejor - ref)) mejor = ms;
  }
  if (mejor === null) return null;
  const aIso = (ms: number) => new Date(ms).toISOString().slice(0, 10);
  return { desde: aIso(mejor), hasta: aIso(mejor + (columnasDia.length - 1) * 86_400_000), diaCorte: dia1 > 1 ? dia1 : null };
}

/** ¿El título del Excel es este puesto? Igual, o uno contiene al otro (y solo uno cumple). */
export function elegirPuesto<T extends { nombre: string }>(titulo: string, puestos: T[]): T | null {
  const t = normalizarTexto(titulo);
  if (!t) return null;
  const iguales = puestos.filter((p) => normalizarTexto(p.nombre) === t);
  if (iguales.length === 1) return iguales[0];
  if (iguales.length > 1) return null;
  const parecidos = puestos.filter((p) => {
    const n = normalizarTexto(p.nombre);
    return n && (n.includes(t) || t.includes(n));
  });
  return parecidos.length === 1 ? parecidos[0] : null;
}
