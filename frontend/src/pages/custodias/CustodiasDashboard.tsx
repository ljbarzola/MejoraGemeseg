import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { getCustodiasDashboard } from '../../services/custodia.service';

export default function CustodiasDashboard() {
  const navigate = useNavigate();
  const location = useLocation();
  const now = new Date();
  const defaultMes = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
  
  const [mes, setMes] = useState(defaultMes);
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const loadData = () => {
    setLoading(true);
    getCustodiasDashboard(mes)
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadData();
  }, [mes]);

  return (
    <div className="page-container">
      <div className="page-header-row">
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button className="cacao-back-btn" onClick={() => navigate(location.state?.from || '/custodias')}>← Volver</button>
          <div>
            <p className="page-eyebrow">CUSTODIAS</p>
            <h1>Dashboard Operativo</h1>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <label style={{ fontSize: '0.85rem', fontWeight: 600, color: '#4a5568' }}>Mes:</label>
          <input
            type="month"
            value={mes}
            onChange={(e) => setMes(e.target.value)}
            style={{ padding: '8px 12px', border: '2px solid #e2e8f0', borderRadius: '10px', fontSize: '0.9rem', fontWeight: 600 }}
          />
        </div>
      </div>

      {loading ? (
        <div className="loading-state">Cargando métricas...</div>
      ) : !data ? (
        <div className="empty-state">No se pudieron cargar los datos del mes seleccionado.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* KPI CARDS */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px', marginBottom: '24px' }}>
            <div style={{ padding: '20px', background: '#fff', borderRadius: '14px', borderLeft: '5px solid #100F31', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
              <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#718096', textTransform: 'uppercase' }}>TOTAL VIAJES</div>
              <div style={{ fontSize: '2rem', fontWeight: 800, color: '#100F31', marginTop: '4px' }}>{data.kpis.total_viajes}</div>
              <div style={{ fontSize: '0.75rem', color: '#a0aec0', marginTop: '4px' }}>Registrados en el mes</div>
            </div>

            <div style={{ padding: '20px', background: '#fff', borderRadius: '14px', borderLeft: '5px solid #3b82f6', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
              <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#718096', textTransform: 'uppercase' }}>VIAJES FINALIZADOS</div>
              <div style={{ fontSize: '2rem', fontWeight: 800, color: '#3b82f6', marginTop: '4px' }}>{data.kpis.viajes_finalizados}</div>
              <div style={{ fontSize: '0.75rem', color: '#a0aec0', marginTop: '4px' }}>Estado LLEGÓ</div>
            </div>

            <div style={{ padding: '20px', background: '#fff', borderRadius: '14px', borderLeft: '5px solid #22c55e', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
              <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#718096', textTransform: 'uppercase' }}>NÓMINA GENERADA</div>
              <div style={{ fontSize: '2rem', fontWeight: 800, color: '#22c55e', marginTop: '4px' }}>${data.kpis.total_nomina_usd.toFixed(2)}</div>
              <div style={{ fontSize: '0.75rem', color: '#a0aec0', marginTop: '4px' }}>Total a pagar (USD)</div>
            </div>

            <div style={{ padding: '20px', background: '#fff', borderRadius: '14px', borderLeft: '5px solid #eab308', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
              <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#718096', textTransform: 'uppercase' }}>GUARDIAS ACTIVOS</div>
              <div style={{ fontSize: '2rem', fontWeight: 800, color: '#d97706', marginTop: '4px' }}>{data.kpis.empleados_activos}</div>
              <div style={{ fontSize: '0.75rem', color: '#a0aec0', marginTop: '4px' }}>Con participaciones</div>
            </div>
          </div>

          {/* BREAKDOWN SECTIONS */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '20px', marginBottom: '24px' }}>
            {/* DESGROSE POR TIPO */}
            <div className="admin-section" style={{ margin: 0 }}>
              <h2 style={{ fontSize: '1rem', fontWeight: 700, color: '#100F31', marginBottom: '16px' }}>Desglose por Tipo de Custodia</h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {data.por_tipo.map((t: any) => (
                  <div key={t.tipo} style={{ padding: '12px 16px', background: '#f8fafc', borderRadius: '10px', border: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ fontWeight: 700, color: '#100F31', fontSize: '0.9rem' }}>{t.tipo}</div>
                      <div style={{ fontSize: '0.78rem', color: '#718096' }}>${t.tarifa_persona}/persona (${t.tarifa_persona * 3} por viaje)</div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontWeight: 800, fontSize: '1.1rem', color: '#2b6cb0' }}>{t.cantidad} viajes</div>
                      <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#22c55e' }}>${t.total_costo} USD</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* DESGROSE POR ESTADO */}
            <div className="admin-section" style={{ margin: 0 }}>
              <h2 style={{ fontSize: '1rem', fontWeight: 700, color: '#100F31', marginBottom: '16px' }}>Estado de las Operaciones</h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {data.por_estado.map((e: any) => {
                  let color = '#eab308';
                  let label = 'Listo para Custodiar';
                  if (e.estado === 'EN_CAMINO') { color = '#3b82f6'; label = 'En Camino'; }
                  if (e.estado === 'LLEGO') { color = '#22c55e'; label = 'Llegó (Finalizado)'; }

                  return (
                    <div key={e.estado} style={{ padding: '12px 16px', background: '#f8fafc', borderRadius: '10px', borderLeft: `4px solid ${color}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ fontWeight: 700, color: '#100F31', fontSize: '0.9rem' }}>{label}</div>
                      <div style={{ fontWeight: 800, fontSize: '1.2rem', color }}>{e.cantidad}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* QUICK NAV */}
          <div className="admin-section" style={{ margin: 0, background: '#100F31', color: '#fff', borderRadius: '14px', padding: '20px' }}>
            <h2 style={{ fontSize: '1rem', fontWeight: 700, color: '#fff', marginBottom: '14px' }}>Accesos Rápidos</h2>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px' }}>
              <button onClick={() => navigate('/custodias')} style={{ padding: '10px 18px', background: '#12375F', color: '#fff', border: 'none', borderRadius: '10px', cursor: 'pointer', fontWeight: 600 }}>
                📋 Ver Lista de Operaciones
              </button>
              <button onClick={() => navigate('/custodias/new')} style={{ padding: '10px 18px', background: '#EE3B1B', color: '#fff', border: 'none', borderRadius: '10px', cursor: 'pointer', fontWeight: 600 }}>
                ➕ Nueva Custodia
              </button>
              <button onClick={() => navigate('/custodias/nomina')} style={{ padding: '10px 18px', background: '#12375F', color: '#fff', border: 'none', borderRadius: '10px', cursor: 'pointer', fontWeight: 600 }}>
                💰 Liquidación de Nómina
              </button>
              <button onClick={() => navigate('/custodias/trabajador')} style={{ padding: '10px 18px', background: '#12375F', color: '#fff', border: 'none', borderRadius: '10px', cursor: 'pointer', fontWeight: 600 }}>
                🔍 Consulta por Cédula
              </button>
              <button onClick={() => navigate('/custodias/gemebot')} style={{ padding: '10px 18px', background: '#12375F', color: '#fff', border: 'none', borderRadius: '10px', cursor: 'pointer', fontWeight: 600 }}>
                🤖 GEME-BOT Asistente
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
