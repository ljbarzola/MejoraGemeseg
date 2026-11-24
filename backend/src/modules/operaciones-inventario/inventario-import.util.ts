import type ExcelJS from 'exceljs';
import type { CategoriaArma } from './inventario.util';

/**
 * Lectura del Excel de inventario de Operaciones («INVENTARIO ARMA GEMESEG.xlsx») → plan de carga.
 * Herramienta TEMPORAL (2026-11-19): sirve para la carga inicial y, mientras Operaciones siga llevando el
 * Excel, para repetirla; cuando todo se registre en la aplicación se retira.
 *
 * REGLA DE LEIDY: solo entra lo que está escrito en el Excel. Lo que falta queda vacío y no se supone
 * (un chaleco sin cantidad es 0, una fecha que no es fecha deja el vencimiento vacío). Lo dudoso se carga
 * igual pero con una nota que empieza por «CORREGIR (leído del Excel)», para que se vea y se corrija.
 *
 * Este archivo es código puro (sin base de datos): el plan lo construye `planDesdeLibro`, lo escribe
 * `InventarioImportService`.
 */

export const NOTA_CORREGIR = 'CORREGIR (leído del Excel)';
const MAX_NOTA = 300;

export interface ArmaImport {
  hoja: string;
  fila: number;
  serie: string;
  clase: 'PISTOLA' | 'REVOLVER' | 'ESCOPETA' | 'OTRA';
  marca: string | null;
  calibre: string | null;
  categoria: CategoriaArma | null;
  municiones: number | null;
  ciudad: string | null;
  uso: string | null;
  estado: 'DISPONIBLE' | 'ASIGNADA';
  puestoNombre: string | null;
  permisoVence: string | null;
  notas: string | null;
  marcadaParaCorregir: boolean;
}

export interface ChalecoImport {
  fila: number;
  puestoNombre: string | null;
  ciudad: string | null;
  cantidad: number;
  /** El rastrillo es la bodega: lo que está ahí no se entrega a ningún puesto. */
  destino: 'BODEGA' | 'PUESTO';
  detalle: string;
}

export interface AccesorioImport {
  fila: number;
  tipo: 'IMPLEMENTO' | 'MUNICION';
  nombre: string;
  variante: string;
  cantidad: number;
}

export interface PlanImportacion {
  armas: ArmaImport[];
  chalecos: { articulo: string; filas: ChalecoImport[]; filasEnCero: number };
  accesorios: { items: AccesorioImport[]; sinCantidad: number };
  avisos: string[];
  errores: string[];
}

// ───────────────────────── lectura de celdas ─────────────────────────

export const quitarTildes = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
const norm = (s: string) => quitarTildes(s).toUpperCase().replace(/\s+/g, ' ').trim();

type Hoja = ExcelJS.Worksheet;

/** Tope de seguridad: estas hojas tienen decenas de filas y de columnas, nunca miles. */
const MAX_COLUMNAS = 40;
const MAX_FILAS = 2000;
const ultimaFila = (ws: Hoja) => Math.min(ws.rowCount, MAX_FILAS);

function crudo(ws: Hoja, fila: number, col: number): unknown {
  let v = ws.getCell(fila, col).value as unknown;
  if (v && typeof v === 'object' && !(v instanceof Date)) {
    const o = v as { result?: unknown; richText?: { text: string }[]; text?: unknown };
    if ('result' in o) v = o.result;
    else if (Array.isArray(o.richText)) v = o.richText.map((r) => r.text).join('');
    else if ('text' in o) v = o.text;
  }
  return v ?? null;
}

const isoFecha = (d: Date) => d.toISOString().slice(0, 10);

/** Texto limpio de una celda: espacios sobrantes quitados, vacío = null. Números y fechas se pasan a texto. */
function texto(v: unknown): string | null {
  if (v == null) return null;
  if (v instanceof Date) return isoFecha(v);
  if (typeof v === 'number') return String(v);
  if (typeof v === 'string') return v.replace(/\s+/g, ' ').trim() || null;
  return null;
}

