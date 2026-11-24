import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Eye } from 'lucide-react';
import { getInventarioPorContratos } from '../../../services/inventario.service';
import type { InventarioDeContrato, InventarioPorContratos } from '../../../types/inventario';
import ClearFiltersButton from '../../../components/common/ClearFiltersButton';
import ColumnFilter, { ChipsFiltros, FilaSinResultados } from '../../../components/common/ColumnFilter';
import ColumnPickerMenu from '../../../components/common/ColumnPickerMenu';
import { useColumnFilters } from '../../../hooks/useColumnFilters';
import { useColumnPreferences } from '../../../hooks/useColumnPreferences';
import { useResizableColumns } from '../../../hooks/useResizableColumns';
import { mensajeError } from './inventarioUi';

const TIPO_LABEL: Record<string, string> = { PUBLICA: 'Pública', PRIVADA: 'Privada' };
const ESTADO_LABEL: Record<string, string> = { ACTIVO: 'Activo', FINALIZADO: 'Finalizado' };
const ESTADO_COLOR: Record<string, { bg: string; fg: string }> = {
  ACTIVO: { bg: '#c6f6d5', fg: '#276749' },
  FINALIZADO: { bg: '#e2e8f0', fg: '#4a5568' },
};
const PERMISO_LABEL: Record<string, string> = { VENCIDO: 'Con permisos vencidos', POR_VENCER: 'Con permisos por vencer', AL_DIA: 'Al día', SIN_ARMAS: 'Sin armas' };

/** Lo peor que tiene el contrato en permisos de armas, para filtrar y ordenar. */
const situacionPermisos = (c: InventarioDeContrato) =>
  c.armasVencidas > 0 ? 'VENCIDO' : c.armasPorVencer > 0 ? 'POR_VENCER' : c.armas > 0 ? 'AL_DIA' : 'SIN_ARMAS';

// El número del contrato siempre se ve (columna fija); el resto lo elige cada persona con «Columnas».
const COLUMNAS = [
  { key: 'entidad', label: 'Entidad' },
  { key: 'tipo', label: 'Tipo' },
  { key: 'estado', label: 'Estado' },
  { key: 'puestos', label: 'Puestos' },
  { key: 'armas', label: 'Armas' },
  { key: 'chalecos', label: 'Chalecos' },
  { key: 'municion', label: 'Munición' },
  { key: 'otroEquipo', label: 'Otro equipo' },
  { key: 'permisos', label: 'Permisos' },
];
const DEFAULT_VISIBLE = ['entidad', 'tipo', 'armas', 'chalecos', 'municion', 'permisos'];
/** Las columnas cortas llevan un ancho fijo (con el ícono del filtro); la de Entidad se queda con el resto. */
const ANCHO: Record<string, number> = { numero: 170, tipo: 105, estado: 120, puestos: 120, armas: 110, chalecos: 145, municion: 140, otroEquipo: 155, permisos: 170 };

const cero = <span style={{ color: '#a0aec0' }}>—</span>;
const cantidad = (n: number) => (n > 0 ? n : cero);

/**
 * Por contrato: cada contrato con lo que tiene en sus puestos (armas, chalecos, munición y otro equipo). Un clic abre su
 * pestaña «Armas y equipo». Debajo, lo que queda fuera de los contratos (sin puesto enlazado y lo guardado en el
 * rastrillo), para que todo sume lo mismo que el resto de Inventario.
 */
