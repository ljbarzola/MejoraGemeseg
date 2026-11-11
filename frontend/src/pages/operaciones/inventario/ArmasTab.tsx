import { useEffect, useState } from 'react';
import { History, Pencil, UserPlus } from 'lucide-react';
import { getArmas, reactivarArma } from '../../../services/inventario.service';
import type { Arma } from '../../../types/inventario';
import { CLASE_ARMA_LABEL, ESTADO_ARMA_LABEL, ESTADO_PERMISO_LABEL } from '../../../types/inventario';
import ClearFiltersButton from '../../../components/common/ClearFiltersButton';
import ColumnFilter, { ChipsFiltros, FilaSinResultados } from '../../../components/common/ColumnFilter';
import RowActionsMenu from '../../../components/common/RowActionsMenu';
import { useColumnFilters } from '../../../hooks/useColumnFilters';
import { useResizableColumns } from '../../../hooks/useResizableColumns';
import { AccionArmaModal, ArmaModal, AsignarArmaModal, HistorialArmaModal, type AccionArma } from './ArmaModales';
import { COLOR_ARMA, COLOR_PERMISO, formatoFecha, mensajeError } from './inventarioUi';

const ORDEN_ESTADO = ['DISPONIBLE', 'ASIGNADA', 'MANTENIMIENTO', 'BAJA'];
const ORDEN_PERMISO = ['VENCIDO', 'POR_VENCER', 'VIGENTE', 'SIN_PERMISO'];