function numero(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && /^\d+$/.test(v.trim())) return Number(v.trim());
  return null;
}

function buscarHoja(libro: ExcelJS.Workbook, nombre: string): Hoja | null {
  return libro.worksheets.find((w) => norm(w.name) === nombre) ?? null;
}

interface Tabla {
  ws: Hoja;
  primeraFila: number;
  col: Record<string, number>;
}

/** Encuentra la fila de títulos (la que trae «ORD») y en qué columna está cada uno. */
function leerTabla(ws: Hoja): Tabla | null {
  for (let r = 1; r <= 10; r++) {
    const titulos = new Map<string, number>();
    // Este Excel declara la hoja con todas las columnas posibles (16384): los títulos están en las primeras.
    for (let c = 1; c <= Math.min(ws.columnCount + 1, MAX_COLUMNAS); c++) {
      const t = texto(crudo(ws, r, c));
      if (t) titulos.set(norm(t), c);
    }
    if (titulos.has('ORD')) {
      const col: Record<string, number> = {};
      for (const [t, c] of titulos) col[t] = c;
      return { ws, primeraFila: r + 1, col };
    }
  }
  return null;
}

const colDe = (t: Tabla, ...alias: string[]): number | null => {
  for (const a of alias) if (t.col[a]) return t.col[a];
  return null;
};

// ───────────────────────── reglas ─────────────────────────

/** Solo erratas obvias de nombres de puesto (decididas por Leidy 2026-11-19). */
const ERRATAS_PUESTO: Record<string, string> = {
  TOPMOTORS: 'TOP MOTORS',
  'PARRILADA DEL SOL': 'PARRILLADA DEL SOL',
  'MATERIDAD DEL GUASMO': 'MATERNIDAD DEL GUASMO',
  'CEIBOS TORREE 2': 'CEIBOS TORRE 2',
};

export function corregirPuesto(p: string | null): { nombre: string | null; nota: string | null } {
  if (!p) return { nombre: null, nota: null };
  const nuevo = ERRATAS_PUESTO[norm(p)] ?? p;
  return { nombre: nuevo, nota: nuevo !== p ? `Nombre del puesto corregido: «${p}» → «${nuevo}».` : null };
}

/** «38SPL» y «38 SPL» son lo mismo: se unifica el espacio y las mayúsculas, sin cambiar el calibre. */
export function unificarCalibre(c: string | null): string | null {
  if (!c) return null;
  return c.replace(/\s+/g, '').toUpperCase().replace('SPL', ' SPL').replace('CAL12', 'CAL 12');
}

export function categoriaDe(c: string | null): CategoriaArma | null {
  if (!c) return null;
  const k = norm(c).replace(/[^A-Z0-9]+/g, '_');
  if (k === 'LETAL') return 'LETAL';
  if (k === 'TRAUMATICA') return 'TRAUMATICA';
  if (k === 'FOGUEO' || k === 'DE_FOGUEO') return 'FOGUEO';
  if (k === 'LETAL_MOVIL') return 'LETAL_MOVIL';
  return null;
}

const CLASES = ['PISTOLA', 'REVOLVER', 'ESCOPETA'] as const;

/** ¿Difieren en un solo carácter (misma longitud)? Para detectar «39 SPL» entre muchos «38 SPL». */
function unaLetraDistinta(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i] && ++d > 1) return false;
  return d === 1;
}

const recortar = (s: string) => (s.length > MAX_NOTA ? `${s.slice(0, MAX_NOTA - 1)}…` : s);

// ───────────────────────── armas ─────────────────────────

const HOJAS_ARMAS = ['CUSTODIA', 'PUBLICOS', 'PRIVADOS', 'RASTRILLO'] as const;

