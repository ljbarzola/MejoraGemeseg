import { useEffect, useState } from 'react';
import { ArrowDownToLine, Pencil, Power } from 'lucide-react';
import { actualizarArticulo, getArticulos } from '../../../services/inventario.service';
import type { Articulo, TipoMovimiento } from '../../../types/inventario';
import { ESTADO_STOCK_LABEL, TIPO_ARTICULO_LABEL } from '../../../types/inventario';
import ClearFiltersButton from '../../../components/common/ClearFiltersButton';
import ColumnFilter, { ChipsFiltros, FilaSinResultados } from '../../../components/common/ColumnFilter';
import RowActionsMenu from '../../../components/common/RowActionsMenu';
import { useColumnFilters } from '../../../hooks/useColumnFilters';
import { useResizableColumns } from '../../../hooks/useResizableColumns';
import ArticuloModal from './ArticuloModal';
import { COLOR_STOCK, mensajeError, pluralUnidad } from './inventarioUi';

const ORDEN_ESTADO = ['SIN_STOCK', 'BAJO_MINIMO', 'NORMAL', 'SOBRE_MAXIMO'];

/** Existencias: cada artículo con lo que hay en bodega, lo que está entregado y si toca reponer. */
export default function ExistenciasTab({
  puedeEscribir,
  recarga,
  crearAbierto,
  onCrearCerrado,
  onMovimiento,
  onCambio,
}: {
  puedeEscribir: boolean;
  /** Cambia cuando otra parte de la pantalla registró algo: vuelve a cargar. */
  recarga: number;
  crearAbierto: boolean;
  onCrearCerrado: () => void;
  onMovimiento: (articuloId: number, tipo: TipoMovimiento) => void;
  onCambio: () => void;
}) {
  const tablaRef = useResizableColumns('op-inventario-existencias');
  const [articulos, setArticulos] = useState<Articulo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [editando, setEditando] = useState<Articulo | null>(null);

  const cargar = () => {
    setLoading(true);
    getArticulos()
      .then((a) => { setArticulos(a); setError(''); })
      .catch((err) => setError(mensajeError(err, 'No se pudo cargar el inventario.')))
      .finally(() => setLoading(false));
  };
  useEffect(cargar, [recarga]);

  const cf = useColumnFilters<Articulo>(articulos, [
    { key: 'tipo', etiqueta: 'Tipo', tipo: 'valores', orden: ['UNIFORME', 'IMPLEMENTO', 'MUNICION'], getValues: (a) => ({ valor: a.tipo, etiqueta: TIPO_ARTICULO_LABEL[a.tipo] }) },
    { key: 'nombre', etiqueta: 'Artículo', tipo: 'texto', getValue: (a) => `${a.nombre} ${a.variante}` },
    { key: 'enBodega', etiqueta: 'En bodega', tipo: 'numero', getValue: (a) => a.enBodega },
    { key: 'entregado', etiqueta: 'Entregado', tipo: 'numero', getValue: (a) => a.entregado },
    { key: 'estado', etiqueta: 'Estado', tipo: 'valores', orden: ORDEN_ESTADO, getValues: (a) => ({ valor: a.estado, etiqueta: a.activo ? ESTADO_STOCK_LABEL[a.estado] : 'Desactivado' }) },
  ]);

  const q = search.trim().toLowerCase();
  const filas = cf.filas.filter((a) => !q || `${a.nombre} ${a.variante}`.toLowerCase().includes(q));
  const hayFiltros = !!search || cf.hayFiltros;
  const limpiar = () => { setSearch(''); cf.limpiar(); };

  const alternarActivo = async (a: Articulo) => {
    try {
      await actualizarArticulo(a.id, { activo: !a.activo });
      cargar();
      onCambio();
    } catch (err) {
      setError(mensajeError(err, 'No se pudo cambiar el artículo.'));
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
            placeholder="Buscar por nombre o talla..."
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
          <div className="loading-state">Cargando inventario...</div>
        ) : articulos.length === 0 ? (
          <div className="empty-state">
            Todavía no hay artículos. Crea los uniformes, implementos y municiones que manejas y registra su primera entrada.
          </div>
        ) : (
          <div className="tasks-table-wrapper">
            <table className="tasks-table resizable-table" ref={tablaRef}>
              <thead>
                <tr>
                  <th>Tipo <ColumnFilter cf={cf} col="tipo" orden={cf.ordenDe('tipo')} /></th>
                  <th>Artículo <ColumnFilter cf={cf} col="nombre" orden={cf.ordenDe('nombre')} /></th>
                  <th>En bodega <ColumnFilter cf={cf} col="enBodega" orden={cf.ordenDe('enBodega')} /></th>
                  <th>Entregado <ColumnFilter cf={cf} col="entregado" orden={cf.ordenDe('entregado')} /></th>
                  <th>Mín. / Máx.</th>
                  <th>Estado <ColumnFilter cf={cf} col="estado" orden={cf.ordenDe('estado')} /></th>
                  {puedeEscribir && <th className="col-acciones col-acciones--ancha" title="Acciones"><span className="visually-hidden">Acciones</span></th>}
                </tr>
              </thead>
              <tbody>
                {filas.length === 0 && (
                  <FilaSinResultados columnas={puedeEscribir ? 7 : 6} mensaje="No hay artículos que coincidan con los filtros." onLimpiar={hayFiltros ? limpiar : undefined} />
                )}
                {filas.map((a) => (
                  <tr key={a.id} style={a.activo ? undefined : { opacity: 0.55 }}>
                    <td>{TIPO_ARTICULO_LABEL[a.tipo]}</td>
                    <td>
                      <span className="truncate" style={{ fontWeight: 600 }}>{a.nombre}</span>
                      {a.variante && <span style={{ color: '#718096' }}> · {a.variante}</span>}
                    </td>
                    <td style={{ fontWeight: 700 }}>{a.enBodega} <span style={{ fontWeight: 400, color: '#718096', fontSize: '0.78rem' }}>{pluralUnidad(a.unidad, a.enBodega)}</span></td>
                    <td>{a.entregado}</td>
                    <td style={{ fontSize: '0.82rem', color: '#4a5568' }}>{a.stockMinimo} / {a.stockMaximo ?? '—'}</td>
                    <td>
                      {a.activo ? (
                        <>
                          <span className="status-badge" style={{ background: COLOR_STOCK[a.estado].bg, color: COLOR_STOCK[a.estado].fg }}>{ESTADO_STOCK_LABEL[a.estado]}</span>
                          {a.reponer > 0 && <div style={{ fontSize: '0.75rem', color: '#c05621', marginTop: 2 }}>Reponer {a.reponer}</div>}
                        </>
                      ) : (
                        <span className="status-badge" style={{ background: '#e2e8f0', color: '#4a5568' }}>Desactivado</span>
                      )}
                    </td>
                    {puedeEscribir && (
                      <td className="col-acciones col-acciones--ancha">
                        <div className="acciones-iconos">
                          <button type="button" className="btn-secondary icon-btn" title="Registrar entrada" aria-label="Registrar entrada" onClick={() => onMovimiento(a.id, 'ENTRADA')} disabled={!a.activo}>
                            <ArrowDownToLine size={16} />
                          </button>
                          <RowActionsMenu
                            actions={[
                              { label: 'Entregar', onClick: () => onMovimiento(a.id, 'ENTREGA'), disabled: !a.activo || a.enBodega <= 0 },
                              { label: 'Registrar devolución', onClick: () => onMovimiento(a.id, 'DEVOLUCION'), disabled: a.entregado <= 0 },
                              { label: 'Dar de baja', onClick: () => onMovimiento(a.id, 'BAJA'), danger: true },
                              { label: 'Ajustar conteo', onClick: () => onMovimiento(a.id, 'AJUSTE') },
                              { label: 'Editar artículo', icon: <Pencil size={14} />, onClick: () => setEditando(a) },
                              { label: a.activo ? 'Desactivar' : 'Activar', icon: <Power size={14} />, onClick: () => alternarActivo(a), hint: a.activo ? 'Deja de aparecer al registrar entradas y entregas; el historial se conserva.' : undefined },
                            ]}
                          />
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {(crearAbierto || editando) && (
        <ArticuloModal
          articulo={editando}
          onClose={() => { setEditando(null); onCrearCerrado(); }}
          onSaved={() => { setEditando(null); onCrearCerrado(); cargar(); onCambio(); }}
        />
      )}
    </>
  );
}