/** Armas por número de serie: quién la tiene, si el permiso está vigente y todo lo que le ha pasado. */
export default function ArmasTab({
  puedeEscribir,
  puestos,
  recarga,
  crearAbierto,
  onCrearCerrado,
  onCambio,
}: {
  puedeEscribir: boolean;
  puestos: { id: number; texto: string }[];
  recarga: number;
  crearAbierto: boolean;
  onCrearCerrado: () => void;
  onCambio: () => void;
}) {
  const tablaRef = useResizableColumns('op-inventario-armas');
  const [armas, setArmas] = useState<Arma[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [editando, setEditando] = useState<Arma | null>(null);
  const [asignando, setAsignando] = useState<Arma | null>(null);
  const [accion, setAccion] = useState<{ arma: Arma; tipo: AccionArma } | null>(null);
  const [historial, setHistorial] = useState<Arma | null>(null);

  const cargar = () => {
    setLoading(true);
    getArmas()
      .then((a) => { setArmas(a); setError(''); })
      .catch((err) => setError(mensajeError(err, 'No se pudieron cargar las armas.')))
      .finally(() => setLoading(false));
  };
  useEffect(cargar, [recarga]);

  const cf = useColumnFilters<Arma>(armas, [
    { key: 'serie', etiqueta: 'Serie', tipo: 'texto', getValue: (a) => `${a.serie} ${a.marca ?? ''} ${a.modelo ?? ''}` },
    { key: 'clase', etiqueta: 'Clase', tipo: 'valores', getValues: (a) => ({ valor: a.clase, etiqueta: CLASE_ARMA_LABEL[a.clase] }) },
    { key: 'estado', etiqueta: 'Estado', tipo: 'valores', orden: ORDEN_ESTADO, getValues: (a) => ({ valor: a.estado, etiqueta: ESTADO_ARMA_LABEL[a.estado] }) },
    { key: 'tiene', etiqueta: 'La tiene', tipo: 'texto', getValue: (a) => `${a.guardiaNombre ?? ''} ${a.puestoNombre ?? ''}` },
    { key: 'permiso', etiqueta: 'Permiso', tipo: 'valores', orden: ORDEN_PERMISO, getValues: (a) => ({ valor: a.permiso, etiqueta: ESTADO_PERMISO_LABEL[a.permiso] }) },
  ]);

  const q = search.trim().toLowerCase();
  const filas = cf.filas.filter((a) => !q || `${a.serie} ${a.marca ?? ''} ${a.modelo ?? ''} ${a.guardiaNombre ?? ''} ${a.puestoNombre ?? ''}`.toLowerCase().includes(q));
  const hayFiltros = !!search || cf.hayFiltros;
  const limpiar = () => { setSearch(''); cf.limpiar(); };

  const terminado = () => {
    setEditando(null);
    setAsignando(null);
    setAccion(null);
    onCrearCerrado();
    cargar();
    onCambio();
  };

  const reactivar = async (a: Arma) => {
    try {
      await reactivarArma(a.id);
      terminado();
    } catch (err) {
      setError(mensajeError(err, 'No se pudo reactivar el arma.'));
    }
  };

  return (
    <>
      {error && <div className="form-error" style={{ marginBottom: 16 }}>{error}</div>}

      <div className="filter-bar">
        <div className="filter-bar-fields">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por serie, marca, guardia o puesto..."
            style={{ flex: '1 1 280px', minWidth: 0, padding: '10px 14px', border: '2px solid #e2e8f0', borderRadius: 10, fontSize: '0.9rem' }}
          />
        </div>
        <div className="filter-bar-actions">
          <ClearFiltersButton onClear={limpiar} disabled={!hayFiltros} />
        </div>
      </div>
      <ChipsFiltros cf={cf} />

      <div className="admin-section">
        {loading ? (
          <div className="loading-state">Cargando armas...</div>
        ) : armas.length === 0 ? (
          <div className="empty-state">Todavía no hay armas registradas.</div>
        ) : (
          <div className="tasks-table-wrapper">
            <table className="tasks-table resizable-table" ref={tablaRef}>
              <thead>
                <tr>
                  <th>Serie <ColumnFilter cf={cf} col="serie" orden={cf.ordenDe('serie')} /></th>
                  <th>Clase <ColumnFilter cf={cf} col="clase" orden={cf.ordenDe('clase')} /></th>
                  <th>Estado <ColumnFilter cf={cf} col="estado" orden={cf.ordenDe('estado')} /></th>
                  <th>La tiene <ColumnFilter cf={cf} col="tiene" orden={cf.ordenDe('tiene')} /></th>
                  <th>Permiso <ColumnFilter cf={cf} col="permiso" orden={cf.ordenDe('permiso')} /></th>
                  <th className="col-acciones col-acciones--ancha" title="Acciones"><span className="visually-hidden">Acciones</span></th>
                </tr>
              </thead>
              <tbody>
                {filas.length === 0 && (
                  <FilaSinResultados columnas={6} mensaje="No hay armas que coincidan con los filtros." onLimpiar={hayFiltros ? limpiar : undefined} />
                )}
                {filas.map((a) => (
                  <tr key={a.id} style={a.estado === 'BAJA' ? { opacity: 0.55 } : undefined}>
                    <td>
                      <span style={{ fontFamily: 'monospace', fontWeight: 700 }}>{a.serie}</span>
                      <div style={{ fontSize: '0.78rem', color: '#718096' }}>{[a.marca, a.modelo, a.calibre].filter(Boolean).join(' · ') || '—'}</div>
                    </td>
                    <td>{CLASE_ARMA_LABEL[a.clase]}</td>
                    <td><span className="status-badge" style={{ background: COLOR_ARMA[a.estado].bg, color: COLOR_ARMA[a.estado].fg }}>{ESTADO_ARMA_LABEL[a.estado]}</span></td>
                    <td style={{ fontSize: '0.85rem' }}>
                      {a.estado === 'ASIGNADA' ? (
                        <>
                          {a.guardiaNombre && <div>{a.guardiaNombre}</div>}
                          {a.puestoNombre && <div style={{ color: '#718096', fontSize: '0.78rem' }}>{a.puestoNombre}</div>}
                        </>
                      ) : '—'}
                    </td>
                    <td>
                      <span className="status-badge" style={{ background: COLOR_PERMISO[a.permiso].bg, color: COLOR_PERMISO[a.permiso].fg }}>{ESTADO_PERMISO_LABEL[a.permiso]}</span>
                      {a.permisoVence && (
                        <div style={{ fontSize: '0.75rem', color: '#718096', marginTop: 2 }}>
                          {formatoFecha(a.permisoVence)}
                          {a.diasParaVencer != null && a.permiso === 'POR_VENCER' && ` · faltan ${a.diasParaVencer} día${a.diasParaVencer === 1 ? '' : 's'}`}
                        </div>
                      )}
                    </td>
                    <td className="col-acciones col-acciones--ancha">
                      <div className="acciones-iconos">
                        {puedeEscribir && a.estado === 'DISPONIBLE' ? (
                          <button type="button" className="btn-secondary icon-btn" title="Asignar" aria-label="Asignar" onClick={() => setAsignando(a)}>
                            <UserPlus size={16} />
                          </button>
                        ) : (
                          <button type="button" className="btn-secondary icon-btn" title="Ver historial" aria-label="Ver historial" onClick={() => setHistorial(a)}>
                            <History size={16} />
                          </button>
                        )}
                        <RowActionsMenu
                          actions={[
                            { label: 'Ver historial', icon: <History size={14} />, onClick: () => setHistorial(a) },
                            ...(puedeEscribir && a.estado !== 'BAJA'
                              ? [
                                  { label: 'Editar datos', icon: <Pencil size={14} />, onClick: () => setEditando(a) },
                                  ...(a.estado === 'ASIGNADA' ? [{ label: 'Devolver a la bodega', onClick: () => setAccion({ arma: a, tipo: 'DEVOLVER' as AccionArma }) }] : []),
                                  ...(a.estado === 'DISPONIBLE' ? [{ label: 'Enviar a mantenimiento', onClick: () => setAccion({ arma: a, tipo: 'MANTENIMIENTO' as AccionArma }) }] : []),
                                  ...(a.estado === 'MANTENIMIENTO' ? [{ label: 'Volvió del mantenimiento', onClick: () => reactivar(a) }] : []),
                                  ...(a.estado !== 'ASIGNADA' ? [{ label: 'Dar de baja', danger: true, onClick: () => setAccion({ arma: a, tipo: 'BAJA' as AccionArma }) }] : []),
                                ]
                              : []),
                          ]}
                        />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {(crearAbierto || editando) && <ArmaModal arma={editando} onClose={() => { setEditando(null); onCrearCerrado(); }} onSaved={terminado} />}
      {asignando && <AsignarArmaModal arma={asignando} puestos={puestos} onClose={() => setAsignando(null)} onSaved={terminado} />}
      {accion && <AccionArmaModal arma={accion.arma} accion={accion.tipo} onClose={() => setAccion(null)} onSaved={terminado} />}
      {historial && <HistorialArmaModal arma={historial} onClose={() => setHistorial(null)} />}
    </>
  );
}