function leerArmas(libro: ExcelJS.Workbook, plan: PlanImportacion) {
  const crudas: (Omit<ArmaImport, 'notas' | 'marcadaParaCorregir' | 'calibre'> & {
    calibre: string | null;
    notasLista: string[];
    corregir: boolean;
    caducidadTexto: string | null;
  })[] = [];

  for (const hoja of HOJAS_ARMAS) {
    const ws = buscarHoja(libro, hoja);
    if (!ws) {
      plan.errores.push(`Falta la hoja «${hoja}» en el Excel.`);
      continue;
    }
    const t = leerTabla(ws);
    if (!t) {
      plan.errores.push(`No encontré la fila de títulos (con «ORD») en la hoja «${hoja}».`);
      continue;
    }
    const cSerie = colDe(t, 'SERIE');
    if (!cSerie) {
      plan.errores.push(`La hoja «${hoja}» no tiene la columna SERIE.`);
      continue;
    }
    const cPuesto = colDe(t, 'PUESTO', 'INSTALACION');
    const cTipo = colDe(t, 'TIPO');
    const cMarca = colDe(t, 'MARCA');
    const cCalibre = colDe(t, 'CALIBRE');
    const cCad = colDe(t, 'FECHA CADUCIDAD', 'CADUCA');
    const cCat = colDe(t, 'CATEGORIA');
    const cMun = colDe(t, 'MUNICIONES');
    const cCiudad = colDe(t, 'UBICACION');
    const leer = (r: number, c: number | null) => (c ? crudo(ws, r, c) : null);

    for (let r = t.primeraFila; r <= ultimaFila(ws); r++) {
      const serie = texto(leer(r, cSerie));
      const puestoCrudo = texto(leer(r, cPuesto));
      const tipo = texto(leer(r, cTipo));
      const marca = texto(leer(r, cMarca));
      if (!serie && !puestoCrudo && !tipo && !marca) continue; // fila numerada pero vacía
      if (!serie) {
        plan.errores.push(`Hoja ${hoja}, fila ${r}: tiene datos pero no tiene serie; no se carga.`);
        continue;
      }

      const notasLista: string[] = [];
      let corregir = false;
      const marcar = (msg: string) => {
        corregir = true;
        notasLista.unshift(`${NOTA_CORREGIR}: ${msg}`);
      };

      const claseTxt = tipo ? norm(tipo) : '';
      const clase = (CLASES as readonly string[]).includes(claseTxt) ? (claseTxt as ArmaImport['clase']) : 'OTRA';
      if (clase === 'OTRA') marcar(`el tipo decía «${tipo ?? 'vacío'}»; se cargó como «Otra».`);

      if (norm(serie) === 'BORROSO') marcar('la serie decía «BORROSO»; anotar el número real.');

      const cadCruda = leer(r, cCad);
      let permisoVence: string | null = null;
      let caducidadTexto: string | null = null;
      if (cadCruda instanceof Date) permisoVence = isoFecha(cadCruda);
      else {
        const t2 = texto(cadCruda);
        if (t2) {
          caducidadTexto = t2;
          marcar(`en la caducidad decía «${t2}», que no es una fecha; el vencimiento quedó vacío.`);
        }
      }

      const { nombre: puestoFix, nota: notaPuesto } = corregirPuesto(puestoCrudo);
      let puestoNombre = puestoFix;
      if (puestoCrudo && norm(puestoCrudo).startsWith('ENVIO')) {
        marcar(`el puesto decía «${puestoCrudo}»; confirmar dónde está el arma y su estado.`);
        puestoNombre = null;
      } else if (notaPuesto) notasLista.push(notaPuesto);

      const esCustodia = hoja === 'CUSTODIA';
      const asignada = (hoja === 'PUBLICOS' || hoja === 'PRIVADOS') && !!puestoNombre;
      if ((hoja === 'PUBLICOS' || hoja === 'PRIVADOS') && !puestoNombre && !puestoCrudo) {
        marcar('el Excel no trae el puesto; quedó disponible.');
      }

      const mun = numero(leer(r, cMun));
      crudas.push({
        hoja,
        fila: r,
        serie,
        clase,
        marca,
        calibre: unificarCalibre(texto(leer(r, cCalibre))),
        categoria: categoriaDe(texto(leer(r, cCat))),
        municiones: mun,
        ciudad: hoja === 'PUBLICOS' ? texto(leer(r, cCiudad)) : null,
        uso: esCustodia ? 'Custodia' : null,
        estado: asignada ? 'ASIGNADA' : 'DISPONIBLE',
        puestoNombre: asignada ? puestoNombre : null,
        permisoVence,
        notasLista,
        corregir,
        caducidadTexto,
      });
      const cat = texto(leer(r, cCat));
      if (cat && !categoriaDe(cat)) plan.avisos.push(`Hoja ${hoja}, fila ${r}: la categoría «${cat}» no es una de las conocidas; quedó vacía.`);
    }
  }

  // Calibre que aparece una sola vez y se parece a uno muy común (p. ej. «39 SPL» entre «38 SPL»).
  const frecuencia = new Map<string, number>();
  for (const a of crudas) if (a.calibre) frecuencia.set(a.calibre, (frecuencia.get(a.calibre) ?? 0) + 1);
  for (const a of crudas) {
    if (!a.calibre || frecuencia.get(a.calibre) !== 1) continue;
    const parecido = [...frecuencia].find(([c, n]) => n >= 3 && unaLetraDistinta(a.calibre as string, c));
    if (parecido) {
      a.corregir = true;
      a.notasLista.unshift(`${NOTA_CORREGIR}: el calibre decía «${a.calibre}»; los demás son «${parecido[0]}», posible error de digitación.`);
    }
  }

  // Una serie repetida es una sola arma: se queda la primera (las hojas van en orden CUSTODIA, PUBLICOS, PRIVADOS, RASTRILLO).
  const vistas = new Map<string, (typeof crudas)[number]>();
  for (const a of crudas) {
    const k = a.serie.toUpperCase();
    const previa = vistas.get(k);
    if (previa) {
      previa.notasLista.push(`Estaba repetida en las hojas ${previa.hoja} y ${a.hoja} del Excel; se cargó una sola vez.`);
      continue;
    }
    vistas.set(k, a);
  }

  for (const a of vistas.values()) {
    plan.armas.push({
      hoja: a.hoja,
      fila: a.fila,
      serie: a.serie,
      clase: a.clase,
      marca: a.marca,
      calibre: a.calibre,
      categoria: a.categoria,
      municiones: a.municiones,
      ciudad: a.ciudad,
      uso: a.uso,
      estado: a.estado,
      puestoNombre: a.puestoNombre,
      permisoVence: a.permisoVence,
      notas: a.notasLista.length ? recortar(a.notasLista.join(' | ')) : null,
      marcadaParaCorregir: a.corregir,
    });
  }
}

