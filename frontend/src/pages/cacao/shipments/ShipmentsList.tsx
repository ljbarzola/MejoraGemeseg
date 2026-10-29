import { useState, useEffect } from 'react';
import PageHeader from '../../../components/common/PageHeader';
import ClearFiltersButton from '../../../components/common/ClearFiltersButton';
import { useNavigate } from 'react-router-dom';
import { getShipments } from '../../../services/cacao.service';
import { formatDateEc } from '../utils';
import { useTablaCacao } from '../useTablaCacao';

function getDisplayStatus(s: any) {
  if (s.status === 'CANCELLED') return { label: 'Anulado', bg: '#fed7d7', color: '#9b2c2c' };
  if (s.receivable?.status === 'RECEIVED') return { label: 'Cobrado', bg: '#c6f6d5', color: '#276749' };
  if (s.receivable?.status === 'PARTIAL') return { label: 'Parcial', bg: '#fefcbf', color: '#975a16' };
  if (s.status === 'COMPLETED') return { label: 'Completado', bg: '#c6f6d5', color: '#276749' };
  return { label: 'Pendiente', bg: '#fefcbf', color: '#975a16' };
}

export default function ShipmentsList() {
  const navigate = useNavigate();
  const [shipments, setShipments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getShipments().then(setShipments).finally(() => setLoading(false));
  }, []);

  const { tabla, selectorColumnas, buscador, botonExportar, limpiarBusqueda, hayBusqueda } = useTablaCacao<any>({
    clave: 'embarques',
    filas: shipments,
    idFila: (s) => s.id,
    ordenInicial: 'id',
    direccionInicial: 'desc',
    principal: {
      key: 'id', filtro: { tipo: 'texto', getValue: (s) => `EMB-${String(s.id).padStart(4, '0')}` }, excel: { valor: (s) => `EMB-${String(s.id).padStart(4, '0')}` }, ancho: 100,
      label: 'ID',
      orden: (s) => s.id,
      celda: (s) => (
        <span style={{ fontFamily: 'monospace', fontWeight: 600, color: '#2f855a' }}>EMB-{String(s.id).padStart(4, '0')}</span>
      ),
    },
    columnas: [
      { key: 'fecha', filtro: { tipo: 'fecha', soloDia: true, getValue: (s) => s.date }, excel: { tipo: 'fecha' }, label: 'Fecha', orden: (s) => new Date(s.date).getTime(), celda: (s) => formatDateEc(s.date) },
      { key: 'cliente', filtro: { tipo: 'valores', vacio: 'Sin cliente', getValues: (s) => (s.client?.name ? { valor: String(s.client.id ?? s.client.name), etiqueta: s.client.name } : null) }, ancho: 200, label: 'Cliente', orden: (s) => s.client?.name, celda: (s) => s.client?.name || '—' },
      { key: 'referencia', filtro: { tipo: 'texto', getValue: (s) => s.contractRef }, ancho: 150, label: 'Referencia', orden: (s) => s.contractRef, celda: (s) => s.contractRef },
      // `totalWeight` está en la unidad del embarque (sacos, quintales…); los kilos van en `totalWeightKg`.
      { key: 'peso', filtro: { tipo: 'numero', formato: (n) => `${n.toLocaleString()} kg`, getValue: (s) => s.totalWeightKg ?? s.totalWeight }, excel: { titulo: 'Peso Total (kg)' }, label: 'Peso Total', orden: (s) => s.totalWeightKg ?? s.totalWeight, celda: (s) => `${(s.totalWeightKg ?? s.totalWeight).toLocaleString()} kg` },
      { key: 'costo', filtro: { tipo: 'numero', formato: (n) => `$${n.toFixed(2)}`, getValue: (s) => s.totalCost }, excel: { tipo: 'moneda', titulo: 'Costo Total ($)' }, label: 'Costo Total', orden: (s) => s.totalCost, celda: (s) => `$${s.totalCost.toFixed(2)}` },
      { key: 'precio', filtro: { tipo: 'numero', formato: (n) => `$${n.toFixed(2)}/kg`, getValue: (s) => s.salePrice }, excel: { tipo: 'moneda', titulo: 'Precio Venta ($/kg)' }, label: 'Precio Venta', orden: (s) => s.salePrice, celda: (s) => `$${s.salePrice.toFixed(2)}/kg` },
      {
        key: 'margen', filtro: { tipo: 'numero', formato: (n) => `${n}%`, getValue: (s) => s.margin }, excel: { tipo: 'porcentaje', titulo: 'Margen (%)' },
        label: 'Margen',
        orden: (s) => s.margin,
        celda: (s) => <span style={{ color: s.margin >= 0 ? '#38a169' : '#e53e3e', fontWeight: 600 }}>{s.margin}%</span>,
      },
      {
        key: 'estado', filtro: { tipo: 'valores', orden: ['Pendiente', 'Parcial', 'Completado', 'Cobrado'], getValues: (s) => getDisplayStatus(s).label }, ancho: 120,
        label: 'Estado',
        orden: (s) => getDisplayStatus(s).label,
        celda: (s) => {
          const st = getDisplayStatus(s);
          return <span className="status-badge" style={{ backgroundColor: st.bg, color: st.color }}>{st.label}</span>;
        },
      },
    ],
    acciones: (s) => (
      <button className="btn-sm-edit btn-sm-edit--texto" onClick={() => navigate(`/cacao/shipments/${s.id}`, { state: { from: '/cacao/shipments' } })}>Ver</button>
    ),
  });

  return (
    <div className="page-container">
      <PageHeader
        eyebrow="Cacao"
        title="Embarques"
        description="Ventas y exportaciones. Cada embarque descuenta el inventario y genera su cuenta por cobrar."
        actions={
          <>
            <button className="auth-btn" onClick={() => navigate('/cacao/shipments/new')}>+ Nuevo Embarque</button>
          </>
        }
      />

      <div className="filter-bar">
        <div className="filter-bar-fields">{buscador}</div>
        <div className="filter-bar-actions">
          {selectorColumnas}
          {botonExportar}
          <ClearFiltersButton onClear={limpiarBusqueda} disabled={!hayBusqueda} />
        </div>
      </div>

      <div className="admin-section">
        {loading ? (
          <div className="loading-state">Cargando embarques...</div>
        ) : shipments.length === 0 ? (
          <div className="empty-state">Todavía no hay embarques. Cuando vendas cacao a un cliente, regístralo con «+ Nuevo Embarque»: descuenta del inventario y crea la cuenta por cobrar.</div>
        ) : (
          tabla
        )}
      </div>
    </div>
  );
}
