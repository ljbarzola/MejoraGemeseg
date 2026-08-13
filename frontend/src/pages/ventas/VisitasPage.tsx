import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getVisits, createVisit, checkInVisit, completeVisit, cancelVisit, deleteVisit, ClientVisit } from '../../services/ventas.service';

const OUTCOME_LABELS: Record<string, string> = {
  INTERESTED: 'Interesado',
  QUOTED: 'Cotizado',
  CLOSED_SALE: 'Venta Cerrada',
  NOT_INTERESTED: 'No Interesado',
  FOLLOW_UP: 'Requiere Seguimiento',
};

export default function VisitasPage() {
  const navigate = useNavigate();
  const [visits, setVisits] = useState<ClientVisit[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNewModal, setShowNewModal] = useState(false);
  const [showOfferModal, setShowOfferModal] = useState<ClientVisit | null>(null);
  const [saving, setSaving] = useState(false);
  const [checkingInId, setCheckingInId] = useState<number | null>(null);

  // New Visit Form
  const [newForm, setNewForm] = useState({
    clientName: '',
    clientAddress: '',
    clientPhone: '',
    visitDate: new Date().toISOString().split('T')[0],
    notes: '',
  });

  // Post-Visit Offer Form
  const [offerForm, setOfferForm] = useState({
    commercialOffer: '',
    quotedAmount: 0,
    outcome: 'QUOTED',
    notes: '',
  });

  const loadVisits = () => {
    setLoading(true);
    getVisits()
      .then(setVisits)
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => { loadVisits(); }, []);

  const handleCreateVisit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newForm.clientName.trim()) { alert('El nombre del cliente es obligatorio'); return; }
    setSaving(true);
    try {
      await createVisit(newForm);
      setShowNewModal(false);
      setNewForm({ clientName: '', clientAddress: '', clientPhone: '', visitDate: new Date().toISOString().split('T')[0], notes: '' });
      loadVisits();
    } catch (err: any) {
      alert(err.response?.data?.message || 'Error al agendar visita');
    } finally {
      setSaving(false);
    }
  };

  const handleCheckIn = async (visit: ClientVisit) => {
    setCheckingInId(visit.id);
    if (!navigator.geolocation) {
      alert('Tu navegador no soporta geolocalización. Realizando Check-in sin GPS...');
      try {
        await checkInVisit(visit.id);
        loadVisits();
      } catch (err: any) {
        alert(err.response?.data?.message || 'Error en Check-in');
      } finally {
        setCheckingInId(null);
      }
      return;
    }

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          await checkInVisit(visit.id, {
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
          });
          loadVisits();
        } catch (err: any) {
          alert(err.response?.data?.message || 'Error en Check-in');
        } finally {
          setCheckingInId(null);
        }
      },
      async () => {
        // Geolocation error/denied fallback
        try {
          await checkInVisit(visit.id);
          loadVisits();
        } catch (err: any) {
          alert(err.response?.data?.message || 'Error en Check-in');
        } finally {
          setCheckingInId(null);
        }
      },
      { timeout: 10000, enableHighAccuracy: true },
    );
  };

  const handleCompleteVisitSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!showOfferModal) return;
    setSaving(true);
    try {
      await completeVisit(showOfferModal.id, offerForm);
      setShowOfferModal(null);
      loadVisits();
    } catch (err: any) {
      alert(err.response?.data?.message || 'Error al registrar oferta comercial');
    } finally {
      setSaving(false);
    }
  };

  const handleCancelVisit = async (visit: ClientVisit) => {
    const reason = prompt('Motivo de cancelación de la visita:');
    if (reason === null) return;
    try {
      await cancelVisit(visit.id, reason);
      loadVisits();
    } catch {
      alert('Error al cancelar visita');
    }
  };

  const handleDeleteVisit = async (visit: ClientVisit) => {
    if (!window.confirm(`¿Eliminar la visita a ${visit.clientName}?`)) return;
    try {
      await deleteVisit(visit.id);
      loadVisits();
    } catch {
      alert('Error al eliminar visita');
    }
  };

  return (
    <div className="page-container">
      <div className="page-header-row">
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button className="cacao-back-btn" onClick={() => navigate('/ventas')}>← Volver</button>
          <div>
            <p className="page-eyebrow">VENTAS Y CAMPO</p>
            <h1>Agenda y Verificación de Visitas</h1>
          </div>
        </div>
        <button className="auth-btn" onClick={() => setShowNewModal(true)}>+ Planificar Nueva Visita</button>
      </div>

      <div className="admin-section" style={{ marginTop: '16px' }}>
        {loading ? (
          <div className="loading-state">Cargando visitas de campo...</div>
        ) : visits.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '48px', color: '#a0aec0' }}>
            <div style={{ fontSize: '3rem', marginBottom: '12px' }}>📍</div>
            <h3>No hay visitas agendadas</h3>
            <p style={{ fontSize: '0.9rem', marginTop: '4px' }}>
              Planifica las visitas de tu semana para cumplir la meta de ventas.
            </p>
            <button className="auth-btn" style={{ marginTop: '16px' }} onClick={() => setShowNewModal(true)}>
              + Planificar Mi Primera Visita
            </button>
          </div>
        ) : (
          <div className="tasks-table-wrapper">
            <table className="tasks-table">
              <thead>
                <tr>
                  <th>Cliente</th>
                  <th>Vendedor</th>
                  <th>Fecha Agendada</th>
                  <th>Check-In GPS</th>
                  <th>Estado</th>
                  <th>Oferta Comercial</th>
                  <th>Resultado</th>
                  <th className="no-print">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {visits.map((v) => (
                  <tr key={v.id}>
                    <td>
                      <div style={{ fontWeight: 600, color: 'var(--azul-oscuro)' }}>{v.clientName}</div>
                      {v.clientAddress && <div style={{ fontSize: '0.78rem', color: '#718096' }}>📍 {v.clientAddress}</div>}
                      {v.clientPhone && <div style={{ fontSize: '0.78rem', color: '#718096' }}>📞 {v.clientPhone}</div>}
                    </td>
                    <td>{v.user?.fullName || '—'}</td>
                    <td>{new Date(v.visitDate).toLocaleDateString('es-EC')}</td>
                    <td>
                      {v.isVerified ? (
                        <div style={{ color: '#276749', fontSize: '0.82rem', fontWeight: 600 }}>
                          ✅ Verificado
                          {v.checkInTime && <div style={{ fontSize: '0.72rem', color: '#718096' }}>{new Date(v.checkInTime).toLocaleTimeString('es-EC', { hour: '2-digit', minute: '2-digit' })}</div>}
                          {v.checkInLat && <div style={{ fontSize: '0.7rem', color: '#a0aec0' }}>GPS: {v.checkInLat.toFixed(4)}, {v.checkInLng?.toFixed(4)}</div>}
                        </div>
                      ) : (
                        <span style={{ color: '#a0aec0', fontSize: '0.82rem' }}>Pendiente</span>
                      )}
                    </td>
                    <td>
                      <span
                        style={{
                          padding: '3px 10px', borderRadius: '12px', fontSize: '0.75rem', fontWeight: 600,
                          background: v.status === 'COMPLETED' ? '#c6f6d5' : v.status === 'IN_PROGRESS' ? '#fefcbf' : v.status === 'CANCELLED' ? '#fed7d7' : '#e2e8f0',
                          color: v.status === 'COMPLETED' ? '#22543d' : v.status === 'IN_PROGRESS' ? '#744210' : v.status === 'CANCELLED' ? '#742a2a' : '#4a5568',
                        }}
                      >
                        {v.status === 'COMPLETED' ? 'Completada' : v.status === 'IN_PROGRESS' ? 'En Proceso' : v.status === 'CANCELLED' ? 'Cancelada' : 'Agendada'}
                      </span>
                    </td>
                    <td>
                      {v.commercialOffer ? (
                        <div>
                          <div style={{ fontWeight: 500, fontSize: '0.82rem' }}>{v.commercialOffer}</div>
                          {v.quotedAmount ? <div style={{ fontSize: '0.78rem', color: '#2b6cb0', fontWeight: 700 }}>${v.quotedAmount.toFixed(2)}</div> : null}
                        </div>
                      ) : (
                        <span style={{ color: '#a0aec0', fontSize: '0.8rem' }}>—</span>
                      )}
                    </td>
                    <td>
                      {v.outcome ? (
                        <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--azul-oscuro)' }}>
                          {OUTCOME_LABELS[v.outcome] || v.outcome}
                        </span>
                      ) : (
                        <span style={{ color: '#a0aec0', fontSize: '0.8rem' }}>—</span>
                      )}
                    </td>
                    <td className="no-print">
                      <div style={{ display: 'flex', gap: '6px' }}>
                        {v.status === 'PLANNED' && (
                          <button
                            className="auth-btn"
                            style={{ padding: '4px 8px', fontSize: '0.75rem' }}
                            disabled={checkingInId === v.id}
                            onClick={() => handleCheckIn(v)}
                          >
                            {checkingInId === v.id ? '📍 Verificando...' : '📍 Check-In GPS'}
                          </button>
                        )}

                        {(v.status === 'IN_PROGRESS' || v.status === 'PLANNED') && (
                          <button
                            className="btn-secondary-sm"
                            style={{ padding: '4px 8px', fontSize: '0.75rem' }}
                            onClick={() => {
                              setShowOfferModal(v);
                              setOfferForm({
                                commercialOffer: v.commercialOffer || '',
                                quotedAmount: v.quotedAmount || 0,
                                outcome: v.outcome || 'QUOTED',
                                notes: v.notes || '',
                              });
                            }}
                          >
                            📝 Oferta / Cierre
                          </button>
                        )}

                        {v.status !== 'COMPLETED' && v.status !== 'CANCELLED' && (
                          <button
                            className="btn-danger-sm"
                            style={{ padding: '4px 6px', fontSize: '0.75rem' }}
                            onClick={() => handleCancelVisit(v)}
                          >
                            X
                          </button>
                        )}

                        <button
                          style={{ background: 'none', border: 'none', color: '#e53e3e', cursor: 'pointer', fontSize: '0.85rem' }}
                          onClick={() => handleDeleteVisit(v)}
                          title="Eliminar registro"
                        >
                          🗑️
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* PLAN NEW VISIT MODAL */}
      {showNewModal && (
        <div className="modal-backdrop">
          <div className="modal-card" style={{ maxWidth: 500 }}>
            <h3>Planificar Nueva Visita</h3>
            <form onSubmit={handleCreateVisit} style={{ marginTop: '12px' }}>
              <div className="form-group">
                <label>Nombre del Cliente / Empresa *</label>
                <input
                  value={newForm.clientName}
                  onChange={(e) => setNewForm({ ...newForm, clientName: e.target.value })}
                  placeholder="Ej: Agro Cacao San José"
                  required
                />
              </div>

              <div className="form-group" style={{ marginTop: '8px' }}>
                <label>Dirección / Ubicación de la Visita</label>
                <input
                  value={newForm.clientAddress}
                  onChange={(e) => setNewForm({ ...newForm, clientAddress: e.target.value })}
                  placeholder="Ej: Km 12 Vía a Quevedo, Finca San José"
                />
              </div>

              <div className="form-row" style={{ marginTop: '8px' }}>
                <div className="form-group">
                  <label>Teléfono de Contacto</label>
                  <input
                    value={newForm.clientPhone}
                    onChange={(e) => setNewForm({ ...newForm, clientPhone: e.target.value })}
                    placeholder="Ej: 0991234567"
                  />
                </div>
                <div className="form-group">
                  <label>Fecha Programada *</label>
                  <input
                    type="date"
                    value={newForm.visitDate}
                    onChange={(e) => setNewForm({ ...newForm, visitDate: e.target.value })}
                    required
                  />
                </div>
              </div>

              <div className="form-group" style={{ marginTop: '8px' }}>
                <label>Notas / Objetivo de la visita</label>
                <textarea
                  value={newForm.notes}
                  onChange={(e) => setNewForm({ ...newForm, notes: e.target.value })}
                  rows={2}
                  placeholder="Notas de preparación previa..."
                />
              </div>

              <div className="modal-actions" style={{ marginTop: '16px' }}>
                <button type="button" className="btn-secondary" onClick={() => setShowNewModal(false)}>Cancelar</button>
                <button type="submit" className="auth-btn" disabled={saving}>
                  {saving ? 'Guardando...' : 'Agendar Visita'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* POST-VISIT OFFER MODAL */}
      {showOfferModal && (
        <div className="modal-backdrop">
          <div className="modal-card" style={{ maxWidth: 550 }}>
            <h3>Registro de Oferta Comercial y Cierre</h3>
            <p style={{ fontSize: '0.85rem', color: '#718096' }}>
              Cliente: <strong>{showOfferModal.clientName}</strong>
            </p>

            <form onSubmit={handleCompleteVisitSubmit} style={{ marginTop: '12px' }}>
              <div className="form-group">
                <label>Productos / Servicios Ofrecidos (Detalle de Oferta) *</label>
                <textarea
                  value={offerForm.commercialOffer}
                  onChange={(e) => setOfferForm({ ...offerForm, commercialOffer: e.target.value })}
                  rows={3}
                  placeholder="Ej: Ofrecido lote de 50 sacos de cacao fino de aroma, servicio de custodia y transporte hasta puerto..."
                  required
                />
              </div>

              <div className="form-row" style={{ marginTop: '8px' }}>
                <div className="form-group">
                  <label>Monto Cotizado ($ USD)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={offerForm.quotedAmount}
                    onChange={(e) => setOfferForm({ ...offerForm, quotedAmount: Number(e.target.value) })}
                  />
                </div>
                <div className="form-group">
                  <label>Resultado de la Visita *</label>
                  <select
                    value={offerForm.outcome}
                    onChange={(e) => setOfferForm({ ...offerForm, outcome: e.target.value })}
                  >
                    <option value="INTERESTED">Interesado</option>
                    <option value="QUOTED">Cotizado</option>
                    <option value="CLOSED_SALE">Venta Cerrada (Ganado)</option>
                    <option value="FOLLOW_UP">Requiere Seguimiento</option>
                    <option value="NOT_INTERESTED">No Interesado</option>
                  </select>
                </div>
              </div>

              <div className="form-group" style={{ marginTop: '8px' }}>
                <label>Notas de Conclusión de Visita</label>
                <textarea
                  value={offerForm.notes}
                  onChange={(e) => setOfferForm({ ...offerForm, notes: e.target.value })}
                  rows={2}
                  placeholder="Observaciones finales..."
                />
              </div>

              <div className="modal-actions" style={{ marginTop: '16px' }}>
                <button type="button" className="btn-secondary" onClick={() => setShowOfferModal(null)}>Cancelar</button>
                <button type="submit" className="auth-btn" disabled={saving}>
                  {saving ? 'Guardando...' : 'Completar Visita'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
