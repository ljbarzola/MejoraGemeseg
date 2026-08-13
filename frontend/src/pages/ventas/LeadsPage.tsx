import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getLeads, createLead, assignLead, updateLeadStatus, deleteLead, Lead } from '../../services/ventas.service';
import { getUsers } from '../../services/user.service';

const SOURCE_BADGES: Record<string, { label: string; color: string }> = {
  GOOGLE_ADS: { label: 'Google Ads', color: '#319795' },
  WEB_FORM: { label: 'Web Form', color: '#3182ce' },
  EMAIL: { label: 'Correo', color: '#805ad5' },
  MANUAL: { label: 'Manual', color: '#718096' },
};

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  NEW: { label: 'Nuevo', color: '#3182ce' },
  CONTACTED: { label: 'Contactado', color: '#d69e2e' },
  QUALIFIED: { label: 'Calificado', color: '#805ad5' },
  QUOTED: { label: 'Cotizado', color: '#dd6b20' },
  WON: { label: 'Ganado (Venta)', color: '#38a169' },
  LOST: { label: 'Perdido', color: '#e53e3e' },
};

export default function LeadsPage() {
  const navigate = useNavigate();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNewModal, setShowNewModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');

  // Form for manual lead
  const [form, setForm] = useState({
    fullName: '',
    email: '',
    phone: '',
    companyName: '',
    source: 'MANUAL',
    campaignName: '',
    estimatedValue: 0,
    notes: '',
  });

  const loadData = () => {
    setLoading(true);
    Promise.all([getLeads(), getUsers()])
      .then(([lData, uData]) => {
        setLeads(lData);
        setUsers(uData);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => { loadData(); }, []);

  const handleCreateLead = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.fullName.trim()) { alert('El nombre es obligatorio'); return; }
    setSaving(true);
    try {
      await createLead(form);
      setShowNewModal(false);
      setForm({ fullName: '', email: '', phone: '', companyName: '', source: 'MANUAL', campaignName: '', estimatedValue: 0, notes: '' });
      loadData();
    } catch (err: any) {
      alert(err.response?.data?.message || 'Error al crear prospecto');
    } finally {
      setSaving(false);
    }
  };

  const handleAssignUser = async (leadId: number, userIdStr: string) => {
    const userId = Number(userIdStr);
    if (!userId) return;
    try {
      await assignLead(leadId, userId);
      setLeads((prev) =>
        prev.map((l) => (l.id === leadId ? { ...l, assignedUserId: userId, assignedUser: users.find((u) => u.id === userId) } : l)),
      );
    } catch {
      alert('Error al reasignar prospecto');
    }
  };

  const handleStatusChange = async (lead: Lead, newStatus: string) => {
    let closedVal = lead.closedValue;
    if (newStatus === 'WON') {
      const valStr = prompt('Ingresa el valor real de la venta cerrada ($ USD):', String(lead.estimatedValue || 0));
      if (valStr === null) return;
      closedVal = Number(valStr) || 0;
    }

    try {
      await updateLeadStatus(lead.id, newStatus, closedVal);
      setLeads((prev) =>
        prev.map((l) => (l.id === lead.id ? { ...l, status: newStatus as any, closedValue: closedVal } : l)),
      );
    } catch {
      alert('Error al actualizar estado del prospecto');
    }
  };

  const handleDeleteLead = async (lead: Lead) => {
    if (!window.confirm(`¿Eliminar al prospecto ${lead.fullName}?`)) return;
    try {
      await deleteLead(lead.id);
      loadData();
    } catch {
      alert('Error al eliminar prospecto');
    }
  };

  const filtered = leads.filter(
    (l) =>
      l.fullName.toLowerCase().includes(search.toLowerCase()) ||
      l.email?.toLowerCase().includes(search.toLowerCase()) ||
      l.companyName?.toLowerCase().includes(search.toLowerCase()) ||
      l.campaignName?.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div className="page-container">
      <div className="page-header-row">
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button className="cacao-back-btn" onClick={() => navigate('/ventas')}>← Volver</button>
          <div>
            <p className="page-eyebrow">CRM Y MARKETING DIGITAL</p>
            <h1>Prospectos e Ingesta de Leads</h1>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button className="cacao-back-btn" onClick={() => navigate('/ventas/webhook-config')}>⚙️ Config Webhook API Key</button>
          <button className="auth-btn" onClick={() => setShowNewModal(true)}>+ Nuevo Prospecto</button>
        </div>
      </div>

      <div className="admin-section" style={{ marginTop: '16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <input
            type="text"
            placeholder="Buscar por nombre, correo, empresa o campaña..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ padding: '8px 14px', border: '2px solid #e2e8f0', borderRadius: '10px', fontSize: '0.88rem', width: '320px' }}
          />
          <span style={{ fontSize: '0.85rem', color: '#718096' }}>Total: {filtered.length} prospectos</span>
        </div>

        {loading ? (
          <div className="loading-state">Cargando prospectos CRM...</div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '48px', color: '#a0aec0' }}>
            <div style={{ fontSize: '3rem', marginBottom: '12px' }}>🎯</div>
            <h3>No hay prospectos registrados</h3>
            <p style={{ fontSize: '0.9rem', marginTop: '4px' }}>
              Los leads que ingresen vía Webhook (Google Ads, Web) aparecerán aquí automáticamente en distribución Round-Robin.
            </p>
          </div>
        ) : (
          <div className="tasks-table-wrapper">
            <table className="tasks-table">
              <thead>
                <tr>
                  <th>Nombre y Contacto</th>
                  <th>Origen Canal</th>
                  <th>Vendedor Asignado (Round-Robin)</th>
                  <th>Etapa CRM</th>
                  <th>Valor Est. / Cierre ($)</th>
                  <th>Fecha Ingesta</th>
                  <th className="no-print">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((l) => {
                  const srcBadge = SOURCE_BADGES[l.source] || SOURCE_BADGES.MANUAL;
                  const stBadge = STATUS_LABELS[l.status] || STATUS_LABELS.NEW;

                  return (
                    <tr key={l.id}>
                      <td>
                        <div style={{ fontWeight: 600, color: 'var(--azul-oscuro)' }}>{l.fullName}</div>
                        {l.companyName && <div style={{ fontSize: '0.78rem', color: '#4a5568' }}>🏢 {l.companyName}</div>}
                        {l.email && <div style={{ fontSize: '0.75rem', color: '#718096' }}>✉️ {l.email}</div>}
                        {l.phone && <div style={{ fontSize: '0.75rem', color: '#718096' }}>📞 {l.phone}</div>}
                      </td>
                      <td>
                        <span
                          style={{
                            padding: '3px 8px', borderRadius: '12px', fontSize: '0.75rem', fontWeight: 600,
                            background: srcBadge.color + '20', color: srcBadge.color,
                          }}
                        >
                          {srcBadge.label}
                        </span>
                        {l.campaignName && <div style={{ fontSize: '0.72rem', color: '#a0aec0', marginTop: '2px' }}>{l.campaignName}</div>}
                      </td>
                      <td>
                        <select
                          value={l.assignedUserId || ''}
                          onChange={(e) => handleAssignUser(l.id, e.target.value)}
                          style={{ padding: '4px 8px', borderRadius: '6px', border: '1px solid #cbd5e0', fontSize: '0.8rem', fontWeight: 500 }}
                        >
                          <option value="">Sin asignar</option>
                          {users.map((u) => (
                            <option key={u.id} value={u.id}>
                              {u.fullName}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <select
                          value={l.status}
                          onChange={(e) => handleStatusChange(l, e.target.value)}
                          style={{
                            padding: '4px 8px', borderRadius: '12px', border: 'none',
                            fontSize: '0.78rem', fontWeight: 700,
                            background: stBadge.color + '20', color: stBadge.color, cursor: 'pointer',
                          }}
                        >
                          <option value="NEW">1. Nuevo</option>
                          <option value="CONTACTED">2. Contactado</option>
                          <option value="QUALIFIED">3. Calificado</option>
                          <option value="QUOTED">4. Cotizado</option>
                          <option value="WON">5. Ganado (Venta)</option>
                          <option value="LOST">Descartado</option>
                        </select>
                      </td>
                      <td>
                        {l.status === 'WON' ? (
                          <div style={{ fontWeight: 800, color: '#276749', fontSize: '0.88rem' }}>
                            ${(l.closedValue || 0).toFixed(2)}
                            <div style={{ fontSize: '0.7rem', color: '#a0aec0' }}>Cierre ($MD)</div>
                          </div>
                        ) : (
                          <div style={{ fontWeight: 600, color: '#4a5568', fontSize: '0.82rem' }}>
                            ${(l.estimatedValue || 0).toFixed(2)}
                            <div style={{ fontSize: '0.7rem', color: '#a0aec0' }}>Estimado</div>
                          </div>
                        )}
                      </td>
                      <td>{new Date(l.createdAt).toLocaleDateString('es-EC')}</td>
                      <td className="no-print">
                        <button
                          style={{ background: 'none', border: 'none', color: '#e53e3e', cursor: 'pointer', fontSize: '0.85rem' }}
                          onClick={() => handleDeleteLead(l)}
                          title="Eliminar prospecto"
                        >
                          🗑️
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

      {/* NEW LEAD MODAL */}
      {showNewModal && (
        <div className="modal-backdrop">
          <div className="modal-card" style={{ maxWidth: 500 }}>
            <h3>Registrar Prospecto Manual</h3>
            <form onSubmit={handleCreateLead} style={{ marginTop: '12px' }}>
              <div className="form-group">
                <label>Nombre Completo del Prospecto *</label>
                <input
                  value={form.fullName}
                  onChange={(e) => setForm({ ...form, fullName: e.target.value })}
                  placeholder="Ej: Juan Carlos Pérez"
                  required
                />
              </div>

              <div className="form-row" style={{ marginTop: '8px' }}>
                <div className="form-group">
                  <label>Correo Electrónico</label>
                  <input
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    placeholder="ejemplo@cliente.com"
                  />
                </div>
                <div className="form-group">
                  <label>Teléfono</label>
                  <input
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                    placeholder="0991234567"
                  />
                </div>
              </div>

              <div className="form-row" style={{ marginTop: '8px' }}>
                <div className="form-group">
                  <label>Empresa</label>
                  <input
                    value={form.companyName}
                    onChange={(e) => setForm({ ...form, companyName: e.target.value })}
                    placeholder="Ej: Exportadora del Sur"
                  />
                </div>
                <div className="form-group">
                  <label>Monto Estimado ($ USD)</label>
                  <input
                    type="number"
                    value={form.estimatedValue}
                    onChange={(e) => setForm({ ...form, estimatedValue: Number(e.target.value) })}
                  />
                </div>
              </div>

              <div className="form-group" style={{ marginTop: '8px' }}>
                <label>Campaña de Origen</label>
                <input
                  value={form.campaignName}
                  onChange={(e) => setForm({ ...form, campaignName: e.target.value })}
                  placeholder="Ej: Google Ads - Cacao Fino Agosto"
                />
              </div>

              <div className="modal-actions" style={{ marginTop: '16px' }}>
                <button type="button" className="btn-secondary" onClick={() => setShowNewModal(false)}>Cancelar</button>
                <button type="submit" className="auth-btn" disabled={saving}>
                  {saving ? 'Guardando...' : 'Crear Prospecto'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
