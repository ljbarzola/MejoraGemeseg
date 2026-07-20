import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getPriceFixings, createPriceFixing, fixPrice, getLots } from '../../../services/cacao.service';
import { formatDateEc } from '../utils';

export default function PriceFixingsList() {
  const navigate = useNavigate();
  const [fixings, setFixings] = useState<any[]>([]);
  const [provisionalLots, setProvisionalLots] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ lotId: '', referencePrice: '', differential: '', fixedPrice: '', deadline: '' });
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState({ referencePrice: '', differential: '', fixedPrice: '', deadline: '' });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  // Precio simulado del día (NO es real)
  const simulatedIcePrice = 8150;

  const load = () => {
    setLoading(true);
    Promise.all([getPriceFixings(), getLots()])
      .then(([f, l]) => {
        setFixings(f);
        // Solo lotes que no tienen fijación activa y son de calidad con precio provisional
        const openFixingLotIds = f.filter((fix: any) => fix.status === 'OPEN').map((fix: any) => fix.lotId);
        const filtered = l.filter((lot: any) =>
          lot.status === 'OPEN' && !openFixingLotIds.includes(lot.id) && !lot.quality?.isFixedPrice
        );
        setProvisionalLots(filtered);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  async function handleCreate() {
    if (!form.lotId || !form.fixedPrice) { setError('Lote y precio fijado son requeridos'); return; }
    setSaving(true);
    setError('');
    try {
      await createPriceFixing({
        lotId: Number(form.lotId),
        referencePrice: Number(form.referencePrice) || 0,
        differential: Number(form.differential) || 0,
        fixedPrice: Number(form.fixedPrice),
        deadline: form.deadline || undefined,
      });
      setShowForm(false);
      setForm({ lotId: '', referencePrice: '', differential: '', fixedPrice: '', deadline: '' });
      load();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Error al crear fijación');
    } finally { setSaving(false); }
  }

  function startEdit(f: any) {
    setEditingId(f.id);
    setEditForm({
      referencePrice: f.referencePrice?.toString() || '',
      differential: f.differential?.toString() || '',
      fixedPrice: f.fixedPrice?.toString() || '',
      deadline: f.deadline ? new Date(f.deadline).toISOString().split('T')[0] : '',
    });
  }

  async function handleUpdate() {
    if (!editingId || !editForm.fixedPrice) { setError('Precio fijado es requerido'); return; }
    setSaving(true);
    setError('');
    try {
      await fixPrice(editingId, {
        referencePrice: Number(editForm.referencePrice) || 0,
        differential: Number(editForm.differential) || 0,
        fixedPrice: Number(editForm.fixedPrice),
        deadline: editForm.deadline || undefined,
      });
      setEditingId(null);
      load();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Error al actualizar fijación');
    } finally { setSaving(false); }
  }

  return (
    <div className="page-container">
      <div className="page-header-row">
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button className="cacao-back-btn" onClick={() => navigate('/cacao')}>← Volver</button>
          <div>
            <p className="page-eyebrow">CACAO</p>
            <h1>Fijaciones de Precio</h1>
          </div>
        </div>
        <button className="auth-btn" onClick={() => { setError(''); setShowForm(true); }} disabled={provisionalLots.length === 0}>
          + Nueva Fijación
        </button>
      </div>

      {/* Precio simulado del día */}
      <div style={{ padding: '14px 20px', backgroundColor: '#fffbeb', border: '1px solid #fbd38d', borderRadius: '10px', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '12px' }}>
        <span style={{ fontSize: '20px' }}>📊</span>
        <div>
          <div style={{ fontSize: '12px', color: '#975a16', fontWeight: 600, textTransform: 'uppercase' }}>Precio ICE Cocoa (Simulado)</div>
          <div style={{ fontSize: '20px', fontWeight: 800, color: '#975a16' }}>${simulatedIcePrice.toLocaleString()}/T</div>
          <div style={{ fontSize: '11px', color: '#b7791f', marginTop: '2px' }}>⚠ Este precio es una simulación. No se actualiza en tiempo real y NO representa el precio real del mercado.</div>
        </div>
      </div>

      {showForm && (
        <div className="page-card" style={{ marginBottom: '16px' }}>
          <div className="cacao-form">
            {error && <div className="auth-error-banner">{error}</div>}
            <div className="form-section-title">Nueva Fijación</div>
            <div className="form-row">
              <div className="form-group">
                <label>Lote (solo precios provisionales) *</label>
                <select value={form.lotId} onChange={(e) => {
                  const lotId = e.target.value;
                  const lot = provisionalLots.find((l: any) => l.id === Number(lotId));
                  setForm({
                    ...form,
                    lotId,
                    differential: lot?.differential?.toString() || lot?.receptions?.[0]?.differential?.toString() || form.differential,
                  });
                }}>
                  <option value="">Seleccionar lote...</option>
                  {provisionalLots.map((l) => <option key={l.id} value={l.id}>{l.code} ({l.netWeight} kg - ${l.averageCost.toFixed(2)}/kg){l.differential ? ` [Dif: $${l.differential}]` : ''}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label>Precio Fijado ($/kg) *</label>
                <input type="number" step="0.01" min="0" value={form.fixedPrice} onChange={(e) => setForm({ ...form, fixedPrice: e.target.value })} />
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>Precio Referencia ICE ($/T)</label>
                <input type="number" step="0.01" value={form.referencePrice} onChange={(e) => setForm({ ...form, referencePrice: e.target.value })} placeholder={`${simulatedIcePrice}`} />
              </div>
              <div className="form-group">
                <label>Diferencial ($/T)</label>
                <input type="number" step="0.01" value={form.differential} onChange={(e) => setForm({ ...form, differential: e.target.value })} />
              </div>
            </div>
            <div className="form-row">
              <div className="form-group" style={{ maxWidth: '50%' }}>
                <label>Fecha Límite para Fijar</label>
                <input type="date" value={form.deadline} onChange={(e) => setForm({ ...form, deadline: e.target.value })} />
              </div>
            </div>
            <div style={{ display: 'flex', gap: '10px', marginTop: '8px' }}>
              <button className="btn-secondary" onClick={() => setShowForm(false)}>Cancelar</button>
              <button className="auth-btn" onClick={handleCreate} disabled={saving}>{saving ? 'Guardando...' : 'Crear'}</button>
            </div>
          </div>
        </div>
      )}

      {provisionalLots.length === 0 && !showForm && (
        <div style={{ padding: '16px 20px', backgroundColor: '#f7fafc', borderRadius: '10px', marginBottom: '16px', fontSize: '14px', color: '#718096' }}>
          No hay lotes con precio provisional disponible para fijar. Los lotes con precio fijo no requieren fijación.
        </div>
      )}

      <div className="admin-section">
        {loading ? (
          <div className="loading-state">Cargando fijaciones...</div>
        ) : fixings.length === 0 ? (
          <div className="empty-state">No hay fijaciones de precio.</div>
        ) : (
          <div className="tasks-table-wrapper">
            <table className="tasks-table">
              <thead>
                <tr>
                  <th>Lote</th>
                  <th>Precio Ref.</th>
                  <th>Diferencial</th>
                  <th>Precio Fijado</th>
                  <th>Peso Pendiente</th>
                  <th>Fecha Límite</th>
                  <th>Estado</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {fixings.map((f) => (
                  <tr key={f.id}>
                    <td>{f.lot?.code || '—'}</td>
                    <td>{f.referencePrice ? `$${f.referencePrice.toFixed(2)}` : '—'}</td>
                    <td>{f.differential ? `$${f.differential.toFixed(2)}` : '—'}</td>
                    <td>{f.fixedPrice ? `$${f.fixedPrice.toFixed(2)}` : '—'}</td>
                    <td>{f.pendingWeight?.toLocaleString() || 0} kg</td>
                    <td>{f.deadline ? formatDateEc(f.deadline) : '—'}</td>
                    <td>
                      <span className="status-badge" style={{ backgroundColor: f.status === 'OPEN' ? '#fefcbf' : '#c6f6d5', color: f.status === 'OPEN' ? '#975a16' : '#276749' }}>
                        {f.status === 'OPEN' ? 'Abierta' : 'Fijada'}
                      </span>
                    </td>
                    <td>
                      <button className="btn-sm-edit" onClick={() => startEdit(f)}>
                        {f.status === 'OPEN' ? 'Fijar Precio' : 'Editar'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {editingId && (
        <div className="modal-overlay" onClick={() => setEditingId(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Editar Fijación de Precio</h3>
              <button className="modal-close" onClick={() => setEditingId(null)}>✕</button>
            </div>
            <div className="modal-body">
              {error && <div className="auth-error-banner">{error}</div>}
              <div className="form-group" style={{ marginBottom: '12px' }}>
                <label>Precio Referencia ICE ($/T)</label>
                <input type="number" step="0.01" value={editForm.referencePrice} onChange={(e) => setEditForm({ ...editForm, referencePrice: e.target.value })} placeholder={`${simulatedIcePrice}`} />
              </div>
              <div className="form-group" style={{ marginBottom: '12px' }}>
                <label>Diferencial ($/T)</label>
                <input type="number" step="0.01" value={editForm.differential} onChange={(e) => setEditForm({ ...editForm, differential: e.target.value })} />
              </div>
              <div className="form-group" style={{ marginBottom: '12px' }}>
                <label>Precio Fijado ($/kg) *</label>
                <input type="number" step="0.01" min="0" value={editForm.fixedPrice} onChange={(e) => setEditForm({ ...editForm, fixedPrice: e.target.value })} />
              </div>
              <div className="form-group">
                <label>Fecha Límite</label>
                <input type="date" value={editForm.deadline} onChange={(e) => setEditForm({ ...editForm, deadline: e.target.value })} />
              </div>
            </div>
            <div className="modal-actions">
              <button className="btn-secondary" onClick={() => setEditingId(null)}>Cancelar</button>
              <button className="auth-btn" onClick={handleUpdate} disabled={saving}>{saving ? 'Guardando...' : 'Guardar'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
