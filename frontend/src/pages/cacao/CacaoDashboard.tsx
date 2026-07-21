import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getDashboard } from '../../services/cacao.service';

const SectionIcon = ({ d, color }: { d: string; color: string }) => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d={d} />
  </svg>
);

const ICONS: Record<string, { d: string; color: string }> = {
  receptions: { d: 'M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z', color: '#2b6cb0' },
  lots: { d: 'M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4', color: '#2c7a7b' },
  settlements: { d: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z', color: '#6b46c1' },
  priceFixings: { d: 'M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6', color: '#b7791f' },
  shipments: { d: 'M1 18l5-4 5 4 5-4 5 4', color: '#2f855a' },
  payables: { d: 'M17 1l4 4-4 4', color: '#c53030' },
  receivables: { d: 'M7 1L3 5l4 4', color: '#276749' },
  suppliers: { d: 'M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2', color: '#4a5568' },
  clients: { d: 'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2', color: '#4a5568' },
  qualities: { d: 'M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z', color: '#d69e2e' },
  kardex: { d: 'M3 3v18h18', color: '#e53e3e' },
};

export default function CacaoDashboard() {
  const navigate = useNavigate();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getDashboard()
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const fmt = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const fmtKg = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 0 }) + ' kg';

  if (loading) return <div className="loading-state">Cargando dashboard...</div>;

  return (
    <div className="page-container">
      <div className="page-header-row">
        <div>
          <p className="page-eyebrow">MÓDULO CACAO</p>
          <h1>Dashboard</h1>
        </div>
        <button
          onClick={() => navigate('/cacao/guia')}
          style={{
            padding: '10px 20px',
            backgroundColor: '#2d3748',
            color: 'white',
            border: 'none',
            borderRadius: '8px',
            fontSize: '13px',
            fontWeight: 600,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
          }}
        >
          📖 Guía del Sistema
        </button>
      </div>

      <div className="admin-section">
        {/* KPIs */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '28px' }}>
          {[
            { label: 'Valor Inventario', value: fmt(data?.inventoryValue || 0), sub: fmtKg(data?.totalInventoryKg || 0), color: '#2b6cb0', icon: '📦', path: '/cacao/lots' },
            { label: 'Exposición Sin Fijar', value: fmt(data?.openFixingValue || 0), sub: fmtKg(data?.openFixingKg || 0) + ' pendientes', color: '#b7791f', icon: '⚠️', path: '/cacao/price-fixings' },
            { label: 'CxP Pendiente', value: fmt(data?.totalPayables || 0), sub: data?.payableCount ? `${data.payableCount} FACTURAS` : 'SALDO', color: '#e53e3e', icon: '📤', path: '/cacao/payables' },
            { label: 'CxC Pendiente', value: fmt(data?.totalReceivables || 0), sub: data?.receivableCount ? `${data.receivableCount} FACTURAS` : 'SALDO', color: '#38a169', icon: '📥', path: '/cacao/receivables' },
          ].map((kpi) => (
            <div
              key={kpi.path}
              onClick={() => navigate(kpi.path)}
              style={{
                padding: '18px 20px',
                background: 'white',
                border: '1px solid #e2e8f0',
                borderRadius: '10px',
                cursor: 'pointer',
                transition: 'all 0.2s',
                boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = kpi.color; e.currentTarget.style.boxShadow = `0 4px 12px ${kpi.color}22`; }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#e2e8f0'; e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.06)'; }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <div style={{ fontSize: '12px', color: '#718096', fontWeight: 500, marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{kpi.label}</div>
                  <div style={{ fontSize: '26px', fontWeight: 700, color: '#2d3748', lineHeight: 1.1 }}>${kpi.value}</div>
                </div>
                <div style={{ fontSize: '28px', opacity: 0.6 }}>{kpi.icon}</div>
              </div>
              <div style={{ fontSize: '13px', color: '#a0aec0', marginTop: '6px' }}>{kpi.sub}</div>
            </div>
          ))}
        </div>

        {/* Navegación por secciones */}
        <div style={{ marginBottom: '28px' }}>
          <h2 style={{ fontSize: '15px', fontWeight: 600, color: '#4a5568', marginBottom: '14px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Accesos directos</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '12px' }}>
            {[
              { label: 'Recepciones', desc: 'Registrar entradas de cacao', path: '/cacao/receptions', icon: ICONS.receptions },
              { label: 'Lotes', desc: 'Inventario y seguimiento', path: '/cacao/lots', icon: ICONS.lots },
              { label: 'Fijaciones', desc: 'Fijar precio definitivo', path: '/cacao/price-fixings', icon: ICONS.priceFixings },
              { label: 'Liquidaciones', desc: 'Liquidar compras a proveedores', path: '/cacao/settlements', icon: ICONS.settlements },
              { label: 'Embarques', desc: 'Exportaciones y ventas', path: '/cacao/shipments', icon: ICONS.shipments },
              { label: 'CxP', desc: 'Pendientes a proveedores', path: '/cacao/payables', icon: ICONS.payables },
              { label: 'CxC', desc: 'Cobros a clientes', path: '/cacao/receivables', icon: ICONS.receivables },
              { label: 'Kardex', desc: 'Historial de movimientos', path: '/cacao/kardex', icon: ICONS.kardex },
              { label: 'Calidades', desc: 'Configurar calidades y descuentos', path: '/cacao/qualities', icon: ICONS.qualities },
              { label: 'Proveedores', desc: 'Directorio de proveedores', path: '/cacao/suppliers', icon: ICONS.suppliers },
              { label: 'Clientes', desc: 'Directorio de clientes', path: '/cacao/clients', icon: ICONS.clients },
              { label: '📖 Guía', desc: 'Cómo usar el sistema', path: '/cacao/guia', icon: { d: 'M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z', color: '#2d3748' } },
            ].map((item) => (
              <button
                key={item.path}
                onClick={() => navigate(item.path)}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'flex-start',
                  gap: '8px',
                  padding: '16px',
                  background: 'white',
                  border: '1px solid #e2e8f0',
                  borderRadius: '10px',
                  cursor: 'pointer',
                  textAlign: 'left',
                  transition: 'all 0.2s',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = item.icon.color; e.currentTarget.style.boxShadow = `0 4px 12px ${item.icon.color}18`; e.currentTarget.style.transform = 'translateY(-1px)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#e2e8f0'; e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.04)'; e.currentTarget.style.transform = 'translateY(0)'; }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div style={{
                    width: '34px',
                    height: '34px',
                    borderRadius: '8px',
                    background: `${item.icon.color}10`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}>
                    <SectionIcon d={item.icon.d} color={item.icon.color} />
                  </div>
                  <span style={{ fontSize: '14px', fontWeight: 600, color: '#2d3748' }}>{item.label}</span>
                </div>
                <span style={{ fontSize: '12px', color: '#a0aec0', lineHeight: 1.3 }}>{item.desc}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Últimos Embarques */}
        <div>
          <h2 style={{ fontSize: '15px', fontWeight: 600, color: '#4a5568', marginBottom: '14px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Últimos Embarques</h2>
          {!data?.recentShipments?.length ? (
            <div className="empty-state">No hay embarques recientes.</div>
          ) : (
            <div className="tasks-table-wrapper">
              <table className="tasks-table">
                <thead>
                  <tr>
                    <th>Fecha</th>
                    <th>Cliente</th>
                    <th>Referencia</th>
                    <th>Peso Total</th>
                    <th>Precio Venta</th>
                    <th>Margen</th>
                  </tr>
                </thead>
                <tbody>
                  {data.recentShipments.map((s: any) => (
                    <tr key={s.id}>
                      <td>{new Date(s.date).toLocaleDateString('es-EC')}</td>
                      <td>{s.client?.name || '—'}</td>
                      <td>{s.contractRef}</td>
                      <td>{fmtKg(s.totalWeight)}</td>
                      <td>{fmt(s.salePrice)}</td>
                      <td style={{ color: s.margin >= 0 ? '#38a169' : '#e53e3e', fontWeight: 600 }}>{s.margin}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