// ───────────────────────── chalecos ─────────────────────────

function leerChalecos(libro: ExcelJS.Workbook, plan: PlanImportacion) {
  const ws = buscarHoja(libro, 'KEBLATS') ?? buscarHoja(libro, 'CHALECOS');
  if (!ws) {
    plan.errores.push('Falta la hoja de chalecos («KEBLATS») en el Excel.');
    return;
  }
  const t = leerTabla(ws);
  const cCant = t ? colDe(t, 'CANTIDAD') : null;
  if (!t || !cCant) {
    plan.errores.push('No encontré la columna CANTIDAD en la hoja de chalecos.');
    return;
  }
  const cCiudad = colDe(t, 'UBICACION');
  const cPuesto = colDe(t, 'PUESTO');
  const cTipo = colDe(t, 'TIPO');
  const cMarca = colDe(t, 'MARCA');
  const cCad = colDe(t, 'FECHA CADUCIDAD', 'CADUCA');
  const cSerie = colDe(t, 'SERIE');
  const leer = (r: number, c: number | null) => (c ? crudo(ws, r, c) : null);

  let tipoChaleco: string | null = null;
  for (let r = t.primeraFila; r <= ultimaFila(ws); r++) {
    const ord = texto(crudo(ws, r, t.col['ORD']));
    if (ord && norm(ord) === 'TOTAL') break;
    const puestoCrudo = texto(leer(r, cPuesto));
    const ciudad = texto(leer(r, cCiudad));
    const serie = texto(leer(r, cSerie));
    const cantCruda = leer(r, cCant);
    const cantidad = numero(cantCruda);
    if (!puestoCrudo && !ciudad && !serie && cantCruda == null) continue;

    // Sin cantidad (o en 0) no hay chalecos que cargar: queda en 0, sin suponer uno por fila (decisión de Leidy).
    if (!cantidad) {
      plan.chalecos.filasEnCero++;
      continue;
    }

    tipoChaleco = tipoChaleco ?? texto(leer(r, cTipo));
    const { nombre: puesto, nota: notaPuesto } = corregirPuesto(puestoCrudo);
    const marca = texto(leer(r, cMarca));
    const cad = texto(leer(r, cCad));
    const nota = texto(crudo(ws, r, cCant + 1));

    const partes = ['Carga inicial desde el Excel de Operaciones.'];
    if (marca) partes.push(`Marca ${marca}.`);
    if (serie) partes.push(`Serie ${serie}.`);
    if (cad) partes.push(`Caduca ${cad}.`);
    if (nota) partes.push(`Nota del Excel: ${nota}.`);
    if (notaPuesto) partes.push(notaPuesto);
    if (!puesto) {
      partes.push(`${NOTA_CORREGIR}: el Excel solo dice «${ciudad ?? 'sin ubicación'}» y no trae el nombre del puesto.`);
    }

    const esBodega = !!puesto && norm(puesto) === 'RASTRILLO';
    plan.chalecos.filas.push({
      fila: r,
      puestoNombre: esBodega ? null : (puesto ?? ciudad),
      ciudad,
      cantidad,
      destino: esBodega ? 'BODEGA' : 'PUESTO',
      detalle: partes.join(' '),
    });
  }
  plan.chalecos.articulo = `Chaleco nivel ${tipoChaleco ?? 'IIIA'}`;
}

