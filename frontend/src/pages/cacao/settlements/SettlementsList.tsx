import { useState, useEffect } from 'react';
import PageHeader from '../../../components/common/PageHeader';
import { useNavigate } from 'react-router-dom';
import { getSettlements } from '../../../services/cacao.service';
import { formatDateEc, estadoLiquidacion } from '../utils';
import { useTablaCacao } from '../useTablaCacao';

export default function SettlementsList() {
  const navigate = useNavigate();
  const [settlements, setSettlements] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getSettlements().then(setSettlements).finally(() => setLoading(false));
  }, []);

  const { tabla, selectorColumnas } = useTablaCacao<any>({
    clave: 'liquidaciones',
    filas: settlements,
    idFila: (s) => s.id,
    ordenInicial: 'id',
    direccionInicial: 'desc',
    principal: {
      key: 'id', ancho: 100,
      label: 'ID',
      orden: (s) => s.id,
      celda: (s) => (
        <span style={{ fontFamily: 'monospace', fontWeight: 600, color: '#6b46c1' }}>LIQ-{String(s.id).padStart(4, '0')}</span>
      ),
    },
    columnas: [
      { key: 'fecha', label: 'Fecha', orden: (s) => new Date(s.date).getTime(), celda: (s) => formatDateEc(s.date) },
      { key: 'proveedor', ancho: 200, label: 'Proveedor', orden: (s) => s.supplier?.name, celda: (s) => s.supplier?.name || '—' },
      {
        key: 'periodo', ancho: 210,
        label: 'Periodo',
        orden: (s) => new Date(s.periodStart).getTime(),
        celda: (s) => `${formatDateEc(s.periodStart)} - ${formatDateEc(s.periodEnd)}`,
      },
      { key: 'peso', label: 'Peso Neto Total', orden: (s) => s.totalNetWeight, celda: (s) => `${s.totalNetWeight.toLocaleString()} kg` },
      { key: 'descuentos', label: 'Descuentos', orden: (s) => s.totalDeductions, celda: (s) => `${s.totalDeductions.toLocaleString()} kg` },
      { key: 'precio', label: 'Precio Final', orden: (s) => s.finalPrice, celda: (s) => `$${s.finalPrice.toFixed(2)}/kg` },
      { key: 'monto', label: 'Monto Total', orden: (s) => s.totalAmount, celda: (s) => `$${s.totalAmount.toFixed(2)}` },
      {
        key: 'estado', ancho: 130,
        label: 'Estado',
        orden: (s) => estadoLiquidacion(s.status).label,
        celda: (s) => (
          <span className="status-badge" style={{ backgroundColor: estadoLiquidacion(s.status).bg, color: estadoLiquidacion(s.status).color }}>
            {estadoLiquidacion(s.status).label}
          </span>
        ),
      },
    ],
    acciones: (s) => (
      <button className="btn-sm-edit" onClick={() => navigate(`/cacao/settlements/${s.id}`, { state: { from: '/cacao/settlements' } })}>Ver</button>
    ),
  });

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
        <div className="filter-bar-fields" />
        <div className="filter-bar-actions">{selectorColumnas}</div>
      </div>

      <div className="admin-section">
        {loading ? (
          <div className="loading-state">Cargando liquidaciones...</div>
        ) : settlements.length === 0 ? (
          <div className="empty-state">No hay liquidaciones registradas.</div>
        ) : (
          tabla
        )}
      </div>
    </div>
  );
}
