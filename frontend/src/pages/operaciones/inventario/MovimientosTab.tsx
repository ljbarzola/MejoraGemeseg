import { useEffect, useState } from 'react';
import { getMovimientos } from '../../../services/inventario.service';
import type { MovimientoInventario } from '../../../types/inventario';
import { TIPO_MOVIMIENTO_LABEL } from '../../../types/inventario';
import ClearFiltersButton from '../../../components/common/ClearFiltersButton';
import ColumnFilter, { ChipsFiltros, FilaSinResultados } from '../../../components/common/ColumnFilter';
import { useColumnFilters } from '../../../hooks/useColumnFilters';
import { useResizableColumns } from '../../../hooks/useResizableColumns';
import { COLOR_MOVIMIENTO, formatoFecha, mensajeError, nombreArticulo } from './inventarioUi';

/** Kardex: todo lo que entró, salió o se corrigió, del más reciente al más antiguo (hasta 500 movimientos). */
export default function MovimientosTab({ recarga }: { recarga: number }) {
  const tablaRef = useResizableColumns('op-inventario-movimientos');
  const [filas, setFilas] = useState<MovimientoInventario[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');

  useEffect(() => {
    setLoading(true);
    getMovimientos()
      .then((m) => { setFilas(m); setError(''); })
      .catch((err) => setError(mensajeError(err, 'No se pudieron cargar los movimientos.')))
      .finally(() => setLoading(false));
  }, [recarga]);

  const cf = useColumnFilters<MovimientoInventario>(filas, [
    { key: 'fecha', etiqueta: 'Fecha', tipo: 'fecha', getValue: (m) => m.fecha },
    { key: 'tipo', etiqueta: 'Movimiento', tipo: 'valores', orden: Object.keys(TIPO_MOVIMIENTO_LABEL), getValues: (m) => ({ valor: m.tipo, etiqueta: TIPO_MOVIMIENTO_LABEL[m.tipo] }) },
    { key: 'articulo', etiqueta: 'Artículo', tipo: 'texto', getValue: (m) => `${m.articulo} ${m.variante}` },
    { key: 'cantidad', etiqueta: 'Cantidad', tipo: 'numero', getValue: (m) => m.cantidad },
    { key: 'quien', etiqueta: 'A quién / de quién', tipo: 'texto', getValue: (m) => `${m.guardiaNombre ?? ''} ${m.puestoNombre ?? ''}` },
    { key: 'por', etiqueta: 'Registró', tipo: 'valores', getValues: (m) => ({ valor: m.porNombre, etiqueta: m.porNombre }) },
  ]);
  const q = search.trim().toLowerCase();
  const visibles = cf.filas.filter(
    (m) => !q || `${m.articulo} ${m.variante} ${m.guardiaNombre ?? ''} ${m.puestoNombre ?? ''} ${m.motivo ?? ''} ${m.documento ?? ''}`.toLowerCase().includes(q),
  );
  const hayFiltros = !!search || cf.hayFiltros;
  const limpiar = () => { setSearch(''); cf.limpiar(); };

  return (
    <>
      {error && <div className="form-error" style={{ marginBottom: 16 }}>{error}</div>}
      <div className="filter-bar">
        <div className="filter-bar-fields">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por artículo, guardia, puesto, motivo o documento..."
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
          <div className="loading-state">Cargando movimientos...</div>
        ) : filas.length === 0 ? (
          <div className="empty-state">Todavía no hay movimientos. Registra la primera entrada de un artículo para empezar.</div>
        ) : (
          <div className="tasks-table-wrapper">
            <table className="tasks-table resizable-table" ref={tablaRef}>
              <thead>
                <tr>
                  <th>Fecha <ColumnFilter cf={cf} col="fecha" orden={cf.ordenDe('fecha')} /></th>
                  <th>Movimiento <ColumnFilter cf={cf} col="tipo" orden={cf.ordenDe('tipo')} /></th>
                  <th>Artículo <ColumnFilter cf={cf} col="articulo" orden={cf.ordenDe('articulo')} /></th>
                  <th>Cantidad <ColumnFilter cf={cf} col="cantidad" orden={cf.ordenDe('cantidad')} /></th>
                  <th>A quién / de quién <ColumnFilter cf={cf} col="quien" orden={cf.ordenDe('quien')} /></th>
                  <th>Detalle</th>
                  <th>Registró <ColumnFilter cf={cf} col="por" orden={cf.ordenDe('por')} /></th>
                </tr>
              </thead>
              <tbody>
                {visibles.length === 0 && <FilaSinResultados columnas={7} mensaje="Nada coincide con los filtros." onLimpiar={hayFiltros ? limpiar : undefined} />}
                {visibles.map((m) => (
                  <tr key={m.id}>
                    <td style={{ fontSize: '0.82rem' }}>{formatoFecha(m.fecha)}</td>
                    <td><span className="status-badge" style={{ background: COLOR_MOVIMIENTO[m.tipo].bg, color: COLOR_MOVIMIENTO[m.tipo].fg }}>{TIPO_MOVIMIENTO_LABEL[m.tipo]}</span></td>
                    <td>{nombreArticulo(m.articulo, m.variante)}</td>
                    <td style={{ fontWeight: 700 }}>{m.tipo === 'AJUSTE' && m.cantidad > 0 ? `+${m.cantidad}` : m.cantidad}</td>
                    <td style={{ fontSize: '0.85rem' }}>{m.guardiaNombre ?? m.puestoNombre ?? '—'}</td>
                    <td style={{ fontSize: '0.82rem', color: '#4a5568' }}>
                      {[m.estadoDevuelto && `Vuelve ${m.estadoDevuelto === 'DANADO' ? 'dañado' : m.estadoDevuelto === 'NUEVO' ? 'nuevo' : 'usado'}`, m.motivo, m.documento && `Doc. ${m.documento}`].filter(Boolean).join(' · ') || '—'}
                    </td>
                    <td style={{ fontSize: '0.82rem' }}>{m.porNombre}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