// ───────────────────────── accesorios ─────────────────────────

const ERRATAS_ACCESORIO = /MUNICUON|MUNICIION/g;

function leerAccesorios(libro: ExcelJS.Workbook, plan: PlanImportacion) {
  const ws = buscarHoja(libro, 'ACCESORIOS');
  if (!ws) {
    plan.errores.push('Falta la hoja «ACCESORIOS» en el Excel.');
    return;
  }
  const t = leerTabla(ws);
  const cTipo = t ? colDe(t, 'TIPO') : null;
  const cCant = t ? colDe(t, 'CANTIDAD') : null;
  const cCat = t ? colDe(t, 'CATEGORIA') : null;
  if (!t || !cTipo || !cCant) {
    plan.errores.push('No encontré las columnas TIPO y CANTIDAD en la hoja de accesorios.');
    return;
  }
  for (let r = t.primeraFila; r <= ultimaFila(ws); r++) {
    const tipoTxt = texto(crudo(ws, r, cTipo));
    if (!tipoTxt) continue;
    const cantidad = numero(crudo(ws, r, cCant));
    if (!cantidad) {
      plan.accesorios.sinCantidad++;
      continue;
    }
    const nombre = tipoTxt.toUpperCase().replace(ERRATAS_ACCESORIO, 'MUNICION');
    plan.accesorios.items.push({
      fila: r,
      tipo: /MUNIC|CARTUCH/.test(nombre) ? 'MUNICION' : 'IMPLEMENTO',
      nombre,
      variante: texto(cCat ? crudo(ws, r, cCat) : null)?.toUpperCase() ?? '',
      cantidad,
    });
  }
}

// ───────────────────────── plan ─────────────────────────

export function planDesdeLibro(libro: ExcelJS.Workbook): PlanImportacion {
  const plan: PlanImportacion = {
    armas: [],
    chalecos: { articulo: 'Chaleco nivel IIIA', filas: [], filasEnCero: 0 },
    accesorios: { items: [], sinCantidad: 0 },
    avisos: [
      'La «fecha de caducidad» de las armas se guarda como vencimiento del permiso. Falta confirmar con Operaciones que eso es lo que significa.',
    ],
    errores: [],
  };
  leerArmas(libro, plan);
  leerChalecos(libro, plan);
  leerAccesorios(libro, plan);
  return plan;
}
