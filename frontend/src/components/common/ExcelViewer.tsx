import { useMemo, useRef, useState, type CSSProperties } from 'react';
import { Download, FileText, Minus, Plus } from 'lucide-react';
import type { CeldaExcel, EstiloCeldaExcel, HojaExcel, LibroExcel } from '../../types/libro-excel';

/** Medidas fijas de los encabezados (letras de columna y números de fila), en px. */
const ALTO_ENCABEZADO = 24;
const ANCHO_NUMERO_FILA = 46;
/** Alto de fila que usa Excel cuando el archivo no dice otro (15 pt). */
const ALTO_FILA_DEFECTO = 20;
const ZOOMS = [50, 75, 90, 100, 125, 150, 200];

/** 0 → A, 25 → Z, 26 → AA. */
export function letraColumna(indice: number): string {
  let n = indice + 1;
  let letras = '';
  while (n > 0) {
    const resto = (n - 1) % 26;
    letras = String.fromCharCode(65 + resto) + letras;
    n = Math.floor((n - 1) / 26);
  }
  return letras;
}

/** Estilo CSS de una celda a partir del estilo compacto que manda el servidor. */
function estiloCss(e: EstiloCeldaExcel, sticky: boolean): CSSProperties {
  const css: CSSProperties = {};
  if (e.f) css.background = e.f;
  else if (sticky) css.background = '#fff'; // una celda fija sin fondo dejaría ver lo que pasa por debajo
  if (e.c) css.color = e.c;
  if (e.b) css.fontWeight = 700;
  if (e.i) css.fontStyle = 'italic';
  if (e.u || e.t) css.textDecoration = [e.u ? 'underline' : '', e.t ? 'line-through' : ''].filter(Boolean).join(' ');
  if (e.s) css.fontSize = `${Math.round((e.s * 13) / 11)}px`; // 11 pt = 13 px, la base de la cuadrícula
  if (e.h) css.textAlign = e.h;
  if (e.v) css.verticalAlign = e.v;
  if (e.w) {
    css.whiteSpace = 'pre-wrap';
    css.overflowWrap = 'anywhere';
  }
  if (e.bt) css.borderTop = e.bt;
  if (e.bl) css.borderLeft = e.bl;
  if (e.bb) css.borderBottom = e.bb;
  if (e.br) css.borderRight = e.br;
  return css;
}

/**
 * Arma el HTML de una hoja. Es caro (miles de celdas), así que se hace una vez por
 * hoja y se guarda: elegir una celda o cambiar el zoom no lo vuelve a dibujar.
 */
