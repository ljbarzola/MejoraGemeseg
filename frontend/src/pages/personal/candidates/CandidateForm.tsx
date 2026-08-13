import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { getCandidate, createCandidate, updateCandidate, moveCandidate, getKanbanColumns, getCandidateHistory } from '../../../services/personal.service';

const initialForm = {
  fullName: '', cedula: '', phone: '', email: '', positionApplied: '',
  availability: '', salaryExpected: '', education: '', experience: '',
  references: '', observations: '',
};

export default function CandidateForm() {
  const navigate = useNavigate();
  const { id } = useParams();
  const isEdit = !!id;
  const [form, setForm] = useState(initialForm);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [columns, setColumns] = useState<any[]>([]);
  const [selectedColumn, setSelectedColumn] = useState<number | null>(null);
  const [history, setHistory] = useState<any[]>([]);

  useEffect(() => {
    getKanbanColumns().then(setColumns);
    if (isEdit) {
      getCandidate(+id!).then((c) => {
        setForm({
          fullName: c.fullName || '', cedula: c.cedula || '', phone: c.phone || '',
          email: c.email || '', positionApplied: c.positionApplied || '',
          availability: c.availability || '', salaryExpected: c.salaryExpected?.toString() || '',
          education: c.education || '', experience: c.experience || '',
          references: c.references || '', observations: c.observations || '',
        });
        setSelectedColumn(c.columnId);
      });
      getCandidateHistory(+id!).then(setHistory);
    }
  }, [id]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    setForm(prev => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!form.fullName.trim()) { setError('Nombre es requerido'); return; }
    if (!form.cedula.trim()) { setError('Cédula es requerida'); return; }
    if (!form.positionApplied.trim()) { setError('Puesto aspirado es requerido'); return; }

    setSaving(true);
    try {
      const payload: any = {
        ...form,
        salaryExpected: form.salaryExpected ? parseFloat(form.salaryExpected) : null,
      };
      if (isEdit) {
        await updateCandidate(+id!, payload);
        if (selectedColumn !== undefined) {
          await moveCandidate(+id!, selectedColumn);
        }
      } else {
        const created = await createCandidate(payload);
        if (selectedColumn) {
          await moveCandidate(created.id, selectedColumn);
        }
      }
      navigate('/personal/candidates');
    } catch (err: any) {
      setError(err.response?.data?.message || err.response?.data?.error || 'Error al guardar');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="page-container">
      <div className="page-header-row">
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button className="cacao-back-btn" onClick={() => navigate('/personal/candidates')}>← Volver</button>
          <div>
            <p className="page-eyebrow">PERSONAL</p>
            <h1>{isEdit ? 'Editar Candidato' : 'Nuevo Candidato'}</h1>
          </div>
        </div>
      </div>

      <div className="page-card" style={{ maxWidth: 900, margin: '0 auto' }}>
        <form onSubmit={handleSubmit} className="cacao-form">
          {error && <div className="form-error">{error}</div>}

          <div className="form-row">
            <div className="form-group">
              <label>Nombre Completo *</label>
              <input name="fullName" value={form.fullName} onChange={handleChange} placeholder="Nombre completo" />
            </div>
            <div className="form-group">
              <label>Cédula *</label>
              <input name="cedula" value={form.cedula} onChange={handleChange} placeholder="Número de cédula" />
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>Teléfono</label>
              <input name="phone" value={form.phone} onChange={handleChange} placeholder="Teléfono" />
            </div>
            <div className="form-group">
              <label>Email</label>
              <input name="email" type="email" value={form.email} onChange={handleChange} placeholder="Email" />
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>Puesto Aspirado *</label>
              <input name="positionApplied" value={form.positionApplied} onChange={handleChange} placeholder="Puesto al que aplica" />
            </div>
            <div className="form-group">
              <label>Salario Esperado</label>
              <input name="salaryExpected" type="number" step="0.01" value={form.salaryExpected} onChange={handleChange} placeholder="USD" />
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>Disponibilidad Horaria</label>
              <input name="availability" value={form.availability} onChange={handleChange} placeholder="Ej: Tiempo completo, Medio tiempo" />
            </div>
            {isEdit && (
              <div className="form-group">
                <label>Columna del Kanban</label>
                <select value={selectedColumn || ''} onChange={e => setSelectedColumn(e.target.value ? +e.target.value : null)}>
                  <option value="">Sin columna</option>
                  {columns.map(col => <option key={col.id} value={col.id}>{col.name}</option>)}
                </select>
              </div>
            )}
          </div>

          <div className="form-group">
            <label>Educación</label>
            <textarea name="education" value={form.education} onChange={handleChange} rows={3} placeholder="Formación académica" style={{ resize: 'vertical' }} />
          </div>

          <div className="form-group">
            <label>Experiencia Laboral</label>
            <textarea name="experience" value={form.experience} onChange={handleChange} rows={3} placeholder="Experiencia previa" style={{ resize: 'vertical' }} />
          </div>

          <div className="form-group">
            <label>Referencias</label>
            <textarea name="references" value={form.references} onChange={handleChange} rows={2} placeholder="Referencias personales o laborales" style={{ resize: 'vertical' }} />
          </div>

          <div className="form-group">
            <label>Observaciones</label>
            <textarea name="observations" value={form.observations} onChange={handleChange} rows={2} placeholder="Notas adicionales" style={{ resize: 'vertical' }} />
          </div>

          <div className="form-actions">
            <button type="button" className="btn-secondary" onClick={() => navigate('/personal/candidates')}>Cancelar</button>
            <button type="submit" className="auth-btn" disabled={saving}>{saving ? 'Guardando...' : isEdit ? 'Guardar Cambios' : 'Crear Candidato'}</button>
          </div>
        </form>
      </div>

      {isEdit && history.length > 0 && (
        <div className="admin-section" style={{ maxWidth: 900, margin: '16px auto 0' }}>
          <h3 style={{ marginBottom: '12px' }}>Historial de Movimientos</h3>
          <div className="tasks-table-wrapper">
            <table className="tasks-table">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>De</th>
                  <th>A</th>
                  <th>Realizado por</th>
                </tr>
              </thead>
              <tbody>
                {history.map((h) => (
                  <tr key={h.id}>
                    <td>{new Date(h.createdAt).toLocaleDateString('es-EC')}</td>
                    <td>{h.fromColumn || '—'}</td>
                    <td>{h.toColumn}</td>
                    <td>{h.performer?.fullName || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
