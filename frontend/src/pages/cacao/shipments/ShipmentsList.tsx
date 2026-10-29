import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { getShipments } from '../../../services/cacao.service';
import { formatDateEc } from '../utils';
import ColumnFilter, { ChipsFiltros, FilaSinResultados } from '../../../components/common/ColumnFilter';
import ClearFiltersButton from '../../../components/common/ClearFiltersButton';
import { useColumnFilters } from '../../../hooks/useColumnFilters';

export default function ShipmentsList() {
  const navigate = useNavigate();
  const location = useLocation();
  const [shipments, setShipments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getShipments().then(setShipments).finally(() => setLoading(false));
  }, []);

  function getDisplayStatus(s: any) {
    if (s.receivable?.status === 'RECEIVED') return { label: 'Cobrado', bg: '#c6f6d5', color: '#276749' };
    if (s.receivable?.status === 'PARTIAL') return { label: 'Parcial', bg: '#fefcbf', color: '#975a16' };
    if (s.status === 'COMPLETED') return { label: 'Completado', bg: '#c6f6d5', color: '#276749' };
    return { label: 'Pendiente', bg: '#fefcbf', color: '#975a16' };
  }

  // Filtros en la cabecera de cada columna (se aplican a las filas ya cargadas).
  const cf = useColumnFilters<any>(shipments, [
    { key: 'id', etiqueta: 'ID', tipo: 'texto', getValue: (s) => `EMB-${String(s.id).padStart(4, '0')}` },
    { key: 'fecha', etiqueta: 'Fecha', tipo: 'fecha', soloDia: true, getValue: (s) => s.date },
    { key: 'cliente', etiqueta: 'Cliente', tipo: 'valores', vacio: 'Sin cliente', getValues: (s) => (s.client?.name ? { valor: String(s.client.id ?? s.client.name), etiqueta: s.client.name } : null) },
    { key: 'referencia', etiqueta: 'Referencia', tipo: 'texto', getValue: (s) => s.contractRef },
    { key: 'peso', etiqueta: 'Peso Total', tipo: 'numero', formato: (n) => `${n.toLocaleString()} kg`, getValue: (s) => s.totalWeight },
    { key: 'costo', etiqueta: 'Costo Total', tipo: 'numero', formato: (n) => `$${n.toFixed(2)}`, getValue: (s) => s.totalCost },
    { key: 'venta', etiqueta: 'Precio Venta', tipo: 'numero', formato: (n) => `$${n.toFixed(2)}/kg`, getValue: (s) => s.salePrice },
    { key: 'margen', etiqueta: 'Margen', tipo: 'numero', formato: (n) => `${n}%`, getValue: (s) => s.margin },
    { key: 'estado', etiqueta: 'Estado', tipo: 'valores', orden: ['Pendiente', 'Parcial', 'Completado', 'Cobrado'], getValues: (s) => getDisplayStatus(s).label },
  ]);
  const filas = cf.filas;

  return (
    <div className="page-container">
      <div className="page-header-row">
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button className="cacao-back-btn" onClick={() => navigate(location.state?.from || '/cacao')}>← Volver</button>
          <div>
            <p className="page-eyebrow">CACAO</p>
            <h1>Embarques</h1>
          </div>
        </div>
        <button className="auth-btn" onClick={() => navigate('/cacao/shipments/new')}>+ Nuevo Embarque</button>
      </div>

      <div className="filter-bar">
        <div className="filter-bar-actions">
          <ClearFiltersButton onClear={cf.limpiar} disabled={!cf.hayFiltros} />
        </div>
      </div>

      <ChipsFiltros cf={cf} />

      <div className="admin-section">
        {loading ? (
          <div className="loading-state">Cargando embarques...</div>
        ) : shipments.length === 0 ? (
          <div className="empty-state">No hay embarques registrados.</div>
        ) : (
          <div className="tasks-table-wrapper">
            <table className="tasks-table">
              <thead>
                <tr>
                  <th>ID<ColumnFilter cf={cf} col="id" orden={cf.ordenDe('id')} /></th>
                  <th>Fecha<ColumnFilter cf={cf} col="fecha" orden={cf.ordenDe('fecha')} /></th>
                  <th>Cliente<ColumnFilter cf={cf} col="cliente" orden={cf.ordenDe('cliente')} /></th>
                  <th>Referencia<ColumnFilter cf={cf} col="referencia" orden={cf.ordenDe('referencia')} /></th>
                  <th>Peso Total<ColumnFilter cf={cf} col="peso" orden={cf.ordenDe('peso')} /></th>
                  <th>Costo Total<ColumnFilter cf={cf} col="costo" orden={cf.ordenDe('costo')} /></th>
                  <th>Precio Venta<ColumnFilter cf={cf} col="venta" orden={cf.ordenDe('venta')} /></th>
                  <th>Margen<ColumnFilter cf={cf} col="margen" orden={cf.ordenDe('margen')} /></th>
                  <th>Estado<ColumnFilter cf={cf} col="estado" orden={cf.ordenDe('estado')} /></th>
                  <th className="no-print"></th>
                </tr>
              </thead>
              <tbody>
                {filas.length === 0 && (
                  <FilaSinResultados columnas={10} mensaje="No hay embarques que coincidan con los filtros." onLimpiar={cf.limpiar} />
                )}
                {filas.map((s) => {
                  const st = getDisplayStatus(s);
                  return (
                    <tr key={s.id}>
                      <td style={{ fontFamily: 'monospace', fontWeight: 600, color: '#2f855a' }}>EMB-{String(s.id).padStart(4, '0')}</td>
                      <td>{formatDateEc(s.date)}</td>
                      <td>{s.client?.name || '—'}</td>
                      <td>{s.contractRef}</td>
                      <td>{s.totalWeight.toLocaleString()} kg</td>
                      <td>${s.totalCost.toFixed(2)}</td>
                      <td>${s.salePrice.toFixed(2)}/kg</td>
                      <td style={{ color: s.margin >= 0 ? '#38a169' : '#e53e3e', fontWeight: 600 }}>{s.margin}%</td>
                      <td>
                        <span className="status-badge" style={{ backgroundColor: st.bg, color: st.color }}>
                          {st.label}
                        </span>
                      </td>
                      <td className="no-print">
                        <button className="btn-sm-edit" onClick={() => navigate(`/cacao/shipments/${s.id}`, { state: { from: '/cacao/shipments' } })}>Ver</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
