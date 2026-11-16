import { Fragment, useCallback, useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronRight, X } from 'lucide-react';
import {
  getTablaDinamica,
  type DimensionPivot,
  type FilaPivot,
  type MedidaPivot,
  type MedidasPivot,
  type TablaDinamica,
} from '../../../services/ventas.service';
import FilterField from '../../common/FilterField';
import { Cargando, SinDatos, Tarjeta, dinero } from './DashboardBits';

// Pestaña «Tabla dinámica» del Dashboard (2026-11-16): lo vendido en el periodo que ya eligió la barra de arriba
// (oportunidades aceptadas), ordenado como quiera quien mira: qué va en las filas (hasta dos niveles, con subtotal),
// qué en las columnas, qué datos mostrar y qué filtros aplicar. Siempre termina con una fila de total.

const DIMENSIONES: { clave: DimensionPivot; etiqueta: string }[] = [
  { clave: 'vendedor', etiqueta: 'Vendedor' },
  { clave: 'cliente', etiqueta: 'Cliente o empresa' },
  { clave: 'servicio', etiqueta: 'Servicio' },
  { clave: 'provincia', etiqueta: 'Provincia' },
  { clave: 'ciudad', etiqueta: 'Ciudad' },
  { clave: 'mes', etiqueta: 'Mes de la venta' },
  { clave: 'tipo', etiqueta: 'Tipo de venta' },
  { clave: 'rango', etiqueta: 'Rango de precio' },
];
const ETIQUETA_DIM = Object.fromEntries(DIMENSIONES.map((d) => [d.clave, d.etiqueta])) as Record<DimensionPivot, string>;

const MEDIDAS: { clave: MedidaPivot; etiqueta: string; ayuda: string }[] = [
  { clave: 'monto', etiqueta: 'Monto (USD)', ayuda: 'Dólares cotizados de las ventas aceptadas' },
  { clave: 'ventas', etiqueta: 'Ventas', ayuda: 'Cuántas oportunidades aceptadas (cada una es un impacto)' },
  { clave: 'clientes', etiqueta: 'Clientes', ayuda: 'Cuántas empresas o personas distintas compraron' },
  { clave: 'ticket', etiqueta: 'Ticket promedio', ayuda: 'Monto dividido entre las ventas' },
];
const ETIQUETA_MEDIDA = Object.fromEntries(MEDIDAS.map((m) => [m.clave, m.etiqueta])) as Record<MedidaPivot, string>;

type Filtros = Partial<Record<DimensionPivot, string[]>>;
interface Diseno {
  fila1: DimensionPivot;
  fila2: DimensionPivot | '';
  columna: DimensionPivot | '';
  medidas: MedidaPivot[];
  filtros: Filtros;
}

const DISENO_INICIAL: Diseno = { fila1: 'vendedor', fila2: '', columna: '', medidas: ['monto', 'ventas'], filtros: {} };
const LLAVE = 'ventas-tabla-dinamica';

const esDim = (x: unknown): x is DimensionPivot => DIMENSIONES.some((d) => d.clave === x);
const esMedida = (x: unknown): x is MedidaPivot => MEDIDAS.some((m) => m.clave === x);

// Lo último que armó la persona se recuerda en este navegador (solo comodidad); lo guardado se valida: cualquier
// cosa rara vuelve al diseño inicial en vez de romper la pantalla.
function leerDiseno(): Diseno {
  try {
    const crudo = JSON.parse(localStorage.getItem(LLAVE) ?? 'null');
    if (!crudo || typeof crudo !== 'object') return DISENO_INICIAL;
    const fila1 = esDim(crudo.fila1) ? crudo.fila1 : DISENO_INICIAL.fila1;
    const fila2 = esDim(crudo.fila2) && crudo.fila2 !== fila1 ? crudo.fila2 : '';
    const columna = esDim(crudo.columna) && crudo.columna !== fila1 && crudo.columna !== fila2 ? crudo.columna : '';
    const medidas = Array.isArray(crudo.medidas) ? crudo.medidas.filter(esMedida) : [];
    const filtros: Filtros = {};
    if (crudo.filtros && typeof crudo.filtros === 'object') {
      for (const [d, v] of Object.entries(crudo.filtros as Record<string, unknown>)) {
        if (esDim(d) && Array.isArray(v)) {
          const limpios = v.filter((x): x is string => typeof x === 'string');
          if (limpios.length) filtros[d] = limpios;
        }
      }
    }
    return { fila1, fila2, columna, medidas: medidas.length ? medidas : DISENO_INICIAL.medidas, filtros };
  } catch {
    return DISENO_INICIAL;
  }
}

