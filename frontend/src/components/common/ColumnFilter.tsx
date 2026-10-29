import { useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { ArrowDown, ArrowUp, ChevronDown, ListFilter, Search, X } from 'lucide-react';
import type { ControlFiltros, ColumnFilters } from '../../hooks/useColumnFilters';
import type { ControlOrden } from '../../hooks/useSortableTable';
import { normalizar, numeroDeTexto, type OpcionValor } from '../../utils/columnFilters';
import {
  ATAJOS_FECHA,
  FILTRO_FECHA_VACIO,
  rangoDeAtajo,
  type AtajoFecha,
  type FiltroFechaValor,
} from '../../utils/rangoFechas';
import '../../styles/columnFilters.css';

/**
 * FILTROS DENTRO DE LA CABECERA DE LAS COLUMNAS (como Excel, Google Sheets, Airtable o HubSpot).
 *
 * Cada columna filtrable lleva junto a su título un pequeño embudo. Al pulsarlo se abre un panel
 * anclado a esa columna; el filtro se aplica al instante (no hay botón «Aplicar»). Una columna con
 * filtro activo se ve de un vistazo: embudo naranja con su contador y una línea naranja bajo el título.
 * Los filtros activos se repiten, quitables uno a uno, en la fila de chips (`<ChipsFiltros>`).
 *
 * Qué panel sale lo decide el `tipo` de la columna:
 *  - 'valores' → lista de casillas con buscador, «Seleccionar todo / Ninguno», conteo por valor y
 *    «Solo» (deja únicamente ese valor). Para etapa, responsable, fuente, estado, servicio…
 *  - 'fecha'   → atajos (Hoy, Esta semana, Este mes…) y Desde/Hasta. Mismos periodos que el Dashboard.
 *  - 'numero'  → mínimo y máximo.
 *  - 'texto'   → caja «contiene».
 *
 * CÓMO USARLO (3 pasos; ver también useColumnFilters):
 *
 *   const cf = useColumnFilters(leads, [
 *     { key: 'estado', etiqueta: 'Estado', tipo: 'valores', getValues: (l) => ({ valor: l.status, etiqueta: ESTADO[l.status] }) },
 *     { key: 'llego',  etiqueta: 'Llegó',  tipo: 'fecha',   getValue: (l) => l.createdAt },
 *   ]);
 *   const { filas, thProps, ordenDe } = useSortableTable(cf.filas, { … });           // 1. filtrar y luego ordenar
 *
 *   <th {...thProps('estado')}>Estado <ColumnFilter cf={cf} col="estado" orden={ordenDe('estado')} /></th>   // 2. el botón
 *
 *   <ChipsFiltros cf={cf} />                                                          // 3. chips bajo la barra
 *   <ClearFiltersButton onClear={cf.limpiar} disabled={!cf.hayFiltros} />
 *
 * UN SOLO BOTÓN POR COLUMNA (ordenar + filtrar), ESTÁNDAR DE TODA TABLA: pasa `orden` y el mismo
 * botón de la cabecera abre un panel con «Ordenar» (dos direcciones; pulsar la activa la quita) y, debajo, el filtro.
 * El orden se pide de dos maneras:
 *  - Pantalla simple (la mayoría: Cacao, Custodias…): `orden={cf.ordenDe('estado')}`. `useColumnFilters` ordena `cf.filas`
 *    con el mismo valor que la columna ya declaró para filtrar; no hay que repetir nada ni usar `useSortableTable`.
 *  - Pantalla que ya ordena con `useSortableTable` (atajo: clic en el título, orden inicial, columnas calculadas):
 *    `orden={ordenDe('estado')}` del hook, y la columna entra en su mapa de campos.
 * No mezcles las dos en una misma tabla: el orden del hook de filtros se aplica antes y el de `useSortableTable` encima.
 * El botón dice de un vistazo qué le pasa a la columna: una flecha si ordena, un embudo naranja si filtra, las dos
 * si hace ambas, o una flecha hacia abajo si no hace nada. En ese modo la pantalla NO dibuja `<SortIcon>`: el
 * indicador de orden vive en el botón (y así no se pierde cuando la cabecera es estrecha). Una columna sin filtro
 * (no declarada en `useColumnFilters`) también puede llevarlo: pasa `etiqueta` y solo muestra «Ordenar».
 *
 *   <th {...thProps('estado')}>Estado <ColumnFilter cf={cf} col="estado" orden={ordenDe('estado')} /></th>
 *
 * Reglas para la pantalla:
 *  - La tabla NO debe desmontarse cuando el filtro deja 0 filas: sin cabecera no habría dónde cambiar el
 *    filtro. Deja el <thead> y pon una fila «No hay … que coincidan» (con un botón para limpiar).
 *  - `<ColumnFilter>` va DENTRO del <th> (sigue a `<SortIcon>`); no ordena ni arrastra el ancho.
 *  - Una columna con DOS datos filtrables (Ubicación: provincia y ciudad) lleva dos embudos; el segundo, con `segundo`,
 *    se dibuja a la izquierda del primero.
 *  - Si la columna no se declaró en `useColumnFilters`, `<ColumnFilter>` no dibuja nada.
 *  - Lo que se exporta con `ExportTableButton` son las filas ya filtradas y ordenadas.
 *
 * El panel se dibuja en un portal en <body> (las tablas vivas recortan lo que se sale de su ventana),
 * se coloca debajo de la columna —o arriba si abajo no cabe—, sigue a su columna si la tabla se
 * desplaza y se cierra con Esc o con un clic fuera.
 */

const MARGEN = 8;
const SEPARACION = 6;

export default function ColumnFilter({
  cf, col, segundo = false, orden, etiqueta: etiquetaColumna,
}: {
  cf: ControlFiltros;
  col: string;
  segundo?: boolean;
  /** Si se pasa, el botón también ordena (ver «UN SOLO BOTÓN POR COLUMNA»). */
  orden?: ControlOrden;
  /** Nombre de la columna cuando no se declaró en useColumnFilters (solo ordena). */
  etiqueta?: string;
}) {
  const [abierto, setAbierto] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number; maxHeight: number } | null>(null);
  const botonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const titulo = useId();

  const existe = cf.tiene(col);
  const filtro = existe ? cf.filtro(col) : undefined;
  const activo = !!filtro;

  // Posición: debajo de la celda de cabecera, alineado a su borde izquierdo; si no cabe, arriba.
  useLayoutEffect(() => {
    if (!abierto) {
      setCoords(null);
      return;
    }
    const colocar = () => {
      const boton = botonRef.current;
      const panel = panelRef.current;
      if (!boton || !panel) return;
      const celda = (boton.closest('th') as HTMLElement | null) ?? boton;
      const ancla = celda.getBoundingClientRect();
      const ventana = boton.closest('.tasks-table-wrapper')?.getBoundingClientRect();
      // La columna salió de la vista al desplazar la tabla: se cierra en vez de quedar flotando.
      if (ventana && (ancla.right <= ventana.left + 24 || ancla.left >= ventana.right - 24 || ancla.bottom <= ventana.top || ancla.top >= ventana.bottom)) {
        setAbierto(false);
        return;
      }
      const ancho = panel.offsetWidth;
      // Alto natural del panel: se quita el tope un instante para medirlo (no hay repintado entre medias).
      const topeActual = panel.style.maxHeight;
      panel.style.maxHeight = 'none';
      const alto = panel.offsetHeight;
      panel.style.maxHeight = topeActual;
      const debajo = window.innerHeight - ancla.bottom - SEPARACION - MARGEN;
      const arriba = ancla.top - SEPARACION - MARGEN;
      const haciaArriba = alto > debajo && arriba > debajo;
      const disponible = Math.max(180, haciaArriba ? arriba : debajo);
      const alturaFinal = Math.min(alto, disponible);
      const top = haciaArriba ? ancla.top - SEPARACION - alturaFinal : ancla.bottom + SEPARACION;
      const left = Math.max(MARGEN, Math.min(ancla.left, window.innerWidth - ancho - MARGEN));
      setCoords((previo) =>
        previo && previo.top === top && previo.left === left && previo.maxHeight === disponible ? previo : { top, left, maxHeight: disponible },
      );
    };
    colocar();
    const alDesplazar = (e: Event) => {
      // El desplazamiento de la lista de casillas de adentro no mueve el panel.
      if (panelRef.current && e.target instanceof Node && panelRef.current.contains(e.target)) return;
      colocar();
    };
    window.addEventListener('resize', colocar);
    window.addEventListener('scroll', alDesplazar, true);
    // El panel cambia de alto al buscar o al elegir un atajo: se recoloca (importa cuando abre hacia arriba).
    const observador = panelRef.current ? new ResizeObserver(colocar) : null;
    if (panelRef.current) observador?.observe(panelRef.current);
    return () => {
      window.removeEventListener('resize', colocar);
      window.removeEventListener('scroll', alDesplazar, true);
      observador?.disconnect();
    };
  }, [abierto]);

  // Clic fuera y Esc cierran; Esc devuelve el foco al embudo.
  useEffect(() => {
    if (!abierto) return;
    const alPulsar = (e: MouseEvent) => {
      const objetivo = e.target as Node;
      if (botonRef.current?.contains(objetivo) || panelRef.current?.contains(objetivo)) return;
      setAbierto(false);
    };
    const alTeclear = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setAbierto(false);
      botonRef.current?.focus();
    };
    document.addEventListener('mousedown', alPulsar);
    document.addEventListener('keydown', alTeclear);
    return () => {
      document.removeEventListener('mousedown', alPulsar);
      document.removeEventListener('keydown', alTeclear);
    };
  }, [abierto]);

  // Al abrir, el foco va al primer campo (buscador, fecha…).
  useEffect(() => {
    if (!abierto || !coords) return;
    const panel = panelRef.current;
    if (!panel || panel.contains(document.activeElement)) return;
    const primero = panel.querySelector<HTMLElement>('[data-cf-foco]') ?? panel;
    primero.focus({ preventScroll: true });
    // Solo la primera vez que se coloca.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abierto, coords === null]);

  if (!existe && !orden) return null;

  const etiqueta = existe ? cf.etiqueta(col) : (etiquetaColumna ?? col);
  const tipo = existe ? cf.tipo(col) : 'texto';
  const contador = filtro?.tipo === 'valores' && filtro.incluir.length >= 2 ? filtro.incluir.length : null;
  const resumen = activo ? cf.describir(col) : '';
  const direccion = orden?.activo ?? null;
  // Cómo se llaman las dos direcciones según lo que hay en la columna (si la pantalla no lo dice).
  // Son textos CORTOS: las dos direcciones van lado a lado en una sola línea para que «Ordenar» ocupe poco del panel.
  const nombresOrden: [string, string] = orden?.etiquetas
    ?? (tipo === 'numero' ? ['Menor a mayor', 'Mayor a menor']
      : tipo === 'fecha' ? ['Antiguo primero', 'Reciente primero']
        : ['A → Z', 'Z → A']);
  const partesEstado = [
    direccion ? `ordenada: ${direccion === 'asc' ? nombresOrden[0] : nombresOrden[1]}` : '',
    activo ? `filtrada: ${resumen}` : '',
  ].filter(Boolean);
  const textoBoton = partesEstado.length > 0
    ? `${etiqueta} (${partesEstado.join('; ')})`
    : orden && existe ? `Ordenar y filtrar ${etiqueta}` : orden ? `Ordenar ${etiqueta}` : `Filtrar por ${etiqueta}`;
  // Enter y espacio en el embudo (o dentro del panel) no deben llegar al <th>: ordenaría la columna. Como al frenar
  // el evento tampoco llega al listener de Esc del documento, Esc se atiende aquí mismo.
  const frenarTecla = (e: ReactKeyboardEvent) => {
    e.stopPropagation();
    if (e.key === 'Escape' && abierto) {
      setAbierto(false);
      botonRef.current?.focus();
    }
  };

  return (
    <>
      <button
        ref={botonRef}
        type="button"
        className={`cf-btn${segundo ? ' cf-btn--segundo' : ''}${activo ? ' cf-btn--activo' : ''}${direccion ? ' cf-btn--ordenado' : ''}${activo && direccion ? ' cf-btn--doble' : ''}${abierto ? ' cf-btn--abierto' : ''}`}
        aria-haspopup="dialog"
        aria-expanded={abierto}
        aria-label={textoBoton}
        title={textoBoton}
        onClick={(e) => { e.stopPropagation(); setAbierto((v) => !v); }}
        onKeyDown={frenarTecla}
      >
        {direccion === 'asc' && <ArrowUp size={13} aria-hidden />}
        {direccion === 'desc' && <ArrowDown size={13} aria-hidden />}
        {(activo || (!orden && !direccion)) && <ListFilter size={13} aria-hidden />}
        {orden && !direccion && !activo && <ChevronDown size={14} aria-hidden />}
        {activo && <span className={contador ? 'cf-insignia' : 'cf-punto'} aria-hidden>{contador}</span>}
      </button>

      {abierto && createPortal(
        // Un portal de React sigue siendo hijo del <th> para los eventos: sin frenarlos, un clic o una tecla
        // dentro del panel ordenaría la columna.
        <div
          ref={panelRef}
          role="dialog"
          aria-labelledby={titulo}
          tabIndex={-1}
          className={`cf-panel cf-panel--${tipo}`}
          style={{ top: coords?.top ?? -9999, left: coords?.left ?? -9999, maxHeight: coords?.maxHeight, visibility: coords ? 'visible' : 'hidden' }}
          onClick={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
          onKeyDown={frenarTecla}
        >
          <div className="cf-cabecera">
            <span id={titulo} className="cf-titulo">{orden ? etiqueta : `Filtrar: ${etiqueta}`}</span>
            <button type="button" className="cf-cerrar" onClick={() => { setAbierto(false); botonRef.current?.focus(); }} aria-label="Cerrar">
              <X size={14} aria-hidden />
            </button>
          </div>

          {orden && (
            <div className="cf-orden" role="group" aria-label={`Ordenar ${etiqueta}`}>
              {([ 'asc', 'desc' ] as const).map((dir, i) => (
                <button
                  key={dir}
                  type="button"
                  data-cf-foco={i === 0 ? '' : undefined}
                  className={`cf-orden-op${direccion === dir ? ' cf-orden-op--activo' : ''}`}
                  aria-pressed={direccion === dir}
                  title={direccion === dir ? `Quitar el orden (${nombresOrden[i]})` : `Ordenar: ${nombresOrden[i]}`}
                  // Pulsar la dirección que ya está puesta quita el orden de esta columna.
                  onClick={() => orden.fijar(direccion === dir ? null : dir)}
                >
                  {dir === 'asc' ? <ArrowUp size={14} aria-hidden /> : <ArrowDown size={14} aria-hidden />}
                  <span>{nombresOrden[i]}</span>
                </button>
              ))}
            </div>
          )}

          {existe && tipo === 'valores' && <PanelValores cf={cf} col={col} />}
          {existe && tipo === 'fecha' && <PanelFecha cf={cf} col={col} etiqueta={etiqueta} />}
          {existe && tipo === 'numero' && <PanelNumero cf={cf} col={col} etiqueta={etiqueta} />}
          {existe && tipo === 'texto' && <PanelTexto cf={cf} col={col} etiqueta={etiqueta} cerrar={() => { setAbierto(false); botonRef.current?.focus(); }} />}

          <div className="cf-pie">
            {existe ? (
              <button type="button" className="cf-link" onClick={() => cf.fijar(col, null)} disabled={!activo}>
                Limpiar filtro
              </button>
            ) : <span />}
            <button type="button" className="cf-listo" onClick={() => { setAbierto(false); botonRef.current?.focus(); }}>
              Listo
            </button>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}

// ---------------- 'valores': casillas ----------------

function PanelValores({ cf, col }: { cf: ControlFiltros; col: string }) {
  const [busqueda, setBusqueda] = useState('');
  const opciones = cf.opciones(col);
  const filtro = cf.filtro(col);
  // Sin filtro todas están marcadas (como en Excel); con filtro, las elegidas.
  const marcados = new Set(filtro?.tipo === 'valores' ? filtro.incluir : opciones.map((o) => o.valor));
  const q = normalizar(busqueda.trim());
  const visibles = q ? opciones.filter((o) => normalizar(o.etiqueta).includes(q)) : opciones;

  // Si quedan marcadas todas las casillas, ya no hay filtro.
  const aplicar = (nuevo: Set<string>) => {
    const todas = opciones.every((o) => nuevo.has(o.valor));
    cf.fijar(col, todas ? null : { tipo: 'valores', incluir: [...nuevo] });
  };
  const alternar = (o: OpcionValor) => {
    const nuevo = new Set(marcados);
    if (nuevo.has(o.valor)) nuevo.delete(o.valor);
    else nuevo.add(o.valor);
    aplicar(nuevo);
  };
  const marcarVisibles = (marcar: boolean) => {
    const nuevo = new Set(marcados);
    for (const o of visibles) {
      if (marcar) nuevo.add(o.valor);
      else nuevo.delete(o.valor);
    }
    aplicar(nuevo);
  };
  const soloEste = (o: OpcionValor) => aplicar(new Set([o.valor]));

  return (
    <>
      {opciones.length > 6 && (
        <div className="cf-buscador">
          <Search size={14} aria-hidden />
          <input
            data-cf-foco
            type="search"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar…"
            aria-label={`Buscar entre los valores de ${cf.etiqueta(col)}`}
          />
        </div>
      )}
      <div className="cf-acciones-lista">
        <button type="button" className="cf-link" onClick={() => marcarVisibles(true)} disabled={visibles.length === 0}>
          Seleccionar todo
        </button>
        <span aria-hidden>·</span>
        <button type="button" className="cf-link" onClick={() => marcarVisibles(false)} disabled={visibles.length === 0}>
          Ninguno
        </button>
      </div>
      <div className="cf-lista" role="group" aria-label={`Valores de ${cf.etiqueta(col)}`}>
        {opciones.length === 0 && <p className="cf-vacio">No hay valores para elegir.</p>}
        {opciones.length > 0 && visibles.length === 0 && <p className="cf-vacio">Nada coincide con «{busqueda}».</p>}
        {visibles.map((o) => (
          <label key={o.valor} className={`cf-opcion${o.conteo === 0 ? ' cf-opcion--cero' : ''}`}>
            <input type="checkbox" checked={marcados.has(o.valor)} onChange={() => alternar(o)} />
            <span className="cf-opcion-texto" title={o.etiqueta}>{o.etiqueta}</span>
            <span className="cf-opcion-conteo">{o.conteo}</span>
            <button
              type="button"
              className="cf-solo"
              onClick={(e) => { e.preventDefault(); soloEste(o); }}
              aria-label={`Mostrar solo ${o.etiqueta}`}
              title={`Mostrar solo ${o.etiqueta}`}
            >
              Solo
            </button>
          </label>
        ))}
      </div>
    </>
  );
}

// ---------------- 'fecha': atajos + Desde/Hasta ----------------

function PanelFecha({ cf, col, etiqueta }: { cf: ControlFiltros; col: string; etiqueta: string }) {
  const filtro = cf.filtro(col);
  const valor: FiltroFechaValor = filtro?.tipo === 'fecha' ? filtro.fecha : FILTRO_FECHA_VACIO;
  const poner = (v: FiltroFechaValor) => cf.fijar(col, { tipo: 'fecha', fecha: v });
  const elegirAtajo = (atajo: Exclude<AtajoFecha, '' | 'personalizado'>) =>
    // Pulsar el atajo elegido otra vez lo quita.
    valor.atajo === atajo ? cf.fijar(col, null) : poner({ atajo, ...rangoDeAtajo(atajo) });
  const cambiarDia = (campo: 'desde' | 'hasta', v: string) => poner({ ...valor, atajo: 'personalizado', [campo]: v });

  return (
    <div className="cf-cuerpo">
      <div className="cf-atajos" role="group" aria-label="Periodos rápidos">
        {ATAJOS_FECHA.map((a) => (
          <button
            key={a.value}
            type="button"
            className={`cf-atajo${valor.atajo === a.value ? ' cf-atajo--activo' : ''}`}
            aria-pressed={valor.atajo === a.value}
            onClick={() => elegirAtajo(a.value)}
          >
            {a.label}
          </button>
        ))}
      </div>
      <div className={`cf-rango${valor.atajo === 'personalizado' ? ' cf-rango--activo' : ''}`}>
        <span className="cf-subtitulo">Rango personalizado</span>
        <div className="cf-rango-campos">
          <label>
            <span>Desde</span>
            <input data-cf-foco type="date" value={valor.desde} max={valor.hasta || undefined}
              onChange={(e) => cambiarDia('desde', e.target.value)} aria-label={`${etiqueta}: desde`} />
          </label>
          <label>
            <span>Hasta</span>
            <input type="date" value={valor.hasta} min={valor.desde || undefined}
              onChange={(e) => cambiarDia('hasta', e.target.value)} aria-label={`${etiqueta}: hasta`} />
          </label>
        </div>
      </div>
    </div>
  );
}

// ---------------- 'numero': mínimo / máximo ----------------

function PanelNumero({ cf, col, etiqueta }: { cf: ControlFiltros; col: string; etiqueta: string }) {
  const filtro = cf.filtro(col);
  const [min, setMin] = useState(filtro?.tipo === 'numero' ? filtro.min : '');
  const [max, setMax] = useState(filtro?.tipo === 'numero' ? filtro.max : '');
  const rango = cf.rango(col);
  const poner = (a: string, b: string) => cf.fijar(col, { tipo: 'numero', min: a, max: b });
  const invertido = numeroDeTexto(min) !== null && numeroDeTexto(max) !== null && numeroDeTexto(min)! > numeroDeTexto(max)!;

  return (
    <div className="cf-cuerpo">
      <div className="cf-rango-campos">
        <label>
          <span>Mínimo</span>
          <input data-cf-foco type="text" inputMode="decimal" value={min} placeholder={rango ? String(rango.min) : ''}
            onChange={(e) => { setMin(e.target.value); poner(e.target.value, max); }} aria-label={`${etiqueta}: mínimo`} />
        </label>
        <label>
          <span>Máximo</span>
          <input type="text" inputMode="decimal" value={max} placeholder={rango ? String(rango.max) : ''}
            onChange={(e) => { setMax(e.target.value); poner(min, e.target.value); }} aria-label={`${etiqueta}: máximo`} />
        </label>
      </div>
      {invertido && <p className="cf-aviso" role="alert">El mínimo es mayor que el máximo: no saldrá ninguna fila.</p>}
      {rango && !invertido && <p className="cf-ayuda">Hay valores de {rango.min.toLocaleString('es-EC')} a {rango.max.toLocaleString('es-EC')}.</p>}
    </div>
  );
}

// ---------------- 'texto': contiene ----------------

function PanelTexto({ cf, col, etiqueta, cerrar }: { cf: ControlFiltros; col: string; etiqueta: string; cerrar: () => void }) {
  const filtro = cf.filtro(col);
  const [texto, setTexto] = useState(filtro?.tipo === 'texto' ? filtro.texto : '');
  return (
    <div className="cf-cuerpo">
      <label className="cf-texto">
        <span>Contiene</span>
        <input
          data-cf-foco
          type="search"
          value={texto}
          placeholder="Escribe parte del texto…"
          onChange={(e) => { setTexto(e.target.value); cf.fijar(col, { tipo: 'texto', texto: e.target.value }); }}
          onKeyDown={(e) => { if (e.key === 'Enter') cerrar(); }}
          aria-label={`${etiqueta} contiene`}
        />
      </label>
      <p className="cf-ayuda">No distingue mayúsculas ni tildes.</p>
    </div>
  );
}

// ---------------- Chips de filtros activos ----------------

export interface ChipExtra {
  id: string;
  /** Nombre del filtro («Responsable»). */
  etiqueta: string;
  /** Lo que filtra («Tus clientes»). */
  texto: string;
  onQuitar: () => void;
}

/**
 * Fila de chips con lo que está filtrado («Etapa: Cotizada ✕», «Llegó: Este mes ✕»). Solo se dibuja si hay
 * filtros: va justo debajo de la barra de la tabla. `extra` suma filtros que no son de columna (p. ej. el
 * alcance «mis clientes» que llega del Dashboard).
 */
export function ChipsFiltros<T>({ cf, extra = [] }: { cf: ColumnFilters<T>; extra?: ChipExtra[] }) {
  const cantidad = cf.chips.length + extra.length;
  if (cantidad === 0) return null;
  return (
    <div className="cf-chips" role="group" aria-label="Filtros activos">
      <span className="cf-chips-etiqueta">Filtros</span>
      {cf.chips.map((c) => (
        <span key={c.key} className="cf-chip">
          <span className="cf-chip-nombre">{c.columna}:</span> <span className="cf-chip-texto" title={c.texto}>{c.texto}</span>
          <button type="button" onClick={() => cf.quitar(c.key)} aria-label={`Quitar el filtro de ${c.columna}`} title="Quitar este filtro">
            <X size={12} aria-hidden />
          </button>
        </span>
      ))}
      {extra.map((c) => (
        <span key={c.id} className="cf-chip">
          <span className="cf-chip-nombre">{c.etiqueta}:</span> <span className="cf-chip-texto" title={c.texto}>{c.texto}</span>
          <button type="button" onClick={c.onQuitar} aria-label={`Quitar el filtro de ${c.etiqueta}`} title="Quitar este filtro">
            <X size={12} aria-hidden />
          </button>
        </span>
      ))}
      <span className="cf-chips-total" role="status">
        {cf.filas.length === cf.total ? `${cf.total} filas` : `${cf.filas.length} de ${cf.total}`}
      </span>
    </div>
  );
}

/**
 * Fila de la tabla para cuando los filtros dejan 0 filas. La tabla (con su cabecera y sus embudos) sigue en
 * pantalla; sin esto no habría dónde cambiar el filtro.
 */
export function FilaSinResultados({ columnas, mensaje, onLimpiar }: { columnas: number; mensaje: string; onLimpiar?: () => void }) {
  return (
    <tr className="cf-sin-filas">
      <td colSpan={columnas}>
        <div className="cf-sin-filas-msg">
          <span>{mensaje}</span>
          {onLimpiar && <button type="button" className="btn-secondary" onClick={onLimpiar}>Limpiar filtros</button>}
        </div>
      </td>
    </tr>
  );
}
