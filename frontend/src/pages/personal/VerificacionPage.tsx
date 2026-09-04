import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getVerifications, createVerification, updateVerification, deleteVerification } from '../../services/personal.service';

const PLATFORMS = [
  { value: 'SICOSEP', label: 'SICOSEP', url: 'https://sicosep.ministeriodelinterior.gob.ec/', help: 'Consultas a la ciudadanía → Guardias → ingresa la cédula + código de seguridad' },
  { value: 'SUT', label: 'SUT (Min. Trabajo)', url: 'https://sut.trabajo.gob.ec/contratos-web/', help: 'Requiere usuario de empleador; o revisa Datos Abiertos de contratos registrados' },
  { value: 'IESS', label: 'IESS', url: 'https://www.iess.gob.ec/', help: 'Verifica avisos de entrada/salida y obligaciones patronales' },
];

const STATUSES = [
  { value: 'PENDIENTE', label: 'Pendiente', color: '#d69e2e', bg: '#fefcbf' },
  { value: 'VERIFICADO', label: 'Verificado', color: '#276749', bg: '#c6f6d5' },
  { value: 'NO_ENCONTRADO', label: 'No encontrado', color: '#c53030', bg: '#fed7d7' },
];

const statusStyle = (s: string) => {
  const f = STATUSES.find((x) => x.value === s) || STATUSES[0];
  return { color: f.color, background: f.bg };
};

