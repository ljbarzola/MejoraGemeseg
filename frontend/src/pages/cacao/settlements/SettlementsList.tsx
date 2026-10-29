import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { getSettlements } from '../../../services/cacao.service';
import { formatDateEc } from '../utils';
import ColumnFilter, { ChipsFiltros, FilaSinResultados } from '../../../components/common/ColumnFilter';
import ClearFiltersButton from '../../../components/common/ClearFiltersButton';
import { useColumnFilters } from '../../../hooks/useColumnFilters';

export default function SettlementsList() {
  const navigate = useNavigate();
  const location = useLocation();
  const [settlements, setSettlements] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getSettlements().then(setSettlements).finally(() => setLoading(false));
  }, []);

  // Filtros en la cabecera de cada columna (se aplican a las filas ya cargadas).
  const cf = useColumnFilters<any>(settlements, [
    { key: 'id', etiqueta: 'ID', tipo: 'texto', getValue: (s) => `LIQ-${String(s.id).padStart(4, '0')}` },
    { key: 'fecha', etiqueta: 'Fecha', tipo: 'fecha', soloDia: true, getValue: (s) => s.date },
    { key: 'proveedor', etiqueta: 'Proveedor', tipo: 'valores', vacio: 'Sin proveedor', getValues: (s) => (s.supplier?.name ? { valor: String(s.supplier.id ?? s.supplier.name), etiqueta: s.supplier.name } : null) },
    // Periodo = tramo: la liquidación cuenta si su periodo se solapa con el rango elegido.
    { key: 'periodo', etiqueta: 'Periodo', tipo: 'fecha', soloDia: true, getValue: (s) => s.periodStart, getFin: (s) => s.periodEnd },
    { key: 'peso', etiqueta: 'Peso Neto Total', tipo: 'numero', formato: (n) => `${n.toLocaleString()} kg`, getValue: (s) => s.totalNetWeight },
    { key: 'deducciones', etiqueta: 'Deducciones', tipo: 'numero', formato: (n) => `$${n.toFixed(2)}`, getValue: (s) => s.totalDeductions },
    { key: 'precio', etiqueta: 'Precio Final', tipo: 'numero', formato: (n) => `$${n.toFixed(2)}/kg`, getValue: (s) => s.finalPrice },
    { key: 'monto', etiqueta: 'Monto Total', tipo: 'numero', formato: (n) => `$${n.toFixed(2)}`, getValue: (s) => s.totalAmount },
    { key: 'estado', etiqueta: 'Estado', tipo: 'valores', orden: ['PENDING', 'PAID'], getValues: (s) => (s.status === 'PAID' ? { valor: 'PAID', etiqueta: 'Pagada' } : { valor: 'PENDING', etiqueta: 'Pendiente' }) },
  ]);
  const filas = cf.filas;

  return (
    <div className="page-container">
      <div className="page-header-row">
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button className="cacao-back-btn" onClick={() => navigate(location.state?.from || '/cacao')}>← Volver</button>
          <div>
            <p className="page-eyebrow">CACAO</p>
            <h1>Liquidaciones</h1>
          </div>
        </div>
        <button className="auth-btn" onClick={() => navigate('/cacao/settlements/new')}>+ Nueva Liquidación</button>
      </div>

      <div className="filter-bar">
        <div className="filter-bar-actions">
          <ClearFiltersButton onClear={cf.limpiar} disabled={!cf.hayFiltros} />
        </div>
      </div>

      <ChipsFiltros cf={cf} />

      <div className="admin-section">
        {loading ? (
          <div className="loading-state">Cargando liquidaciones...</div>
        ) : settlements.length === 0 ? (
          <div className="empty-state">No hay liquidaciones registradas.</div>
        ) : (
          <div className="tasks-table-wrapper">
            <table className="tasks-table">
              <thead>
                <tr>
                  <th>ID<ColumnFilter cf={cf} col="id" orden={cf.ordenDe('id')} /></th>
                  <th>Fecha<ColumnFilter cf={cf} col="fecha" orden={cf.ordenDe('fecha')} /></th>
                  <th>Proveedor<ColumnFilter cf={cf} col="proveedor" orden={cf.ordenDe('proveedor')} /></th>
                  <th>Periodo<ColumnFilter cf={cf} col="periodo" orden={cf.ordenDe('periodo')} /></th>
                  <th>Peso Neto Total<ColumnFilter cf={cf} col="peso" orden={cf.ordenDe('peso')} /></th>
                  <th>Deducciones<ColumnFilter cf={cf} col="deducciones" orden={cf.ordenDe('deducciones')} /></th>
                  <th>Precio Final<ColumnFilter cf={cf} col="precio" orden={cf.ordenDe('precio')} /></th>
                  <th>Monto Total<ColumnFilter cf={cf} col="monto" orden={cf.ordenDe('monto')} /></th>
                  <th>Estado<ColumnFilter cf={cf} col="estado" orden={cf.ordenDe('estado')} /></th>
                  <th className="no-print"></th>
                </tr>
              </thead>
              <tbody>
                {filas.length === 0 && (
                  <FilaSinResultados columnas={10} mensaje="No hay liquidaciones que coincidan con los filtros." onLimpiar={cf.limpiar} />
                )}
                {filas.map((s) => (
                  <tr key={s.id}>
                    <td style={{ fontFamily: 'monospace', fontWeight: 600, color: '#6b46c1' }}>LIQ-{String(s.id).padStart(4, '0')}</td>
                    <td>{formatDateEc(s.date)}</td>
                    <td>{s.supplier?.name || '—'}</td>
                    <td>{formatDateEc(s.periodStart)} - {formatDateEc(s.periodEnd)}</td>
                    <td>{s.totalNetWeight.toLocaleString()} kg</td>
                    <td>${s.totalDeductions.toFixed(2)}</td>
                    <td>${s.finalPrice.toFixed(2)}/kg</td>
                    <td>${s.totalAmount.toFixed(2)}</td>
                    <td>
                      <span className="status-badge" style={{ backgroundColor: s.status === 'PAID' ? '#c6f6d5' : '#fefcbf', color: s.status === 'PAID' ? '#276749' : '#975a16' }}>
                        {s.status === 'PAID' ? 'Pagada' : 'Pendiente'}
                      </span>
                    </td>
                    <td className="no-print">
                      <button className="btn-sm-edit" onClick={() => navigate(`/cacao/settlements/${s.id}`, { state: { from: '/cacao/settlements' } })}>Ver</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
