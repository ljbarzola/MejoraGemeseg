import { useState, useEffect } from 'react';
import PageHeader from '../../../components/common/PageHeader';
import { useNavigate } from 'react-router-dom';
import { getSettlements } from '../../../services/cacao.service';
import { formatDateEc, estadoLiquidacion } from '../utils';

export default function SettlementsList() {
  const navigate = useNavigate();
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
      <PageHeader
        eyebrow="Cacao"
        title="Liquidaciones"
        description="Lo que se le paga a cada proveedor por su cacao. Un gerente debe aprobar la liquidación antes de que nazca la deuda."
        actions={
          <>
            <button className="auth-btn" onClick={() => navigate('/cacao/settlements/new')}>+ Nueva Liquidación</button>
          </>
        }
      />

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
                  <th>ID</th>
                  <th>Fecha</th>
                  <th>Proveedor</th>
                  <th>Periodo</th>
                  <th>Peso Neto Total</th>
                  <th>Descuentos</th>
                  <th>Precio Final</th>
                  <th>Monto Total</th>
                  <th>Estado</th>
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
                    <td>{s.totalDeductions.toLocaleString()} kg</td>
                    <td>${s.finalPrice.toFixed(2)}/kg</td>
                    <td>${s.totalAmount.toFixed(2)}</td>
                    <td>
                      <span className="status-badge" style={{ backgroundColor: estadoLiquidacion(s.status).bg, color: estadoLiquidacion(s.status).color }}>
                        {estadoLiquidacion(s.status).label}
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
