import { useState } from 'react';
import { X } from 'lucide-react';
import {
  createSalesClient,
  updateSalesClient,
  SalesClient,
  SalesClientField,
} from '../../services/ventas.service';
import { useToast } from '../../contexts/ToastContext';
import DateInput from '../common/DateInput';

interface Props {
  client: SalesClient | null;
  extraFields: SalesClientField[];
  onClose: () => void;
  onSaved: () => void;
}

const emptyForm = { name: '', email: '', phone: '', ruc: '', address: '', observaciones: '', extra: {} as Record<string, string> };

export default function ClienteFormModal({ client, extraFields, onClose, onSaved }: Props) {
  const { showToast } = useToast();
  const [form, setForm] = useState(() => client ? {
    name: client.name,
    email: client.email,
    phone: client.phone || '',
    ruc: client.ruc || '',
    address: client.address || '',
    observaciones: client.observaciones || '',
    extra: { ...(client.extra || {}) },
  } : emptyForm);
  const [saving, setSaving] = useState(false);

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
        observaciones: form.observaciones.trim() || undefined,
        extra: form.extra,
      };
      if (client) await updateSalesClient(client.id, payload);
      else await createSalesClient(payload);
      showToast(client ? 'Cliente actualizado' : 'Cliente creado', 'success');
      onSaved();
    } catch (err: any) {
      showToast(err?.response?.data?.message || 'No se pudo guardar', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>{client ? 'Editar cliente' : 'Nuevo cliente'}</h3>
          <button className="modal-close" onClick={onClose}>
            <X size={16} />
          </button>
        </div>
        <div className="modal-body">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Field label="Nombre / Razón social *" value={form.name} onChange={(v) => setForm({ ...form, name: v })} />
            <Field label="Email *" value={form.email} onChange={(v) => setForm({ ...form, email: v })} type="email" />
            <Field label="Teléfono" value={form.phone} onChange={(v) => setForm({ ...form, phone: v })} />
            <Field label="Cédula / RUC" value={form.ruc} onChange={(v) => setForm({ ...form, ruc: v })} />
            <div style={{ gridColumn: '1 / -1' }}>
              <Field label="Dirección" value={form.address} onChange={(v) => setForm({ ...form, address: v })} />
            </div>
            {extraFields.map((f) => (
              <ExtraField key={f.key} field={f} value={form.extra[f.key] || ''}
                onChange={(v) => setForm({ ...form, extra: { ...form.extra, [f.key]: v } })} />
            ))}
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#888', marginBottom: 2 }}>Observaciones</label>
              <textarea
                value={form.observaciones}
                onChange={(e) => setForm({ ...form, observaciones: e.target.value })}
                rows={3}
                placeholder="Origen del cliente, notas de seguimiento, etc."
                style={{ width: '100%', padding: '6px 8px', borderRadius: 4, border: '1px solid #ddd', fontSize: 12, boxSizing: 'border-box', resize: 'vertical' }}
              />
            </div>
          </div>
        </div>
        <div className="modal-actions">
          <button className="btn-secondary" onClick={onClose}>Cancelar</button>
          <button className="auth-btn" onClick={handleSave} disabled={saving}>
            {saving ? 'Guardando...' : 'Guardar'}
          </button>
        </div>
      </div>
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

function ExtraField({ field, value, onChange }: { field: SalesClientField; value: string; onChange: (v: string) => void }) {
  const inputStyle = { padding: '6px 8px', borderRadius: 4, border: '1px solid #ddd', fontSize: 12 };
  return (
    <div>
      <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#888', marginBottom: 2 }}>{field.label}</label>
      {field.fieldType === 'DATE' ? (
        <DateInput value={value} onChange={onChange} style={inputStyle} />
      ) : field.fieldType === 'BOOLEAN' ? (
        <select value={value || 'false'} onChange={(e) => onChange(e.target.value)}
          style={{ ...inputStyle, width: '100%', boxSizing: 'border-box' }}>
          <option value="false">No</option>
          <option value="true">Sí</option>
        </select>
      ) : (
        <input type={field.fieldType === 'NUMBER' ? 'number' : 'text'} value={value} onChange={(e) => onChange(e.target.value)}
          style={{ ...inputStyle, width: '100%', boxSizing: 'border-box' }} />
      )}
    </div>
  );
}