const entero = (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: 0 });

function textoMedida(m: MedidaPivot, c: MedidasPivot): string {
  if (c.ventas === 0) return '—';
  if (m === 'monto') return dinero(c.monto);
  if (m === 'ventas') return entero(c.ventas);
  if (m === 'clientes') return entero(c.clientes);
  return dinero(c.ticket);
}

// ---------------------------------------------------------------------------
// Filtro de una dimensión: una lista de casillas con buscador.
// ---------------------------------------------------------------------------

function PanelFiltro({
  etiqueta, opciones, elegidos, onChange, onCerrar,
}: {
  etiqueta: string;
  opciones: { valor: string; etiqueta: string }[];
  elegidos: string[];
  onChange: (v: string[]) => void;
  onCerrar: () => void;
}) {
  const [buscar, setBuscar] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Pulsar el propio chip del filtro lo abre/cierra él mismo: no cuenta como «fuera».
    const fuera = (e: MouseEvent) => {
      const zona = ref.current?.closest('.pivot-chip-zona');
      if (zona && !zona.contains(e.target as Node)) onCerrar();
    };
    const tecla = (e: KeyboardEvent) => { if (e.key === 'Escape') onCerrar(); };
    document.addEventListener('mousedown', fuera);
    document.addEventListener('keydown', tecla);
    return () => { document.removeEventListener('mousedown', fuera); document.removeEventListener('keydown', tecla); };
  }, [onCerrar]);

  const visibles = opciones.filter((o) => o.etiqueta.toLowerCase().includes(buscar.trim().toLowerCase()));
  const alternar = (valor: string) => onChange(elegidos.includes(valor) ? elegidos.filter((v) => v !== valor) : [...elegidos, valor]);

  return (
    <div className="pivot-panel" ref={ref} role="dialog" aria-label={`Filtro de ${etiqueta}`}>
      {opciones.length > 8 && (
        <input
          className="pivot-panel-buscar" type="search" placeholder="Buscar..." value={buscar} autoFocus
          onChange={(e) => setBuscar(e.target.value)} aria-label={`Buscar en ${etiqueta}`}
        />
      )}
      <div className="pivot-panel-lista">
        {visibles.length === 0 ? (
          <p className="pivot-panel-vacio">No hay nada que coincida.</p>
        ) : visibles.map((o) => (
          <label key={o.valor} className="pivot-opcion">
            <input type="checkbox" checked={elegidos.includes(o.valor)} onChange={() => alternar(o.valor)} />
            <span>{o.etiqueta}</span>
          </label>
        ))}
      </div>
      <div className="pivot-panel-pie">
        <button type="button" className="btn-secondary" onClick={() => onChange([])} disabled={elegidos.length === 0}>Quitar selección</button>
        <button type="button" className="btn-secondary" onClick={onCerrar}>Listo</button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

export default function DashboardPivot({ alcance, desde, hasta }: { alcance: string; desde: string; hasta: string }) {
  const [diseno, setDiseno] = useState<Diseno>(leerDiseno);
  const [datos, setDatos] = useState<TablaDinamica | null>(null);
  const [error, setError] = useState(false);
  const [cargando, setCargando] = useState(true);
  const [filtroAbierto, setFiltroAbierto] = useState<DimensionPivot | null>(null);
  const [cerrados, setCerrados] = useState<Set<string>>(new Set());
  const pedido = useRef(0);

  const filas = diseno.fila2 ? `${diseno.fila1},${diseno.fila2}` : diseno.fila1;
  const medidas = diseno.medidas.join(',');
  const filtrosTexto = JSON.stringify(diseno.filtros);

  useEffect(() => {
    try { localStorage.setItem(LLAVE, JSON.stringify(diseno)); } catch { /* sin almacenamiento: no pasa nada */ }
  }, [diseno]);

  const cargar = useCallback(async () => {
    const mio = ++pedido.current;
    setError(false);
    setCargando(true);
    try {
      const r = await getTablaDinamica({ alcance, desde, hasta, filas, columna: diseno.columna || 'ninguna', medidas, filtros: filtrosTexto });
      if (mio === pedido.current) setDatos(r);
    } catch {
      if (mio === pedido.current) setError(true);
    } finally {
      if (mio === pedido.current) setCargando(false);
    }
  }, [alcance, desde, hasta, filas, diseno.columna, medidas, filtrosTexto]);
  useEffect(() => { cargar(); }, [cargar]);

  // Cambiar una fila o la columna a algo que ya se usa en otro lado lo quita de ahí (no puede repetirse).
  const cambiar = (cambio: Partial<Pick<Diseno, 'fila1' | 'fila2' | 'columna'>>) => {
    setDiseno((d) => {
      const n = { ...d, ...cambio };
      if (cambio.fila1) {
        if (n.fila2 === n.fila1) n.fila2 = '';
        if (n.columna === n.fila1) n.columna = '';
      }
      if (cambio.fila2 && n.columna === n.fila2) n.columna = '';
      if (cambio.columna) {
        if (n.fila2 === n.columna) n.fila2 = '';
      }
      return n;
    });
    setCerrados(new Set());
  };

  const alternarMedida = (m: MedidaPivot) =>
    setDiseno((d) => {
      const ya = d.medidas.includes(m);
      if (ya && d.medidas.length === 1) return d; // siempre queda al menos un dato
      return { ...d, medidas: MEDIDAS.map((x) => x.clave).filter((x) => (x === m ? !ya : d.medidas.includes(x))) };
    });

  const ponerFiltro = (dim: DimensionPivot, valores: string[]) =>
    setDiseno((d) => {
      const filtros = { ...d.filtros };
      if (valores.length) filtros[dim] = valores; else delete filtros[dim];
      return { ...d, filtros };
    });
  const quitarFiltro = (dim: DimensionPivot) => { ponerFiltro(dim, []); setFiltroAbierto((a) => (a === dim ? null : a)); };

  const filtrosActivos = (Object.keys(diseno.filtros) as DimensionPivot[]).filter((d) => (diseno.filtros[d] ?? []).length > 0);
  const sinFiltrar = DIMENSIONES.filter((d) => !filtrosActivos.includes(d.clave));
  const cerrarFiltro = useCallback(() => setFiltroAbierto(null), []);

  const restablecer = () => { setDiseno(DISENO_INICIAL); setCerrados(new Set()); setFiltroAbierto(null); };
  const esInicial = JSON.stringify(diseno) === JSON.stringify(DISENO_INICIAL);

  if (!datos) return <Cargando error={error} onReintentar={cargar} />;

  const tieneColumnas = datos.columnas.length > 0;
  const nMedidas = datos.medidas.length;
  const etiquetaFilas = datos.filas.map((d) => ETIQUETA_DIM[d]).join(' › ');
  const usaServicio = datos.filas.includes('servicio') || datos.columna === 'servicio' || !!diseno.filtros.servicio;

  const celdasDe = (f: { celdas: MedidasPivot[]; total: MedidasPivot }) => (
    <>
      {f.celdas.flatMap((c, i) => datos.medidas.map((m) => (
        <td key={`${i}-${m}`} className={`pivot-num${m === datos.medidas[0] ? ' pivot-borde' : ''}${c.ventas === 0 ? ' pivot-vacia' : ''}`}>{textoMedida(m, c)}</td>
      )))}
      {datos.medidas.map((m) => (
        <td key={`t-${m}`} className={`pivot-num pivot-col-total${m === datos.medidas[0] ? ' pivot-borde' : ''}${f.total.ventas === 0 ? ' pivot-vacia' : ''}`}>{textoMedida(m, f.total)}</td>
      ))}
    </>
  );

  const filaTabla = (f: FilaPivot, nivel: 0 | 1, esGrupo: boolean) => {
    const clave = `${nivel}|${f.clave}`;
    const abierto = !cerrados.has(clave);
    return (
      <tr key={clave} className={esGrupo ? 'pivot-grupo-fila' : f.esOtros ? 'pivot-otros' : undefined}>
        <td className="pivot-etiqueta" style={nivel === 1 ? { paddingLeft: 30 } : undefined}>
          {esGrupo ? (
            <button
              type="button" className="pivot-plegar" aria-expanded={abierto}
              onClick={() => setCerrados((s) => { const n = new Set(s); if (n.has(clave)) n.delete(clave); else n.add(clave); return n; })}
              title={abierto ? 'Ocultar el detalle' : 'Mostrar el detalle'}
            >
              {abierto ? <ChevronDown size={14} aria-hidden /> : <ChevronRight size={14} aria-hidden />}
              <span className="truncate">{f.etiqueta}</span>
            </button>
          ) : <span className="truncate" title={f.etiqueta}>{f.etiqueta}</span>}
        </td>
        {celdasDe(f)}
      </tr>
    );
  };

  return (
    <div className="dash-pila">
      <Tarjeta
        titulo="Tabla dinámica"
        hint="Ordena lo vendido en el periodo como necesites: elige qué va en las filas, qué en las columnas y qué datos mostrar. Con los filtros te quedas con una parte. «Vendido» es el monto cotizado de las oportunidades aceptadas."
        accion={<button type="button" className="btn-secondary pivot-restablecer" onClick={restablecer} disabled={esInicial}>Restablecer</button>}
      >
        <div className="pivot-controles">
          <FilterField label="Filas">
            <select className="filter-select" value={diseno.fila1} onChange={(e) => cambiar({ fila1: e.target.value as DimensionPivot })}>
              {DIMENSIONES.map((d) => <option key={d.clave} value={d.clave}>{d.etiqueta}</option>)}
            </select>
          </FilterField>
          <FilterField label="Agrupar dentro de cada fila por">
            <select className="filter-select" value={diseno.fila2} onChange={(e) => cambiar({ fila2: e.target.value as DimensionPivot | '' })}>
              <option value="">Sin agrupar</option>
              {DIMENSIONES.filter((d) => d.clave !== diseno.fila1).map((d) => <option key={d.clave} value={d.clave}>{d.etiqueta}</option>)}
            </select>
          </FilterField>
          <FilterField label="Columnas">
            <select className="filter-select" value={diseno.columna} onChange={(e) => cambiar({ columna: e.target.value as DimensionPivot | '' })}>
              <option value="">Solo el total</option>
              {DIMENSIONES.filter((d) => d.clave !== diseno.fila1 && d.clave !== diseno.fila2).map((d) => <option key={d.clave} value={d.clave}>{d.etiqueta}</option>)}
            </select>
          </FilterField>
          <fieldset className="pivot-medidas">
            <legend>Datos a mostrar</legend>
            {MEDIDAS.map((m) => (
              <label key={m.clave} className="pivot-opcion" title={m.ayuda}>
                <input type="checkbox" checked={diseno.medidas.includes(m.clave)} onChange={() => alternarMedida(m.clave)} />
                <span>{m.etiqueta}</span>
              </label>
            ))}
          </fieldset>
        </div>

        <div className="pivot-filtros">
          <span className="pivot-filtros-titulo">Filtros</span>
          {filtrosActivos.map((dim) => {
            const opciones = datos.opciones[dim] ?? [];
            const elegidos = diseno.filtros[dim] ?? [];
            return (
              <span key={dim} className="pivot-chip-zona">
                <span className="pivot-chip">
                  <button
                    type="button" className="pivot-chip-boton" aria-haspopup="dialog" aria-expanded={filtroAbierto === dim}
                    onClick={() => setFiltroAbierto(filtroAbierto === dim ? null : dim)}
                  >
                    {ETIQUETA_DIM[dim]}: {elegidos.length === 1 ? (opciones.find((o) => o.valor === elegidos[0])?.etiqueta ?? elegidos[0]) : `${elegidos.length} elegidos`}
                  </button>
                  <button type="button" className="pivot-chip-quitar" onClick={() => quitarFiltro(dim)} aria-label={`Quitar el filtro de ${ETIQUETA_DIM[dim]}`} title="Quitar este filtro">
                    <X size={13} aria-hidden />
                  </button>
                </span>
                {filtroAbierto === dim && (
                  <PanelFiltro etiqueta={ETIQUETA_DIM[dim]} opciones={opciones} elegidos={elegidos} onChange={(v) => ponerFiltro(dim, v)} onCerrar={cerrarFiltro} />
                )}
              </span>
            );
          })}
          {filtroAbierto && !filtrosActivos.includes(filtroAbierto) && (
            <span className="pivot-chip-zona">
              <span className="pivot-chip pivot-chip--nuevo"><span className="pivot-chip-boton">{ETIQUETA_DIM[filtroAbierto]}</span></span>
              <PanelFiltro
                etiqueta={ETIQUETA_DIM[filtroAbierto]} opciones={datos.opciones[filtroAbierto] ?? []} elegidos={[]}
                onChange={(v) => ponerFiltro(filtroAbierto, v)} onCerrar={cerrarFiltro}
              />
            </span>
          )}
          <select
            className="filter-select pivot-agregar" value="" aria-label="Agregar un filtro"
            onChange={(e) => { if (e.target.value) setFiltroAbierto(e.target.value as DimensionPivot); }}
          >
            <option value="">+ Agregar filtro</option>
            {sinFiltrar.map((d) => <option key={d.clave} value={d.clave}>{d.etiqueta}</option>)}
          </select>
        </div>
      </Tarjeta>

      <Tarjeta
        titulo={`Ventas por ${etiquetaFilas.toLowerCase()}${datos.columna ? ` y ${ETIQUETA_DIM[datos.columna].toLowerCase()}` : ''}`}
        hint={`${datos.ventas === 1 ? '1 venta aceptada' : `${entero(datos.ventas)} ventas aceptadas`} en el periodo, ${dinero(datos.total.total.monto)} en total`}
      >
        {datos.ventas === 0 ? (
          <SinDatos texto={filtrosActivos.length ? 'No hay ventas aceptadas en este periodo con esos filtros.' : 'No hay ventas aceptadas en este periodo.'} />
        ) : (
          <div className="pivot-scroll" style={{ opacity: cargando ? 0.6 : 1, transition: 'opacity 0.15s' }}>
            <table className="tasks-table pivot-tabla">
              <thead>
                {tieneColumnas ? (
                  <>
                    <tr>
                      <th rowSpan={2} className="pivot-etiqueta">{etiquetaFilas}</th>
                      {datos.columnas.map((c) => <th key={c.clave} colSpan={nMedidas} className="pivot-grupo" title={c.etiqueta}><span className="truncate">{c.etiqueta}</span></th>)}
                      <th colSpan={nMedidas} className="pivot-grupo pivot-col-total">Total</th>
                    </tr>
                    <tr>
                      {[...datos.columnas, { clave: 'total' }].flatMap((c) => datos.medidas.map((m, i) => (
                        <th key={`${c.clave}-${m}`} className={`pivot-sub${i === 0 ? ' pivot-borde' : ''}${c.clave === 'total' ? ' pivot-col-total' : ''}`}>{ETIQUETA_MEDIDA[m]}</th>
                      )))}
                    </tr>
                  </>
                ) : (
                  <tr>
                    <th className="pivot-etiqueta">{etiquetaFilas}</th>
                    {datos.medidas.map((m) => <th key={m} className="pivot-sub">{ETIQUETA_MEDIDA[m]}</th>)}
                  </tr>
                )}
              </thead>
              <tbody>
                {datos.datos.map((f) => (
                  <Fragment key={f.clave}>
                    {filaTabla(f, 0, !!f.hijos)}
                    {f.hijos && !cerrados.has(`0|${f.clave}`) && f.hijos.map((h) => (
                      <Fragment key={`${f.clave}|${h.clave}`}>{filaTabla(h, 1, false)}</Fragment>
                    ))}
                  </Fragment>
                ))}
              </tbody>
              <tfoot>
                <tr className="pivot-total">
                  <td className="pivot-etiqueta">Total</td>
                  {celdasDe(datos.total)}
                </tr>
              </tfoot>
            </table>
          </div>
        )}

        <div className="pivot-notas">
          {!datos.alcance.esGerencia && <p>Aquí solo aparecen tus propias ventas.</p>}
          {datos.sinMonto > 0 && (
            <p>
              {datos.sinMonto === 1 ? '1 venta aceptada no tiene' : `${datos.sinMonto} ventas aceptadas no tienen`} monto cotizado:
              cuenta como venta, pero no suma dólares.
            </p>
          )}
          {usaServicio && <p>Cuando una venta incluye varios servicios, su monto se reparte en partes iguales entre ellos y el total la cuenta una sola vez.</p>}
          {datos.plegado.columnas > 0 && <p>Para que se lea bien, {datos.plegado.columnas} columnas con menos ventas se juntaron en «Otros».</p>}
          {datos.plegado.filas > 0 && <p>Para que se lea bien, {datos.plegado.filas} filas con menos ventas se juntaron en «Otros».</p>}
        </div>
      </Tarjeta>
    </div>
  );
}
