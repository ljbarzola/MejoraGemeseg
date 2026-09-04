import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getVentasDashboard, setGoal, SalesGoalSeller } from '../../services/ventas.service';

export default function VentasDashboard() {
  const navigate = useNavigate();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [editingGoal, setEditingGoal] = useState<SalesGoalSeller | null>(null);
  const [goalInput, setGoalInput] = useState<number>(20);
  const [savingGoal, setSavingGoal] = useState(false);

  const loadData = () => {
    setLoading(true);
    getVentasDashboard()
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => { loadData(); }, []);

  const handleSaveGoal = async () => {
    if (!editingGoal || !data?.goals) return;
    setSavingGoal(true);
    try {
      await setGoal({
        userId: editingGoal.sellerId,
        year: data.goals.year,
        weekNumber: data.goals.weekNumber,
        weeklyVisitGoal: goalInput,
      });
      setEditingGoal(null);
      loadData();
    } catch {
      alert('Error al guardar la meta');
    } finally {
      setSavingGoal(false);
    }
  };

  if (loading) {
    return (
      <div className="page-container">
        <div className="loading-state">Cargando métricas de ventas...</div>
      </div>
    );
  }

  const goals = data?.goals;
  const sellers: SalesGoalSeller[] = goals?.sellers || [];
  const funnel = data?.funnel || {};

  return (
    <div className="page-container">
      <div className="page-header-row">
        <div>
          <p className="page-eyebrow">MÓDULO VENTAS Y CRM</p>
          <h1>Dashboard Comercial</h1>
          <p style={{ color: '#718096', fontSize: '0.85rem', marginTop: '4px' }}>
            Semana {goals?.weekNumber} · Año {goals?.year} — Seguimiento de campo y retorno digital
          </p>
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button className="cacao-back-btn" onClick={() => navigate('/ventas/visitas')}>Agenda de Visitas 📍</button>
          <button className="auth-btn" onClick={() => navigate('/ventas/leads')}>CRM Prospectos 🎯</button>
        </div>
      </div>

      {/* METRIC CARDS */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px', marginTop: '16px' }}>
        <div className="admin-section" style={{ borderLeft: '4px solid #319795', padding: '16px' }}>
          <div style={{ fontSize: '0.8rem', color: '#718096', fontWeight: 600 }}>RETORNO MARKETING ($MD)</div>
          <div style={{ fontSize: '1.8rem', fontWeight: 800, color: '#2c7a7b', marginTop: '4px' }}>
            ${(data?.marketingReturnMD || 0).toLocaleString('es-EC', { minimumFractionDigits: 2 })}
          </div>
          <div style={{ fontSize: '0.78rem', color: '#718096', marginTop: '4px' }}>
            Ventas cerradas desde campañas digitales ({data?.digitalWonCount || 0} prospectos)
          </div>
        </div>

        <div className="admin-section" style={{ borderLeft: '4px solid #2b6cb0', padding: '16px' }}>
          <div style={{ fontSize: '0.8rem', color: '#718096', fontWeight: 600 }}>TOTAL VENTAS GANADAS</div>
          <div style={{ fontSize: '1.8rem', fontWeight: 800, color: '#2b6cb0', marginTop: '4px' }}>
            ${(data?.totalWonValue || 0).toLocaleString('es-EC', { minimumFractionDigits: 2 })}
          </div>
          <div style={{ fontSize: '0.78rem', color: '#718096', marginTop: '4px' }}>
            {data?.totalWonCount || 0} cierres efectivos registrados
          </div>
        </div>

        <div className="admin-section" style={{ borderLeft: '4px solid #d69e2e', padding: '16px' }}>
          <div style={{ fontSize: '0.8rem', color: '#718096', fontWeight: 600 }}>VISITAS EN CAMPO ESTA SEMANA</div>
          <div style={{ fontSize: '1.8rem', fontWeight: 800, color: '#d69e2e', marginTop: '4px' }}>
            {sellers.reduce((acc, s) => acc + (s.completedVisits || 0), 0)}
          </div>
          <div style={{ fontSize: '0.78rem', color: '#718096', marginTop: '4px' }}>
            de {sellers.reduce((acc, s) => acc + s.goal, 0)} visitas obligatorias de meta
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginTop: '20px' }}>
        {/* SEMÁFORO DE CUMPLIMIENTO EN CAMPO */}
        <div className="admin-section">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <h3 style={{ margin: 0, color: 'var(--azul-oscuro)', fontSize: '1rem' }}>
              🚦 Semáforo de Cumplimiento de Visitas
            </h3>
            <span style={{ fontSize: '0.78rem', color: '#718096' }}>Semana {goals?.weekNumber}</span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {sellers.map((s) => (
              <div key={s.sellerId} style={{ padding: '12px', border: '1px solid #e2e8f0', borderRadius: '10px', background: 'white' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                  <div style={{ fontWeight: 600, fontSize: '0.9rem', color: 'var(--azul-oscuro)' }}>
                    {s.fullName}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span
                      style={{
                        padding: '2px 8px', borderRadius: '12px', fontSize: '0.75rem', fontWeight: 700,
                        background: s.statusColor === 'GREEN' ? '#c6f6d5' : s.statusColor === 'YELLOW' ? '#fefcbf' : '#fed7d7',
                        color: s.statusColor === 'GREEN' ? '#22543d' : s.statusColor === 'YELLOW' ? '#744210' : '#742a2a',
                      }}
                    >
                      {s.statusColor === 'GREEN' ? '🟢 En Meta' : s.statusColor === 'YELLOW' ? '🟡 En Riesgo' : '🔴 Atrasado'}
                    </span>
                    <button
                      className="btn-secondary-sm"
                      style={{ padding: '2px 6px', fontSize: '0.72rem' }}
                      onClick={() => { setEditingGoal(s); setGoalInput(s.goal); }}
                    >
                      Editar Meta
                    </button>
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: '#718096', marginBottom: '4px' }}>
                  <span>{s.completedVisits} completadas ({s.plannedVisits} agendadas)</span>
                  <span>Meta: {s.goal} visitas ({s.progressPct}%)</span>
                </div>

                <div style={{ background: '#edf2f7', height: '8px', borderRadius: '4px', overflow: 'hidden' }}>
                  <div
                    style={{
                      width: `${Math.min(s.progressPct || 0, 100)}%`, height: '100%', borderRadius: '4px',
                      background: s.statusColor === 'GREEN' ? '#38a169' : s.statusColor === 'YELLOW' ? '#d69e2e' : '#e53e3e',
                      transition: 'width 0.4s',
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* EMBUDO DE CONVERSIÓN DIGITAL */}
        <div className="admin-section">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <h3 style={{ margin: 0, color: 'var(--azul-oscuro)', fontSize: '1rem' }}>
              🎯 Embudo de Conversión CRM
            </h3>
            <button className="cacao-back-btn" style={{ fontSize: '0.78rem', padding: '4px 8px' }} onClick={() => navigate('/ventas/leads')}>
              Ver Prospectos →
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {[
              { stage: 'NEW', label: '1. Nuevos Leads', count: funnel.NEW || 0, color: '#3182ce' },
              { stage: 'CONTACTED', label: '2. Contactados', count: funnel.CONTACTED || 0, color: '#d69e2e' },
              { stage: 'QUALIFIED', label: '3. Calificados', count: funnel.QUALIFIED || 0, color: '#805ad5' },
              { stage: 'QUOTED', label: '4. Cotizados', count: funnel.QUOTED || 0, color: '#dd6b20' },
              { stage: 'WON', label: '5. Ventas Cerradas (Ganados)', count: funnel.WON || 0, color: '#38a169' },
              { stage: 'LOST', label: 'Descartados (Perdidos)', count: funnel.LOST || 0, color: '#e53e3e' },
            ].map((f) => (
              <div key={f.stage} style={{ padding: '10px 14px', borderRadius: '8px', background: '#f7fafc', border: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontWeight: 600, fontSize: '0.88rem', color: 'var(--azul-oscuro)' }}>{f.label}</span>
                <span style={{ padding: '4px 12px', borderRadius: '12px', background: f.color + '20', color: f.color, fontWeight: 800, fontSize: '0.9rem' }}>
                  {f.count}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* EDIT GOAL MODAL */}
      {editingGoal && (
        <div className="modal-backdrop">
          <div className="modal-card" style={{ maxWidth: 400 }}>
            <h3>Ajustar Meta Semanal</h3>
            <p style={{ fontSize: '0.85rem', color: '#718096' }}>
              Vendedor: <strong>{editingGoal.fullName}</strong>
            </p>
            <div className="form-group" style={{ marginTop: '12px' }}>
              <label>Meta de Visitas Semanales Obligatorias *</label>
              <input
                type="number"
                min="1"
                value={goalInput}
                onChange={(e) => setGoalInput(Number(e.target.value))}
              />
            </div>
            <div className="modal-actions" style={{ marginTop: '16px' }}>
              <button className="btn-secondary" onClick={() => setEditingGoal(null)}>Cancelar</button>
              <button className="auth-btn" onClick={handleSaveGoal} disabled={savingGoal}>
                {savingGoal ? 'Guardando...' : 'Guardar Meta'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