export default function VerificacionPage() {
  const navigate = useNavigate();
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [cedula, setCedula] = useState('');
  const [platform, setPlatform] = useState('SICOSEP');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [filter, setFilter] = useState('');

  const load = () => {
    setLoading(true);
    getVerifications()
      .then(setItems)
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!cedula.trim()) { setError('La cédula es requerida'); return; }
    setSaving(true);
    try {
      await createVerification({ cedula: cedula.trim(), platform, notes: notes.trim() || undefined });
      setCedula(''); setNotes(''); setPlatform('SICOSEP');
      load();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Error al registrar');
    } finally {
      setSaving(false);
    }
  };

  const handleStatus = async (id: number, status: string) => {
    try {
      await updateVerification(id, { status });
      load();
    } catch (err: any) {
      alert(err.response?.data?.message || 'Error al actualizar');
    }
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm('¿Eliminar este registro de verificación?')) return;
    try {
      await deleteVerification(id);
      load();
    } catch (err: any) {
      alert(err.response?.data?.message || 'Error al eliminar');
    }
  };

  const filtered = items.filter((v) =>
    !filter.trim() ||
    v.cedula.includes(filter.trim()) ||
    (v.verifier?.fullName || '').toLowerCase().includes(filter.trim().toLowerCase()),
  );

  return (
    <div className="page-container">
      <div className="page-header-row">
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button className="cacao-back-btn" onClick={() => navigate('/personal')}>← Volver</button>
          <div>
            <p className="page-eyebrow">PERSONAL Y RECURSOS HUMANOS</p>
            <h1>Verificación SUT / SICOSEP</h1>
          </div>
        </div>
      </div>

      <div style={{ background: '#ebf8ff', border: '1px solid #bee3f8', borderRadius: '10px', padding: '14px 16px', marginBottom: '20px' }}>
        <p style={{ margin: 0, fontSize: '0.85rem', color: '#2b6cb0' }}>
          <strong>Verificación asistida:</strong> no existe API pública para consulta automática
          (SICOSEP exige captcha, SUT exige login de empleador). Consulta en el portal oficial
          y registra aquí el resultado con trazabilidad.
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '10px' }}>
          {PLATFORMS.map((p) => (
            <a key={p.value} href={p.url} target="_blank" rel="noreferrer"
              style={{ fontSize: '0.8rem', background: '#fff', border: '1px solid #bee3f8', borderRadius: '6px', padding: '6px 10px', textDecoration: 'none', color: '#2b6cb0' }}
              title={p.help}>
              🔗 {p.label}
            </a>
          ))}
        </div>
      </div>

      <div className="admin-section" style={{ marginBottom: '24px' }}>
        <h3 style={{ margin: '0 0 12px', fontSize: '0.95rem' }}>Registrar verificación</h3>
        {error && <div className="form-error" style={{ marginBottom: '10px' }}>{error}</div>}
        <form onSubmit={handleCreate} style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', alignItems: 'end' }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.75rem', color: '#718096', marginBottom: '4px' }}>Cédula *</label>
            <input value={cedula} onChange={(e) => setCedula(e.target.value)} placeholder="Ej: 0923456789"
              style={{ padding: '8px 10px', borderRadius: '6px', border: '1px solid #cbd5e0' }} />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '0.75rem', color: '#718096', marginBottom: '4px' }}>Plataforma</label>
            <select value={platform} onChange={(e) => setPlatform(e.target.value)}
              style={{ padding: '8px 10px', borderRadius: '6px', border: '1px solid #cbd5e0' }}>
              {PLATFORMS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
            </select>
          </div>
          <div style={{ flex: 1, minWidth: '200px' }}>
            <label style={{ display: 'block', fontSize: '0.75rem', color: '#718096', marginBottom: '4px' }}>Notas</label>
            <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Resultado observado, motivo..."
              style={{ width: '100%', padding: '8px 10px', borderRadius: '6px', border: '1px solid #cbd5e0', boxSizing: 'border-box' }} />
          </div>
          <button className="auth-btn" type="submit" disabled={saving} style={{ opacity: saving ? 0.6 : 1 }}>
            {saving ? 'Guardando...' : '+ Registrar'}
          </button>
        </form>
      </div>

      <div className="admin-section">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
          <h3 style={{ margin: 0, fontSize: '0.95rem' }}>Historial ({filtered.length})</h3>
          <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filtrar por cédula o verificador..."
            style={{ padding: '7px 10px', borderRadius: '6px', border: '1px solid #cbd5e0', fontSize: '0.8rem' }} />
        </div>
        {loading ? (
          <div className="loading-state">Cargando...</div>
        ) : filtered.length === 0 ? (
          <div className="empty-state">No hay verificaciones registradas. Todo candidato nuevo parte como "no verificado".</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
              <thead>
                <tr style={{ textAlign: 'left', color: '#718096', borderBottom: '2px solid #e2e8f0' }}>
                  <th style={{ padding: '8px' }}>Cédula</th>
                  <th style={{ padding: '8px' }}>Plataforma</th>
                  <th style={{ padding: '8px' }}>Estado</th>
                  <th style={{ padding: '8px' }}>Notas</th>
                  <th style={{ padding: '8px' }}>Verificado por</th>
                  <th style={{ padding: '8px' }}>Fecha</th>
                  <th style={{ padding: '8px' }}></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((v) => (
                  <tr key={v.id} style={{ borderBottom: '1px solid #edf2f7' }}>
                    <td style={{ padding: '8px', fontWeight: 600 }}>{v.cedula}</td>
                    <td style={{ padding: '8px' }}>{v.platform}</td>
                    <td style={{ padding: '8px' }}>
                      <select value={v.status} onChange={(e) => handleStatus(v.id, e.target.value)}
                        style={{ ...statusStyle(v.status), border: 'none', borderRadius: '12px', padding: '4px 8px', fontSize: '0.75rem', fontWeight: 700 }}>
                        {STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                      </select>
                    </td>
                    <td style={{ padding: '8px', color: '#4a5568' }}>{v.notes || '—'}</td>
                    <td style={{ padding: '8px' }}>{v.verifier?.fullName || '—'}</td>
                    <td style={{ padding: '8px', color: '#718096' }}>{new Date(v.verifiedAt).toLocaleDateString('es-EC')}</td>
                    <td style={{ padding: '8px', textAlign: 'right' }}>
                      <button onClick={() => handleDelete(v.id)} title="Eliminar"
                        style={{ background: 'none', border: 'none', color: '#e53e3e', cursor: 'pointer', fontSize: '1rem' }}>🗑</button>
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
