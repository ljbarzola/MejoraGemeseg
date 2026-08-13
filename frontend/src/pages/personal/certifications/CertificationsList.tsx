import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getCertifications, createCertification, deleteCertification, getCertificationAlerts } from '../../../services/personal.service';

const CERT_TYPES = ['Nivel 1', 'Nivel 2', 'Reentrenamiento', 'Examen Ocupacional'];

export default function CertificationsList() {
  const navigate = useNavigate();
  const [certifications, setCertifications] = useState<any[]>([]);
  const [alerts, setAlerts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ employeeName: '', cedula: '', type: CERT_TYPES[0], issueDate: '', expiryDate: '' });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const load = () => {
    setLoading(true);
    Promise.all([getCertifications(), getCertificationAlerts()])
      .then(([c, a]) => { setCertifications(c); setAlerts(a); })
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!form.employeeName.trim()) { setError('Nombre es requerido'); return; }
    if (!form.cedula.trim()) { setError('Cédula es requerida'); return; }
    if (!form.issueDate || !form.expiryDate) { setError('Fechas son requeridas'); return; }

    setSaving(true);
    try {
      await createCertification({
        ...form,
        issueDate: new Date(form.issueDate).toISOString(),
        expiryDate: new Date(form.expiryDate).toISOString(),
      });
      setShowForm(false);
      setForm({ employeeName: '', cedula: '', type: CERT_TYPES[0], issueDate: '', expiryDate: '' });
      load();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Error al guardar');
    } finally {
      setSaving(false);
    }
  };

  const getDaysUntilExpiry = (date: string) => {
    const diff = new Date(date).getTime() - Date.now();
    return Math.ceil(diff / (1000 * 60 * 60 * 24));
  };

  const getExpiryColor = (days: number) => {
    if (days <= 1) return '#c53030';
    if (days <= 7) return '#dd6b20';
    if (days <= 15) return '#d69e2e';
    if (days <= 30) return '#2b6cb0';
    return '#276749';
  };

  return (
    <div className="page-container">
      <div className="page-header-row">
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button className="cacao-back-btn" onClick={() => navigate('/personal')}>← Volver</button>
          <div>
            <p className="page-eyebrow">PERSONAL</p>
            <h1>Certificaciones</h1>
          </div>
        </div>
        <button className="auth-btn" onClick={() => setShowForm(true)}>+ Nueva Certificación</button>
      </div>

      {alerts.length > 0 && (
        <div className="admin-section" style={{ marginBottom: '16px', borderLeft: '4px solid #c53030' }}>
          <h3 style={{ marginBottom: '12px', color: '#c53030' }}>⚠️ Alertas de Vencimiento ({alerts.length})</h3>
          <div className="tasks-table-wrapper">
            <table className="tasks-table">
              <thead>
                <tr>
                  <th>Empleado</th>
                  <th>Cédula</th>
                  <th>Tipo</th>
                  <th>Vence en</th>
                  <th>Fecha</th>
                </tr>
              </thead>
              <tbody>
                {alerts.map((a) => {
                  const days = getDaysUntilExpiry(a.expiryDate);
                  return (
                    <tr key={a.id}>
                      <td style={{ fontWeight: 600 }}>{a.employeeName}</td>
                      <td style={{ fontFamily: 'monospace' }}>{a.cedula}</td>
                      <td>{a.type}</td>
                      <td>
                        <span style={{ color: getExpiryColor(days), fontWeight: 700 }}>
                          {days} día{days !== 1 ? 's' : ''}
                        </span>
                      </td>
                      <td>{new Date(a.expiryDate).toLocaleDateString('es-EC')}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="admin-section">
        {loading ? (
          <div className="loading-state">Cargando...</div>
        ) : certifications.length === 0 ? (
          <div className="empty-state">No hay certificaciones registradas.</div>
        ) : (
          <div className="tasks-table-wrapper">
            <table className="tasks-table">
              <thead>
                <tr>
                  <th>Empleado</th>
                  <th>Cédula</th>
                  <th>Tipo</th>
                  <th>Emisión</th>
                  <th>Vencimiento</th>
                  <th>Estado</th>
                  <th className="no-print"></th>
                </tr>
              </thead>
              <tbody>
                {certifications.map((c) => {
                  const days = getDaysUntilExpiry(c.expiryDate);
                  return (
                    <tr key={c.id}>
                      <td style={{ fontWeight: 600 }}>{c.employeeName}</td>
                      <td style={{ fontFamily: 'monospace' }}>{c.cedula}</td>
                      <td>{c.type}</td>
                      <td>{new Date(c.issueDate).toLocaleDateString('es-EC')}</td>
                      <td>{new Date(c.expiryDate).toLocaleDateString('es-EC')}</td>
                      <td>
                        <span className="status-badge" style={{
                          backgroundColor: days <= 0 ? '#fed7d7' : days <= 30 ? '#fefcbf' : '#c6f6d5',
                          color: days <= 0 ? '#c53030' : days <= 30 ? '#975a16' : '#276749',
                        }}>
                          {days <= 0 ? 'Vencida' : `${days} días`}
                        </span>
                      </td>
                      <td className="no-print">
                        <button className="btn-danger-sm" onClick={async () => { await deleteCertification(c.id); load(); }}>Eliminar</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showForm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: 'white', borderRadius: '16px', padding: '24px', width: '450px', maxWidth: '90vw' }}>
            <h3 style={{ marginBottom: '16px' }}>Nueva Certificación</h3>
            {error && <div className="form-error">{error}</div>}
            <div className="form-group" style={{ marginBottom: '12px' }}>
              <label>Empleado *</label>
              <input value={form.employeeName} onChange={e => setForm({ ...form, employeeName: e.target.value })} placeholder="Nombre completo" />
            </div>
            <div className="form-group" style={{ marginBottom: '12px' }}>
              <label>Cédula *</label>
              <input value={form.cedula} onChange={e => setForm({ ...form, cedula: e.target.value })} placeholder="Número de cédula" />
            </div>
            <div className="form-group" style={{ marginBottom: '12px' }}>
              <label>Tipo *</label>
              <select value={form.type} onChange={e => setForm({ ...form, type: e.target.value })}>
                {CERT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div className="form-row" style={{ marginBottom: '12px' }}>
              <div className="form-group">
                <label>Fecha Emisión *</label>
                <input type="date" value={form.issueDate} onChange={e => setForm({ ...form, issueDate: e.target.value })} />
              </div>
              <div className="form-group">
                <label>Fecha Vencimiento *</label>
                <input type="date" value={form.expiryDate} onChange={e => setForm({ ...form, expiryDate: e.target.value })} />
              </div>
            </div>
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <button className="btn-secondary" onClick={() => { setShowForm(false); setError(''); }}>Cancelar</button>
              <button className="auth-btn" onClick={handleSubmit} disabled={saving}>{saving ? 'Guardando...' : 'Crear'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
