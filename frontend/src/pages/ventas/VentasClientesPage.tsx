import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Plus } from 'lucide-react';
import ConfirmDialog from '../../components/common/ConfirmDialog';
import { useToast } from '../../contexts/ToastContext';
import {
  getSalesClients,
  createSalesClient,
  updateSalesClient,
  deleteSalesClient,
  getSalesClientFields,
  addSalesClientField,
  deleteSalesClientField,
  SalesClient,
  SalesClientField,
  salesClientValue,
} from '../../services/ventas.service';

const emptyForm = { name: '', email: '', phone: '', ruc: '', address: '', extra: {} as Record<string, string> };

export default function VentasClientesPage() {
  const { showToast } = useToast();
  const [searchParams] = useSearchParams();
  const [clients, setClients] = useState<SalesClient[]>([]);
  const [fields, setFields] = useState<SalesClientField[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<SalesClient | null>(null);
  const [newFieldLabel, setNewFieldLabel] = useState('');
  const [addingField, setAddingField] = useState(false);

  const extraFields = fields.filter((f) => !f.isCore);

  const load = async () => {
    setLoading(true);
    try {
      const [c, f] = await Promise.all([getSalesClients(), getSalesClientFields()]);
      setClients(c);
      setFields(f);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);
  useEffect(() => {
    if (searchParams.get('nuevo') === '1') setShowForm(true);
  }, [searchParams]);

  const startEdit = (c: SalesClient) => {
    setEditingId(c.id);
    setForm({
      name: c.name,
      email: c.email,
      phone: c.phone || '',
      ruc: c.ruc || '',
      address: c.address || '',
      extra: { ...(c.extra || {}) },
    });
    setShowForm(true);
  };

  const reset = () => {
    setForm(emptyForm);
    setEditingId(null);
    setShowForm(false);
  };

  const handleSave = async () => {
    if (!form.name.trim() || !form.email.trim()) {
      showToast('Nombre y email son requeridos', 'error');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        email: form.email.trim(),
        phone: form.phone.trim() || undefined,
        ruc: form.ruc.trim() || undefined,
        address: form.address.trim() || undefined,
        extra: form.extra,
      };
      if (editingId) await updateSalesClient(editingId, payload);
      else await createSalesClient(payload);
      showToast(editingId ? 'Cliente actualizado' : 'Cliente creado', 'success');
      reset();
      load();
    } catch (err: any) {
      showToast(err?.response?.data?.message || 'No se pudo guardar', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleAddField = async () => {
    if (!newFieldLabel.trim()) return;
    setAddingField(true);
    try {
      await addSalesClientField({ label: newFieldLabel.trim() });
      setNewFieldLabel('');
      showToast('Campo añadido a la ficha de clientes', 'success');
      load();
    } catch (err: any) {
      showToast(err?.response?.data?.message || 'No se pudo añadir el campo', 'error');
    } finally {
      setAddingField(false);
    }
  };

  return (
    <div className="page-container">
      <div className="page-header-row">
        <div>
          <p className="page-eyebrow">Ventas y CRM</p>
          <h1>Clientes</h1>
        </div>
        <div className="header-actions">
          <button className="auth-btn" onClick={() => { reset(); setShowForm(true); }}>
            <Plus size={16} /> Nuevo cliente
          </button>
        </div>
      </div>

      <div className="admin-section" style={{ marginBottom: 16 }}>
        <h3 style={{ margin: '0 0 8px', fontSize: 14 }}>Campos de la ficha</h3>
        <p style={{ fontSize: 12, color: '#666', margin: '0 0 12px' }}>
          Estos campos se pueden mapear a las variables de un contrato. Nombre y email son fijos; puedes añadir más.
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
          {fields.map((f) => (
            <span key={f.id} style={{ padding: '4px 10px', borderRadius: 12, background: f.isCore ? '#ede9fe' : '#f1f5f9', fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              {f.label}
              {!f.isCore && (
                <button type="button" onClick={() => deleteSalesClientField(f.id).then(load)}
                  style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#c33', fontSize: 12, padding: 0 }}>✕</button>
              )}
            </span>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 8, maxWidth: 480 }}>
          <input value={newFieldLabel} onChange={(e) => setNewFieldLabel(e.target.value)} placeholder="Nuevo campo (ej. Representante legal)"
            style={{ flex: 1, padding: '8px 12px', borderRadius: 4, border: '1px solid #ddd', fontSize: 13 }} />
          <button className="btn-secondary" onClick={handleAddField} disabled={addingField || !newFieldLabel.trim()}
            style={{ padding: '8px 14px', fontSize: 12 }}>Añadir campo</button>
        </div>
      </div>

      {showForm && (
        <div className="admin-section" style={{ marginBottom: 16 }}>
          <h3 style={{ margin: '0 0 12px', fontSize: 14 }}>{editingId ? 'Editar cliente' : 'Nuevo cliente'}</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Field label="Nombre / Razón social *" value={form.name} onChange={(v) => setForm({ ...form, name: v })} />
            <Field label="Email *" value={form.email} onChange={(v) => setForm({ ...form, email: v })} type="email" />
            <Field label="Teléfono" value={form.phone} onChange={(v) => setForm({ ...form, phone: v })} />
            <Field label="Cédula / RUC" value={form.ruc} onChange={(v) => setForm({ ...form, ruc: v })} />
            <div style={{ gridColumn: '1 / -1' }}>
              <Field label="Dirección" value={form.address} onChange={(v) => setForm({ ...form, address: v })} />
            </div>
            {extraFields.map((f) => (
              <Field key={f.key} label={f.label} value={form.extra[f.key] || ''}
                onChange={(v) => setForm({ ...form, extra: { ...form.extra, [f.key]: v } })} />
            ))}
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
            <button className="btn-secondary" onClick={reset} style={{ padding: '8px 16px' }}>Cancelar</button>
            <button className="auth-btn" onClick={handleSave} disabled={saving} style={{ padding: '8px 16px' }}>
              {saving ? 'Guardando...' : 'Guardar'}
            </button>
          </div>
        </div>
      )}

      <div className="admin-section">
        {loading ? (
          <p style={{ color: '#888' }}>Cargando...</p>
        ) : clients.length === 0 ? (
          <p style={{ color: '#888', fontSize: 13 }}>Aún no hay clientes. Crea uno para mapearlo a los contratos.</p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #e2e8f0' }}>
                <th style={{ textAlign: 'left', padding: '8px' }}>Nombre</th>
                <th style={{ textAlign: 'left', padding: '8px' }}>Email</th>
                <th style={{ textAlign: 'left', padding: '8px' }}>RUC / Cédula</th>
                <th style={{ textAlign: 'left', padding: '8px' }}>Teléfono</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {clients.map((c) => (
                <tr key={c.id} style={{ borderBottom: '1px solid #f0f0f0' }}>
                  <td style={{ padding: '8px', fontWeight: 600 }}>{c.name}</td>
                  <td style={{ padding: '8px' }}>{c.email}</td>
                  <td style={{ padding: '8px' }}>{salesClientValue(c, 'ruc') || '—'}</td>
                  <td style={{ padding: '8px' }}>{c.phone || '—'}</td>
                  <td style={{ padding: '8px', textAlign: 'right' }}>
                    <button className="btn-secondary" onClick={() => startEdit(c)} style={{ padding: '4px 10px', fontSize: 12, marginRight: 6 }}>Editar</button>
                    <button onClick={() => setConfirmDelete(c)}
                      style={{ padding: '4px 10px', fontSize: 12, borderRadius: 4, border: '1px solid #e55', background: '#fff', color: '#c33', cursor: 'pointer' }}>Eliminar</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {confirmDelete && (
        <ConfirmDialog
          title="Eliminar cliente"
          message={`¿Eliminar a ${confirmDelete.name}? Los contratos ya creados no se borran.`}
          confirmLabel="Eliminar"
          danger
          onConfirm={async () => {
            try {
              await deleteSalesClient(confirmDelete.id);
              showToast('Cliente eliminado', 'success');
              setConfirmDelete(null);
              load();
            } catch (err: any) {
              showToast(err?.response?.data?.message || 'No se pudo eliminar', 'error');
            }
          }}
          onCancel={() => setConfirmDelete(null)}
        />
      )}
    </div>
  );
}

function Field({ label, value, onChange, type = 'text' }: { label: string; value: string; onChange: (v: string) => void; type?: string }) {
  return (
    <div>
      <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#888', marginBottom: 2 }}>{label}</label>
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)}
        style={{ width: '100%', padding: '6px 8px', borderRadius: 4, border: '1px solid #ddd', fontSize: 12, boxSizing: 'border-box' }} />
    </div>
  );
}