function construirTabla(hoja: HojaExcel, estilos: EstiloCeldaExcel[]) {
  const ocultasFila = new Set(hoja.filasOcultas);
  const ocultasCol = new Set(hoja.columnasOcultas);
  const columnas = Array.from({ length: hoja.columnas }, (_, c) => c).filter((c) => !ocultasCol.has(c));
  const filas = Array.from({ length: hoja.filas }, (_, r) => r).filter((r) => !ocultasFila.has(r));
  const clave = (r: number, c: number) => r * 1000 + c;

  const porCelda = new Map<number, CeldaExcel>();
  for (const celda of hoja.celdas) porCelda.set(clave(celda[0], celda[1]), celda);

  // Celdas combinadas: la principal ocupa el rango; las demás no se dibujan.
  const principal = new Map<number, { filas: number; columnas: number }>();
  const cubiertas = new Set<number>();
  for (const [r1, c1, r2, c2] of hoja.combinadas) {
    const nFilas = filas.filter((r) => r >= r1 && r <= r2).length;
    const nCols = columnas.filter((c) => c >= c1 && c <= c2).length;
    if (nFilas === 0 || nCols === 0) continue;
    principal.set(clave(r1, c1), { filas: nFilas, columnas: nCols });
    for (let r = r1; r <= r2; r++) {
      for (let c = c1; c <= c2; c++) if (r !== r1 || c !== c1) cubiertas.add(clave(r, c));
    }
  }

  // Paneles congelados: filas/columnas que no se mueven al desplazarse.
  const congFilas = filas.filter((r) => r < hoja.congeladas.filas);
  const congCols = columnas.filter((c) => c < hoja.congeladas.columnas);
  const topDe = new Map<number, number>();
  let acumuladoTop = ALTO_ENCABEZADO;
  for (const r of congFilas) {
    topDe.set(r, acumuladoTop);
    acumuladoTop += hoja.altos[r] ?? ALTO_FILA_DEFECTO;
  }
  const leftDe = new Map<number, number>();
  let acumuladoLeft = ANCHO_NUMERO_FILA;
  for (const c of congCols) {
    leftDe.set(c, acumuladoLeft);
    acumuladoLeft += hoja.anchos[c];
  }
  const ultimaFilaCong = congFilas[congFilas.length - 1];
  const ultimaColCong = congCols[congCols.length - 1];

  const anchoTotal = ANCHO_NUMERO_FILA + columnas.reduce((suma, c) => suma + hoja.anchos[c], 0);

  return (
    <table className="xl-table" style={{ width: anchoTotal }}>
      <colgroup>
        <col style={{ width: ANCHO_NUMERO_FILA }} />
        {columnas.map((c) => <col key={c} style={{ width: hoja.anchos[c] }} />)}
      </colgroup>
      <thead>
        <tr style={{ height: ALTO_ENCABEZADO }}>
          <th className="xl-esquina" />
          {columnas.map((c) => (
            <th
              key={c}
              className="xl-colhead"
              style={leftDe.has(c) ? { left: leftDe.get(c), zIndex: 5 } : undefined}
            >
              {letraColumna(c)}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {filas.map((r) => {
          const topFila = topDe.get(r);
          return (
            <tr key={r} style={{ height: hoja.altos[r] ?? ALTO_FILA_DEFECTO }}>
              <th className="xl-rowhead" style={topFila !== undefined ? { top: topFila, zIndex: 5 } : undefined}>{r + 1}</th>
              {columnas.map((c, posicion) => {
                const k = clave(r, c);
                if (cubiertas.has(k)) return null;
                const celda = porCelda.get(k);
                const estilo = estilos[celda?.[3] ?? 0] ?? {};
                const span = principal.get(k);
                const leftC = leftDe.get(c);
                const fija = topFila !== undefined || leftC !== undefined;

                // El texto largo se desborda sobre la celda vacía de al lado, como en Excel.
                const derecha = columnas[posicion + 1];
                const siguiente = derecha === undefined ? undefined : porCelda.get(clave(r, derecha));
                const desborda =
                  !!celda?.[2] &&
                  !estilo.w &&
                  (!estilo.h || estilo.h === 'left') &&
                  derecha !== undefined &&
                  !cubiertas.has(clave(r, derecha)) &&
                  (!siguiente || (siguiente[2] === '' && !(estilos[siguiente[3]]?.f)));

                const css: CSSProperties = estiloCss(estilo, fija);
                if (topFila !== undefined) css.top = topFila;
                if (leftC !== undefined) css.left = leftC;
                if (desborda) css.overflow = 'visible';
                if (r === ultimaFilaCong && !estilo.bb) css.borderBottom = '2px solid #bdc1c6';
                if (c === ultimaColCong && !estilo.br) css.borderRight = '2px solid #bdc1c6';

                return (
                  <td
                    key={c}
                    data-r={r}
                    data-c={c}
                    className={`xl-cell${fija ? ' xl-cell--fija' : ''}${topFila !== undefined && leftC !== undefined ? ' xl-cell--fija2' : ''}`}
                    rowSpan={span && span.filas > 1 ? span.filas : undefined}
                    colSpan={span && span.columnas > 1 ? span.columnas : undefined}
                    style={css}
                  >
                    {celda?.[2]}
                  </td>
                );
              })}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

/**
 * Vista de un Excel (.xlsx) parecida a la de Drive: cuadrícula con letras y números
 * de fila que no se mueven, paneles congelados, pestañas por hoja, colores, bordes y
 * celdas combinadas. Es solo lectura. Elegir una celda muestra su contenido completo
 * arriba; las flechas del teclado mueven la selección y Ctrl+F busca en la hoja
 * (es una tabla normal, el buscador del navegador la encuentra).
 */
export default function ExcelViewer({
  libro,
  onVerPdf,
  onDescargar,
}: {
  libro: LibroExcel;
  /** Pasa a mostrar el mismo archivo como PDF (por si la cuadrícula no basta). */
  onVerPdf?: () => void;
  /** Descarga el archivo original. */
  onDescargar?: () => void;
}) {
  const [hojaIdx, setHojaIdx] = useState(0);
  const [zoom, setZoom] = useState(100);
  const [seleccion, setSeleccion] = useState<{ r: number; c: number; texto: string } | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const celdaMarcada = useRef<HTMLElement | null>(null);

  const hoja = libro.hojas[Math.min(hojaIdx, libro.hojas.length - 1)];
  const tabla = useMemo(() => construirTabla(hoja, libro.estilos), [hoja, libro.estilos]);
  const celdas = useMemo(() => {
    const mapa = new Map<string, string>();
    for (const [r, c, texto] of hoja.celdas) mapa.set(`${r},${c}`, texto);
    return mapa;
  }, [hoja]);

  const marcar = (td: HTMLElement | null) => {
    celdaMarcada.current?.classList.remove('xl-cell--sel');
    celdaMarcada.current = td;
    if (!td) {
      setSeleccion(null);
      return;
    }
    td.classList.add('xl-cell--sel');
    const r = Number(td.dataset.r);
    const c = Number(td.dataset.c);
    setSeleccion({ r, c, texto: celdas.get(`${r},${c}`) ?? '' });
  };

  const alHacerClic = (ev: React.MouseEvent) => {
    const td = (ev.target as HTMLElement).closest('td[data-r]') as HTMLElement | null;
    if (td) marcar(td);
  };

  // Flechas: mueven a la celda de al lado que exista en pantalla (salta las ocultas).
  const alPulsarTecla = (ev: React.KeyboardEvent) => {
    const delta: Record<string, [number, number]> = {
      ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1],
    };
    const d = delta[ev.key];
    if (!d || !gridRef.current) return;
    ev.preventDefault();
    let { r, c } = seleccion ?? { r: 0, c: 0 };
    if (!seleccion) {
      const primera = gridRef.current.querySelector<HTMLElement>('td[data-r]');
      if (primera) marcar(primera);
      return;
    }
    for (let paso = 0; paso < Math.max(hoja.filas, hoja.columnas); paso++) {
      r += d[0];
      c += d[1];
      if (r < 0 || c < 0 || r >= hoja.filas || c >= hoja.columnas) return;
      const td = gridRef.current.querySelector<HTMLElement>(`td[data-r="${r}"][data-c="${c}"]`);
      if (td) {
        marcar(td);
        td.scrollIntoView({ block: 'nearest', inline: 'nearest' });
        return;
      }
    }
  };

  const cambiarHoja = (i: number) => {
    celdaMarcada.current = null;
    setSeleccion(null);
    setHojaIdx(i);
    gridRef.current?.scrollTo({ top: 0, left: 0 });
  };

  const pasoZoom = (sentido: 1 | -1) => {
    const actual = ZOOMS.indexOf(zoom);
    const nuevo = ZOOMS[Math.max(0, Math.min(ZOOMS.length - 1, actual + sentido))];
    setZoom(nuevo);
  };

  const recortada = hoja.filasTotales > hoja.filas || hoja.columnasTotales > hoja.columnas;

  return (
    <div className="xl-viewer">
      <div className="xl-barra">
        <span className="xl-direccion" title="Celda seleccionada">
          {seleccion ? `${letraColumna(seleccion.c)}${seleccion.r + 1}` : '—'}
        </span>
        <span className="xl-contenido" title={seleccion?.texto}>
          {seleccion ? seleccion.texto || '(vacía)' : 'Haz clic en una celda para ver su contenido'}
        </span>
        <div className="xl-zoom">
          <button type="button" className="btn-secondary icon-btn" title="Alejar" aria-label="Alejar" onClick={() => pasoZoom(-1)} disabled={zoom === ZOOMS[0]}>
            <Minus size={14} />
          </button>
          <span>{zoom}%</span>
          <button type="button" className="btn-secondary icon-btn" title="Acercar" aria-label="Acercar" onClick={() => pasoZoom(1)} disabled={zoom === ZOOMS[ZOOMS.length - 1]}>
            <Plus size={14} />
          </button>
        </div>
      </div>

      <div
        ref={gridRef}
        className="xl-grid"
        tabIndex={0}
        onClick={alHacerClic}
        onKeyDown={alPulsarTecla}
        aria-label={`Hoja ${hoja.nombre}`}
      >
        <div style={{ zoom: zoom / 100 }}>{tabla}</div>
      </div>

      {recortada && (
        <div className="xl-aviso">
          Se muestran las primeras {hoja.filas.toLocaleString('es')} filas y {hoja.columnas} columnas de {hoja.filasTotales.toLocaleString('es')} × {hoja.columnasTotales}. Descarga el archivo para ver todo.
        </div>
      )}

      <div className="xl-pie">
        <div className="xl-pestanas" role="tablist">
          {libro.hojas.map((h, i) => (
            <button
              key={h.nombre}
              type="button"
              role="tab"
              aria-selected={i === hojaIdx}
              className={`xl-pestana${i === hojaIdx ? ' xl-pestana--activa' : ''}`}
              onClick={() => cambiarHoja(i)}
              title={h.nombre}
            >
              {h.nombre}
            </button>
          ))}
        </div>
        <div className="xl-acciones">
          {onVerPdf && (
            <button type="button" className="btn-secondary btn-compacto" onClick={onVerPdf} title="Ver este archivo como PDF">
              <FileText size={13} /> Ver como PDF
            </button>
          )}
          {onDescargar && (
            <button type="button" className="btn-secondary btn-compacto" onClick={onDescargar} title="Descargar el archivo original">
              <Download size={13} /> Descargar
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