export default function PorContratoTab({ recarga, buscarInicial }: { recarga: number; buscarInicial?: string }) {
  const navigate = useNavigate();
  const tablaRef = useResizableColumns('op-inventario-por-contrato');
  const columnPrefs = useColumnPreferences('op-inventario-por-contrato', DEFAULT_VISIBLE);
  const [datos, setDatos] = useState<InventarioPorContratos | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState(buscarInicial ?? '');

  useEffect(() => { setSearch(buscarInicial ?? ''); }, [buscarInicial]);

  const cargar = () => {
    setLoading(true);
    getInventarioPorContratos()
      .then((d) => { setDatos(d); setError(''); })
      .catch((err) => setError(mensajeError(err, 'No se pudo cargar el inventario por contrato.')))
      .finally(() => setLoading(false));
  };
  useEffect(cargar, [recarga]);

  const cf = useColumnFilters<InventarioDeContrato>(datos?.contratos ?? [], [
    { key: 'numero', etiqueta: 'Contrato', tipo: 'texto', getValue: (c) => c.numero },
    { key: 'entidad', etiqueta: 'Entidad', tipo: 'texto', getValue: (c) => c.entidad },
    { key: 'tipo', etiqueta: 'Tipo', tipo: 'valores', orden: ['PUBLICA', 'PRIVADA'], getValues: (c) => ({ valor: c.tipoEntidad, etiqueta: TIPO_LABEL[c.tipoEntidad] ?? c.tipoEntidad }) },
    { key: 'estado', etiqueta: 'Estado', tipo: 'valores', orden: ['ACTIVO', 'FINALIZADO'], getValues: (c) => ({ valor: c.estado, etiqueta: ESTADO_LABEL[c.estado] ?? c.estado }) },
    { key: 'puestos', etiqueta: 'Puestos', tipo: 'numero', getValue: (c) => c.puestos },
    { key: 'armas', etiqueta: 'Armas', tipo: 'numero', getValue: (c) => c.armas },
    { key: 'chalecos', etiqueta: 'Chalecos', tipo: 'numero', getValue: (c) => c.chalecos },
    { key: 'municion', etiqueta: 'Munición', tipo: 'numero', getValue: (c) => c.municion },
    { key: 'otroEquipo', etiqueta: 'Otro equipo', tipo: 'numero', getValue: (c) => c.otroEquipo },
    {
      key: 'permisos', etiqueta: 'Permisos', tipo: 'valores', orden: ['VENCIDO', 'POR_VENCER', 'AL_DIA', 'SIN_ARMAS'],
      getValues: (c) => ({ valor: situacionPermisos(c), etiqueta: PERMISO_LABEL[situacionPermisos(c)] }),
    },
  ]);

  const q = search.trim().toLowerCase();
  const filas = cf.filas.filter((c) => !q || `${c.numero} ${c.entidad}`.toLowerCase().includes(q));
  const hayFiltros = !!search || cf.hayFiltros;
  const limpiar = () => { setSearch(''); cf.limpiar(); };

  const columnasVisibles = columnPrefs.visible.filter((k) => COLUMNAS.some((c) => c.key === k));
  const etiqueta = (k: string) => COLUMNAS.find((c) => c.key === k)?.label ?? k;
  const abrir = (c: InventarioDeContrato) => navigate(`/operaciones/contratos/${c.contratoId}?tab=INVENTARIO`);

  const celda = (k: string, c: InventarioDeContrato) => {
    switch (k) {
      case 'entidad':
        return <span className="truncate">{c.entidad || '—'}</span>;
      case 'tipo':
        return TIPO_LABEL[c.tipoEntidad] ?? c.tipoEntidad;
      case 'estado':
        return <span className="status-badge" style={{ background: ESTADO_COLOR[c.estado]?.bg, color: ESTADO_COLOR[c.estado]?.fg }}>{ESTADO_LABEL[c.estado] ?? c.estado}</span>;
      case 'puestos':
        return c.puestos;
      case 'armas':
        return cantidad(c.armas);
      case 'chalecos':
        return cantidad(c.chalecos);
      case 'municion':
        return cantidad(c.municion);
      case 'otroEquipo':
        return cantidad(c.otroEquipo);
      case 'permisos':
        return (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {c.armasVencidas > 0 && <span className="status-badge" style={{ background: '#fed7d7', color: '#c53030' }}>{c.armasVencidas} vencido{c.armasVencidas === 1 ? '' : 's'}</span>}
            {c.armasPorVencer > 0 && <span className="status-badge" style={{ background: '#feebc8', color: '#c05621' }}>{c.armasPorVencer} por vencer</span>}
            {c.armasVencidas === 0 && c.armasPorVencer === 0 && cero}
          </div>
        );
      default:
        return null;
    }
  };

  const fuera = datos && (
    <div className="admin-section" style={{ marginTop: 16 }}>
      <h3 style={{ margin: '0 0 6px', fontSize: '1.05rem', color: 'var(--azul-oscuro)' }}>Fuera de los contratos</h3>
      <p style={{ margin: '0 0 12px', fontSize: '0.85rem', color: '#718096' }}>
        Lo que está en el inventario pero no cuenta en ningún contrato de arriba. Con esto, la suma de todo coincide con el resto de Inventario.
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 16 }}>
        <div>
          <div style={{ fontWeight: 700, marginBottom: 2 }}>Sin puesto enlazado</div>
          <div style={{ fontSize: '0.9rem' }}>
            {datos.sinEnlazar.armas} {datos.sinEnlazar.armas === 1 ? 'arma' : 'armas'} · {datos.sinEnlazar.chalecos} {datos.sinEnlazar.chalecos === 1 ? 'chaleco' : 'chalecos'} · {datos.sinEnlazar.municion} de munición · {datos.sinEnlazar.otroEquipo} de otro equipo
          </div>
          <div style={{ fontSize: '0.78rem', color: '#718096', marginTop: 2 }}>
            Asignado a un puesto que no se llama igual que ninguno de la aplicación, o entregado a un guardia.
          </div>
          {datos.sinEnlazar.puestos.length > 0 && (
            <details style={{ marginTop: 6, fontSize: '0.85rem' }}>
              <summary style={{ cursor: 'pointer', color: '#2b6cb0' }}>Ver los {datos.sinEnlazar.puestos.length} nombres sin enlazar</summary>
              <ul style={{ margin: '6px 0 0', paddingLeft: 18, columns: 2, columnGap: 24 }}>
                {datos.sinEnlazar.puestos.map((n) => <li key={n}>{n}</li>)}
              </ul>
            </details>
          )}
        </div>
        <div>
          <div style={{ fontWeight: 700, marginBottom: 2 }}>En el rastrillo</div>
          <div style={{ fontSize: '0.9rem' }}>
            {datos.rastrillo.armas} {datos.rastrillo.armas === 1 ? 'arma' : 'armas'} · {datos.rastrillo.chalecos} {datos.rastrillo.chalecos === 1 ? 'chaleco' : 'chalecos'} · {datos.rastrillo.municion} de munición · {datos.rastrillo.otroEquipo} de otro equipo
          </div>
          <div style={{ fontSize: '0.78rem', color: '#718096', marginTop: 2 }}>Guardado y sin asignar (armas disponibles o en mantenimiento, y el material que queda en el rastrillo).</div>
        </div>
      </div>
      <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid #e2e8f0', fontSize: '0.85rem', color: '#4a5568' }}>
        <strong>Total en el inventario:</strong> {datos.totales.armas} armas · {datos.totales.chalecos} chalecos · {datos.totales.municion} de munición · {datos.totales.otroEquipo} de otro equipo
      </div>
    </div>
  );

  return (
    <>
      {error && <div className="form-error" style={{ marginBottom: 16 }}>{error}</div>}

      <div className="filter-bar">
        <div className="filter-bar-fields">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por número de contrato o entidad..."
            style={{ flex: '1 1 280px', minWidth: 0, padding: '10px 14px', border: '2px solid #e2e8f0', borderRadius: 10, fontSize: '0.9rem' }}
          />
        </div>
        <div className="filter-bar-actions">
          <ColumnPickerMenu
            columns={COLUMNAS}
            visible={columnPrefs.visible}
            pinned={columnPrefs.pinned}
            maxPinned={columnPrefs.maxPinned}
            fixedLabel="Contrato"
            onApply={async (keys, fijas) => {
              const guardado = await columnPrefs.set(keys, fijas);
              if (!guardado) setError('Se aplicó en este navegador, pero no se pudo guardar en tu cuenta.');
            }}
          />
          <ClearFiltersButton onClear={limpiar} disabled={!hayFiltros} />
        </div>
      </div>
      <ChipsFiltros cf={cf} />

      <div className="admin-section">
        {loading ? (
          <div className="loading-state">Cargando contratos...</div>
        ) : !datos || datos.contratos.length === 0 ? (
          <div className="empty-state">Todavía no hay contratos. Créalos en Operaciones → Contratos.</div>
        ) : (
          <div className="tasks-table-wrapper">
            <table className="tasks-table resizable-table" ref={tablaRef} data-fijas={columnPrefs.fijas}>
              <thead>
                <tr>
                  <th style={{ width: ANCHO.numero }}>Contrato <ColumnFilter cf={cf} col="numero" orden={cf.ordenDe('numero')} /></th>
                  {columnasVisibles.map((k) => (
                    <th key={k} style={ANCHO[k] ? { width: ANCHO[k] } : undefined}>{etiqueta(k)} <ColumnFilter cf={cf} col={k} orden={cf.ordenDe(k)} /></th>
                  ))}
                  <th className="col-acciones" title="Acciones"><span className="visually-hidden">Acciones</span></th>
                </tr>
              </thead>
              <tbody>
                {filas.length === 0 && (
                  <FilaSinResultados columnas={columnasVisibles.length + 2} mensaje="No hay contratos que coincidan con los filtros." onLimpiar={hayFiltros ? limpiar : undefined} />
                )}
                {filas.map((c) => (
                  <tr key={c.contratoId} onClick={() => abrir(c)} style={{ cursor: 'pointer' }}>
                    <td style={{ fontFamily: 'monospace', fontWeight: 700, color: '#2b6cb0' }}>{c.numero}</td>
                    {columnasVisibles.map((k) => <td key={k}>{celda(k, c)}</td>)}
                    <td className="col-acciones" onClick={(e) => e.stopPropagation()}>
                      <button type="button" className="btn-secondary icon-btn" title="Ver armas y equipo" aria-label="Ver armas y equipo del contrato" onClick={() => abrir(c)}>
                        <Eye size={16} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {fuera}
    </>
  );
}
