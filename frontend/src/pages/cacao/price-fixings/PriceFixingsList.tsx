import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { getPriceFixings, createPriceFixing, fixPrice, getLots } from '../../../services/cacao.service';
import { formatDateEc } from '../utils';

export default function PriceFixingsList() {
  const navigate = useNavigate();
  const location = useLocation();
  const [fixings, setFixings] = useState<any[]>([]);
  const [provisionalLots, setProvisionalLots] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ lotId: '', fixedPrice: '', deadline: '' });
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState({ fixedPrice: '', deadline: '' });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const [icePrice, setIcePrice] = useState(8150);
  const [editingIce, setEditingIce] = useState(false);
  const [iceInput, setIceInput] = useState('8150');

  const load = () => {
    setLoading(true);
    Promise.all([getPriceFixings(), getLots()])
      .then(([f, l]) => {
        setFixings(f);
        const openFixingLotIds = f.filter((fix: any) => fix.status === 'OPEN').map((fix: any) => fix.lotId);
        const filtered = l.filter((lot: any) =>
          lot.status === 'OPEN' && !openFixingLotIds.includes(lot.id) && !lot.quality?.isFixedPrice
        );
        setProvisionalLots(filtered);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  function saveIcePrice() {
    const val = parseFloat(iceInput);
    if (!isNaN(val) && val > 0) {
      setIcePrice(val);
    }
    setEditingIce(false);
  }

  async function handleCreate() {
    if (!form.lotId || !form.fixedPrice) { setError('Lote y precio fijado son requeridos'); return; }
    setSaving(true);
    setError('');
    try {
      await createPriceFixing({
        lotId: Number(form.lotId),
        referencePrice: icePrice,
        differential: provisionalLots.find((l: any) => l.id === Number(form.lotId))?.differential
          || provisionalLots.find((l: any) => l.id === Number(form.lotId))?.receptions?.[0]?.differential
          || 0,
        fixedPrice: Number(form.fixedPrice),
        deadline: form.deadline || undefined,
      });
      setShowForm(false);
      setForm({ lotId: '', fixedPrice: '', deadline: '' });
      load();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Error al crear fijación');
    } finally { setSaving(false); }
  }

  function startEdit(f: any) {
    setEditingId(f.id);
    setEditForm({
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
        referencePrice: icePrice,
        fixedPrice: Number(editForm.fixedPrice),
        deadline: editForm.deadline || undefined,
      });
      setEditingId(null);
      load();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Error al actualizar fijación');
    } finally { setSaving(false); }
  }

  function getDaysUntilDeadline(deadline: string | null) {
    if (!deadline) return null;
    const now = new Date();
    const dl = new Date(deadline);
    const diff = Math.ceil((dl.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    return diff;
  }

  function getDeadlineColor(days: number | null) {
    if (days === null) return '#718096';
    if (days < 0) return '#e53e3e';
    if (days <= 3) return '#dd6b20';
    if (days <= 7) return '#b7791f';
    return '#38a169';
  }

  return (
    <div className="page-container">
      <div className="page-header-row">
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button className="cacao-back-btn" onClick={() => navigate(location.state?.from || '/cacao')}>← Volver</button>
          <div>
            <p className="page-eyebrow">CACAO</p>
            <h1>Fijaciones de Precio</h1>
          </div>
        </div>
        <button className="auth-btn" onClick={() => { setError(''); setShowForm(true); }} disabled={provisionalLots.length === 0}>
          + Nueva Fijación
        </button>
      </div>

      {/* Precio ICE Cocoa - Editable */}
      <div style={{ padding: '14px 20px', backgroundColor: '#fffbeb', border: '1px solid #fbd38d', borderRadius: '10px', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
        <span style={{ fontSize: '24px' }}>📊</span>
        <div style={{ flex: 1, minWidth: '200px' }}>
          <div style={{ fontSize: '12px', color: '#975a16', fontWeight: 600, textTransform: 'uppercase' }}>Precio ICE Cocoa (Referencia)</div>
          {editingIce ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px' }}>
              <span style={{ fontSize: '20px', fontWeight: 800, color: '#975a16' }}>$</span>
              <input
                type="number"
                step="0.01"
                value={iceInput}
                onChange={(e) => setIceInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') saveIcePrice(); if (e.key === 'Escape') setEditingIce(false); }}
                autoFocus
                style={{ fontSize: '20px', fontWeight: 800, color: '#975a16', width: '140px', padding: '4px 8px', border: '2px solid #fbd38d', borderRadius: '6px', backgroundColor: 'white' }}
              />
              <span style={{ fontSize: '14px', color: '#975a16' }}>/T</span>
              <button onClick={saveIcePrice} style={{ padding: '4px 10px', backgroundColor: '#38a169', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '12px', fontWeight: 600 }}>✓</button>
              <button onClick={() => setEditingIce(false)} style={{ padding: '4px 10px', backgroundColor: '#e2e8f0', color: '#4a5568', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}>Cancelar</button>
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '2px', cursor: 'pointer' }} onClick={() => { setIceInput(icePrice.toString()); setEditingIce(true); }}>
              <div style={{ fontSize: '24px', fontWeight: 800, color: '#975a16' }}>${icePrice.toLocaleString()}/T</div>
              <span style={{ fontSize: '11px', color: '#b7791f', padding: '2px 8px', backgroundColor: '#fefcbf', borderRadius: '4px', border: '1px solid #f6e05e' }}>✏️ Editar</span>
            </div>
          )}
          <div style={{ fontSize: '11px', color: '#b7791f', marginTop: '4px' }}>Precio base para calcular el diferencial. Haz clic para editar.</div>
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
                <select value={form.lotId} onChange={(e) => setForm({ ...form, lotId: e.target.value })}>
                  <option value="">Seleccionar lote...</option>
                  {provisionalLots.map((l) => {
                    const dif = l.differential || l.receptions?.[0]?.differential || 0;
                    const calcPrice = ((icePrice + dif) / 1000).toFixed(2);
                    return <option key={l.id} value={l.id}>{l.code} ({l.netWeight} kg) — Precio calc: ${calcPrice}/kg</option>;
                  })}
                </select>
              </div>
              <div className="form-group">
                <label>Precio Fijado ($/kg) *</label>
                <input type="number" step="0.0001" min="0" value={form.fixedPrice} onChange={(e) => setForm({ ...form, fixedPrice: e.target.value })} placeholder="Precio definitivo por kg" />
              </div>
            </div>
            {form.lotId && (() => {
              const selectedLot = provisionalLots.find((l: any) => l.id === Number(form.lotId));
              if (!selectedLot) return null;
              const dif = selectedLot.differential || selectedLot.receptions?.[0]?.differential || 0;
              return (
                <div style={{ padding: '14px 18px', backgroundColor: '#ebf8ff', border: '1px solid #bee3f8', borderRadius: '8px', marginBottom: '16px', fontSize: '13px' }}>
                  <div style={{ fontWeight: 700, color: '#2b6cb0', marginBottom: '8px', textTransform: 'uppercase', fontSize: '11px' }}>Datos del Lote Seleccionado</div>
                  <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap' }}>
                    <div><strong>Código:</strong> {selectedLot.code}</div>
                    <div><strong>Calidad:</strong> {selectedLot.quality?.name || '—'}</div>
                    <div><strong>Peso:</strong> {selectedLot.netWeight.toLocaleString()} kg</div>
                    <div><strong>Costo Promedio:</strong> ${selectedLot.averageCost?.toFixed(2)}/kg</div>
                    <div><strong>Diferencial:</strong> ${dif}/T</div>
                    <div><strong>Proveedor:</strong> {selectedLot.receptions?.[0]?.supplier?.name || '—'}</div>
                  </div>
                  <div style={{ marginTop: '8px', padding: '8px 12px', backgroundColor: '#fffbeb', border: '1px solid #f6e05e', borderRadius: '6px' }}>
                    <span style={{ fontWeight: 600, color: '#975a16' }}>Precio sugerido: </span>
                    <span style={{ fontWeight: 700, color: '#975a16', fontSize: '15px' }}>${(((icePrice + dif) / 1000)).toFixed(4)}/kg</span>
                    <span style={{ fontSize: '11px', color: '#b7791f', marginLeft: '8px' }}>(ICE ${icePrice.toLocaleString()} + Dif ${dif}) / 1000</span>
                  </div>
                </div>
              );
            })()}
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

      {/* Tabla de Exposición Abierta */}
      <div className="admin-section">
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
          <h2 style={{ fontSize: '16px', fontWeight: 600, margin: 0 }}>Tabla de Exposición Abierta</h2>
          <span style={{ fontSize: '11px', color: '#718096', padding: '2px 8px', backgroundColor: '#edf2f7', borderRadius: '4px' }}>
            Control de riesgo de precio
          </span>
        </div>
        {loading ? (
          <div className="loading-state">Cargando fijaciones...</div>
        ) : fixings.length === 0 ? (
          <div className="empty-state">No hay fijaciones de precio.</div>
        ) : (
          <div className="tasks-table-wrapper">
            <table className="tasks-table" style={{ fontSize: '13px' }}>
              <thead>
                <tr>
                  <th>Lote</th>
                  <th>Calidad</th>
                  <th style={{ textAlign: 'right' }}>Cant. Pendiente</th>
                  <th style={{ textAlign: 'right' }}>Peso Original</th>
                  <th style={{ textAlign: 'right' }}>Precio Ref. Hoy</th>
                  <th style={{ textAlign: 'right' }}>Diferencial</th>
                  <th style={{ textAlign: 'right' }}>Precio Fijado</th>
                  <th>Fecha Límite</th>
                  <th>Estado</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {fixings.map((f) => {
                  const days = getDaysUntilDeadline(f.deadline);
                  const deadlineColor = getDeadlineColor(days);
                  const lotWeight = f.lot?.netWeight || 0;
                  const pendingWeight = f.status === 'FIXED' ? 0 : (f.pendingWeight || lotWeight);
                  return (
                    <tr key={f.id} style={{ backgroundColor: f.status === 'FIXED' ? '#f0fff4' : 'white' }}>
                      <td style={{ fontFamily: 'monospace', fontWeight: 600 }}>{f.lot?.code || '—'}</td>
                      <td style={{ fontSize: '12px', color: '#718096' }}>{f.lot?.quality?.name || '—'}</td>
                      <td style={{ textAlign: 'right', fontWeight: 700, color: pendingWeight > 0 ? '#b7791f' : '#38a169' }}>
                        {pendingWeight > 0 ? `${pendingWeight.toLocaleString()} kg` : '—'}
                      </td>
                      <td style={{ textAlign: 'right', color: '#718096' }}>{lotWeight.toLocaleString()} kg</td>
                      <td style={{ textAlign: 'right', fontWeight: 600 }}>
                        ${icePrice.toLocaleString()}/T
                        <div style={{ fontSize: '11px', color: '#718096' }}>${(icePrice / 1000).toFixed(4)}/kg</div>
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        {f.differential ? (
                          <span style={{ color: f.differential >= 0 ? '#38a169' : '#e53e3e' }}>
                            {f.differential >= 0 ? '+' : ''}${f.differential.toFixed(0)}/T
                          </span>
                        ) : '—'}
                      </td>
                      <td style={{ textAlign: 'right', fontWeight: 700, color: f.fixedPrice ? '#276749' : '#a0aec0' }}>
                        {f.fixedPrice ? `$${f.fixedPrice.toFixed(4)}/kg` : '—'}
                      </td>
                      <td>
                        {f.deadline ? (
                          <div>
                            <div style={{ fontSize: '12px', color: deadlineColor, fontWeight: 600 }}>
                              {formatDateEc(f.deadline)}
                            </div>
                            <div style={{ fontSize: '11px', color: deadlineColor, fontWeight: 700 }}>
                              {days !== null && (
                                days < 0 ? `Vencido hace ${Math.abs(days)}d` :
                                days === 0 ? 'Vence hoy' :
                                `${days}d restantes`
                              )}
                            </div>
                          </div>
                        ) : '—'}
                      </td>
                      <td>
                        <span className="status-badge" style={{
                          backgroundColor: f.status === 'OPEN' ? '#fefcbf' : '#c6f6d5',
                          color: f.status === 'OPEN' ? '#975a16' : '#276749',
                        }}>
                          {f.status === 'OPEN' ? 'Abierta' : 'Fijada'}
                        </span>
                      </td>
                      <td>
                        <button className="btn-sm-edit" onClick={() => startEdit(f)}>
                          {f.status === 'OPEN' ? 'Fijar' : 'Editar'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {editingId && (
        <div className="modal-overlay" onClick={() => setEditingId(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Fijar Precio — {fixings.find((f) => f.id === editingId)?.lot?.code}</h3>
              <button className="modal-close" onClick={() => setEditingId(null)}>✕</button>
            </div>
            <div className="modal-body">
              {error && <div className="auth-error-banner">{error}</div>}
              {(() => {
                const fixing = fixings.find((f) => f.id === editingId);
                if (!fixing) return null;
                return (
                  <div style={{ padding: '14px 18px', backgroundColor: '#ebf8ff', border: '1px solid #bee3f8', borderRadius: '8px', marginBottom: '16px', fontSize: '13px' }}>
                    <div style={{ fontWeight: 700, color: '#2b6cb0', marginBottom: '8px', textTransform: 'uppercase', fontSize: '11px' }}>Datos del Lote</div>
                    <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap' }}>
                      <div><strong>Código:</strong> {fixing.lot?.code}</div>
                      <div><strong>Calidad:</strong> {fixing.lot?.quality?.name || '—'}</div>
                      <div><strong>Peso:</strong> {(fixing.pendingWeight || fixing.lot?.netWeight || 0).toLocaleString()} kg</div>
                      <div><strong>Diferencial:</strong> ${fixing.differential?.toFixed(0) || '0'}/T</div>
                    </div>
                    <div style={{ marginTop: '8px', padding: '8px 12px', backgroundColor: '#fffbeb', border: '1px solid #f6e05e', borderRadius: '6px' }}>
                      <span style={{ fontWeight: 600, color: '#975a16' }}>ICE Hoy: </span>
                      <span style={{ fontWeight: 700, color: '#975a16' }}>${icePrice.toLocaleString()}/T = ${(icePrice / 1000).toFixed(4)}/kg</span>
                    </div>
                  </div>
                );
              })()}
              <div className="form-group" style={{ marginBottom: '12px' }}>
                <label>Precio Fijado ($/kg) *</label>
                <input type="number" step="0.0001" min="0" value={editForm.fixedPrice} onChange={(e) => setEditForm({ ...editForm, fixedPrice: e.target.value })} placeholder="Precio definitivo por kilogramo" />
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
