import { useEffect, useState } from 'react';
import { getTenencias } from '../../../services/inventario.service';
import type { Tenencia } from '../../../types/inventario';
import { TIPO_ARTICULO_LABEL } from '../../../types/inventario';
import ClearFiltersButton from '../../../components/common/ClearFiltersButton';
import ColumnFilter, { ChipsFiltros, FilaSinResultados } from '../../../components/common/ColumnFilter';
import { useColumnFilters } from '../../../hooks/useColumnFilters';
import { useResizableColumns } from '../../../hooks/useResizableColumns';
import { formatoFecha, mensajeError, nombreArticulo, pluralUnidad } from './inventarioUi';

/** Quién tiene qué: lo entregado y todavía no devuelto, por guardia o por puesto. */
export default function TenenciasTab({ recarga }: { recarga: number }) {
  const tablaRef = useResizableColumns('op-inventario-tenencias');
  const [filas, setFilas] = useState<Tenencia[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');

  useEffect(() => {
    setLoading(true);
    getTenencias()
      .then((t) => { setFilas(t); setError(''); })
      .catch((err) => setError(mensajeError(err, 'No se pudo cargar lo entregado.')))
      .finally(() => setLoading(false));
  }, [recarga]);

  const cf = useColumnFilters<Tenencia>(filas, [
    { key: 'quien', etiqueta: 'Lo tiene', tipo: 'texto', getValue: (t) => t.nombre },
    { key: 'tipoTenedor', etiqueta: 'Es un', tipo: 'valores', getValues: (t) => ({ valor: t.tenedorTipo, etiqueta: t.tenedorTipo === 'GUARDIA' ? 'Guardia' : 'Puesto' }) },
    { key: 'articulo', etiqueta: 'Artículo', tipo: 'texto', getValue: (t) => `${t.articulo} ${t.variante}` },
    { key: 'tipo', etiqueta: 'Tipo', tipo: 'valores', getValues: (t) => ({ valor: t.tipoArticulo, etiqueta: TIPO_ARTICULO_LABEL[t.tipoArticulo] }) },
    { key: 'cantidad', etiqueta: 'Cantidad', tipo: 'numero', getValue: (t) => t.cantidad },
  ]);
  const q = search.trim().toLowerCase();
  const visibles = cf.filas.filter((t) => !q || `${t.nombre} ${t.articulo} ${t.variante}`.toLowerCase().includes(q));
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
            placeholder="Buscar por guardia, puesto o artículo..."
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
          <div className="loading-state">Cargando...</div>
        ) : filas.length === 0 ? (
          <div className="empty-state">Nada entregado todavía. Cuando entregues uniformes, implementos o municiones aparecerán aquí hasta que se devuelvan.</div>
        ) : (
          <div className="tasks-table-wrapper">
            <table className="tasks-table resizable-table" ref={tablaRef}>
              <thead>
                <tr>
                  <th>Lo tiene <ColumnFilter cf={cf} col="quien" orden={cf.ordenDe('quien')} /></th>
                  <th>Es un <ColumnFilter cf={cf} col="tipoTenedor" orden={cf.ordenDe('tipoTenedor')} /></th>
                  <th>Artículo <ColumnFilter cf={cf} col="articulo" orden={cf.ordenDe('articulo')} /></th>
                  <th>Tipo <ColumnFilter cf={cf} col="tipo" orden={cf.ordenDe('tipo')} /></th>
                  <th>Cantidad <ColumnFilter cf={cf} col="cantidad" orden={cf.ordenDe('cantidad')} /></th>
                  <th>Última entrega</th>
                </tr>
              </thead>
              <tbody>
                {visibles.length === 0 && <FilaSinResultados columnas={6} mensaje="Nada coincide con los filtros." onLimpiar={hayFiltros ? limpiar : undefined} />}
                {visibles.map((t) => (
                  <tr key={`${t.articuloId}|${t.tenedor}`}>
                    <td style={{ fontWeight: 600 }}>
                      {t.nombre}
                      {t.cedula && <div style={{ fontSize: '0.75rem', color: '#718096', fontWeight: 400 }}>{t.cedula}</div>}
                    </td>
                    <td>{t.tenedorTipo === 'GUARDIA' ? 'Guardia' : 'Puesto'}</td>
                    <td>{nombreArticulo(t.articulo, t.variante)}</td>
                    <td>{TIPO_ARTICULO_LABEL[t.tipoArticulo]}</td>
                    <td style={{ fontWeight: 700 }}>{t.cantidad} <span style={{ fontWeight: 400, color: '#718096', fontSize: '0.78rem' }}>{pluralUnidad(t.unidad, t.cantidad)}</span></td>
                    <td style={{ fontSize: '0.82rem' }}>{formatoFecha(t.ultimaFecha)}</td>
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
