import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getDashboard } from '../../services/cacao.service';
import PageHeader from '../../components/common/PageHeader';

const PASOS_INICIALES: Array<{ clave: 'calidades' | 'saco' | 'proveedores' | 'recepciones'; titulo: string; texto: string; ruta: string }> = [
  { clave: 'calidades', titulo: 'Crea tus calidades de cacao', texto: 'Define cuánto se descuenta por humedad e impurezas en cada calidad.', ruta: '/cacao/configuracion?tab=calidades' },
  { clave: 'saco', titulo: 'Configura el peso de tu saco', texto: 'Solo si compras o vendes en sacos; las toneladas y los kilos no lo necesitan.', ruta: '/cacao/configuracion?tab=unidades' },
  { clave: 'proveedores', titulo: 'Registra a tus proveedores', texto: 'Las personas y empresas a las que les compras cacao.', ruta: '/cacao/suppliers' },
  { clave: 'recepciones', titulo: 'Registra tu primera recepción', texto: 'Al guardarla se crea su lote y entra al inventario.', ruta: '/cacao/receptions/new' },
];

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

  const setup = data?.setup;
  const pasosPendientes = setup ? PASOS_INICIALES.filter((p) => !setup[p.clave]) : [];
  const porAprobar = data?.pendingApprovalCount || 0;

  const kpis = [
    { label: 'Valor Inventario', value: fmt(data?.inventoryValue || 0), sub: fmtKg(data?.totalInventoryKg || 0), color: '#2b6cb0', icon: '📦', path: '/cacao/lots' },
    { label: 'Exposición Sin Fijar', value: fmt(data?.openFixingValue || 0), sub: fmtKg(data?.openFixingKg || 0) + ' pendientes', color: '#b7791f', icon: '⚠️', path: '/cacao/price-fixings' },
    { label: 'Liquidaciones por aprobar', value: fmt(data?.pendingApprovalAmount || 0), sub: porAprobar ? `${porAprobar} ${porAprobar === 1 ? 'LIQUIDACIÓN' : 'LIQUIDACIONES'}` : 'NINGUNA PENDIENTE', color: '#6b46c1', icon: '🧾', path: '/cacao/settlements' },
    { label: 'CxP Pendiente', value: fmt(data?.totalPayables || 0), sub: data?.payableCount ? `${data.payableCount} FACTURAS` : 'SALDO', color: '#e53e3e', icon: '📤', path: '/cacao/payables' },
    { label: 'CxC Pendiente', value: fmt(data?.totalReceivables || 0), sub: data?.receivableCount ? `${data.receivableCount} FACTURAS` : 'SALDO', color: '#38a169', icon: '📥', path: '/cacao/receivables' },
  ];

  return (
    <div className="page-container">
      <PageHeader
        eyebrow="Cacao"
        title="Dashboard"
        description="Cómo va tu negocio de cacao: inventario, precios por fijar y lo que debes y te deben."
        actions={<button className="btn-secondary" onClick={() => navigate('/cacao/guia')}>Cómo funciona</button>}
      />

      <div className="admin-section">
        {pasosPendientes.length > 0 && (
          <div style={{ marginBottom: '24px', padding: '18px 20px', background: '#ebf8ff', border: '1px solid #bee3f8', borderRadius: '10px' }}>
            <h2 style={{ fontSize: '15px', fontWeight: 700, color: '#2c5282', margin: '0 0 4px' }}>Primeros pasos</h2>
            <p style={{ fontSize: '13px', color: '#4a5568', margin: '0 0 12px' }}>
              Antes de registrar tu primera compra, deja listo lo propio de tu empresa. Estos pasos desaparecen cuando los completes.
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: '10px' }}>
              {PASOS_INICIALES.map((p, i) => {
                const hecho = !!setup?.[p.clave];
                return (
                  <button
                    key={p.clave}
                    onClick={() => navigate(p.ruta)}
                    style={{ textAlign: 'left', padding: '12px 14px', background: hecho ? '#f0fff4' : 'white', border: `1px solid ${hecho ? '#c6f6d5' : '#bee3f8'}`, borderRadius: '8px', cursor: 'pointer' }}
                  >
                    <div style={{ fontSize: '13px', fontWeight: 600, color: hecho ? '#276749' : '#2d3748' }}>
                      {hecho ? '✓' : `${i + 1}.`} {p.titulo}
                    </div>
                    <div style={{ fontSize: '12px', color: '#718096', marginTop: '4px', lineHeight: 1.4 }}>{p.texto}</div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* KPIs */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '28px' }}>
          {kpis.map((kpi) => (
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
                      <td>{fmtKg(s.totalWeightKg ?? s.totalWeight)}</td>
                      <td>${fmt(s.salePrice)}/kg</td>
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
