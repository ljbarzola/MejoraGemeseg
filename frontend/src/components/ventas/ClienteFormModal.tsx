import { useState, type CSSProperties } from 'react';
import { X } from 'lucide-react';
import {
  createSalesClient,
  updateSalesClient,
  SalesClient,
  SalesClientField,
  SERVICIO_KEY,
  SUBSERVICIOS_KEY,
  subserviciosDe,
} from '../../services/ventas.service';
import { useToast } from '../../contexts/ToastContext';
import DateInput from '../common/DateInput';
import SubserviciosCheckboxes from '../common/SubserviciosCheckboxes';

interface Props {
  client: SalesClient | null;
  // Todos los campos de la empresa, incluidos los núcleo (antes solo se
  // pasaban los no-núcleo, lo que dejaba "Fuente"/"Servicio requerido" sin
  // poder editarse desde este formulario — ver hallazgo en el plan).
  fields: SalesClientField[];
  onClose: () => void;
  onSaved: () => void;
}

// Únicos campos núcleo que viven como columna propia de SalesClient en vez
// de en `extra` — todo lo demás (fuente, servicio_requerido, cualquier
// campo que Ventas agregue) se guarda en `extra`.
const NATIVE_KEYS = ['email', 'phone', 'ruc', 'address', 'observaciones'];

// 'YYYY-MM-DD' en hora local (el usuario está en Ecuador), no en UTC.
const aDiaLocal = (d: Date) => d.toLocaleDateString('en-CA');

export default function ClienteFormModal({ client, fields, onClose, onSaved }: Props) {
  const { showToast } = useToast();
  const otherFields = fields.filter((f) => f.key !== 'name').sort((a, b) => a.order - b.order);
  const servicioField = fields.find((f) => f.key === SERVICIO_KEY);
  const hoy = aDiaLocal(new Date());

  const [name, setName] = useState(client?.name || '');
  // Fecha de ingreso editable: permite registrar prospectos de meses anteriores.
  const [fechaIngreso, setFechaIngreso] = useState(client ? aDiaLocal(new Date(client.createdAt)) : hoy);
  const [values, setValues] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = { ...(client?.extra || {}) };
    for (const key of NATIVE_KEYS) {
      const nativeValue = client ? (client as unknown as Record<string, string | null>)[key] : null;
      initial[key] = nativeValue || initial[key] || '';
    }
    return initial;
  });
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!name.trim()) {
      showToast('El nombre es requerido', 'error');
      return;
    }
    if (!fechaIngreso) {
      showToast('La fecha de ingreso es requerida', 'error');
      return;
    }
    if (fechaIngreso > hoy) {
      showToast('La fecha de ingreso no puede ser futura', 'error');
      return;
    }
    setSaving(true);
    try {
      const extra: Record<string, string> = {};
      const payload: any = { name: name.trim(), fechaIngreso };
      for (const field of otherFields) {
        const value = (values[field.key] || '').trim();
        if (NATIVE_KEYS.includes(field.key)) {
          payload[field.key] = value || undefined;
        } else {
          extra[field.key] = values[field.key] || '';
        }
      }
      // Sub-servicios solo valen mientras el servicio elegido los tenga.
      if (subserviciosDe(servicioField?.options, values[SERVICIO_KEY] || '').length === 0) {
        extra[SUBSERVICIOS_KEY] = '';
      }
      payload.extra = extra;
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
            <div style={{ gridColumn: '1 / -1' }}>
              <Field label="Nombre / Razón social *" value={name} onChange={setName} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#888', marginBottom: 2 }}>Fecha de ingreso *</label>
              <DateInput value={fechaIngreso} onChange={setFechaIngreso} max={hoy}
                style={{ padding: '6px 8px', borderRadius: 4, border: '1px solid #ddd', fontSize: 12 }} />
            </div>
            {otherFields.map((f) => {
              if (f.fieldType === 'SUBSERVICIOS') {
                // Solo aparece cuando el servicio elegido tiene sub-servicios.
                const opciones = subserviciosDe(servicioField?.options, values[SERVICIO_KEY] || '');
                if (opciones.length === 0) return null;
                return (
                  <div key={f.key} style={{ gridColumn: '1 / -1' }}>
                    <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#888', marginBottom: 2 }}>
                      {f.label} <span style={{ fontWeight: 400 }}>(opcional)</span>
                    </label>
                    <SubserviciosCheckboxes
                      options={opciones}
                      value={values[f.key] || ''}
                      onChange={(v) => setValues({ ...values, [f.key]: v })}
                    />
                  </div>
                );
              }
              return (
                <div key={f.key} style={f.fieldType === 'TEXTAREA' ? { gridColumn: '1 / -1' } : undefined}>
                  <ExtraField
                    field={f}
                    value={values[f.key] || ''}
                    // Cambiar de servicio limpia los sub-servicios: ya no aplican.
                    onChange={(v) =>
                      setValues(
                        f.key === SERVICIO_KEY
                          ? { ...values, [f.key]: v, [SUBSERVICIOS_KEY]: '' }
                          : { ...values, [f.key]: v },
                      )
                    }
                  />
                </div>
              );
            })}
            {/* Solo lectura: el vínculo lo crea el flujo "Referir un cliente", no este formulario. */}
            {client?.referredBy && (
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#888', marginBottom: 2 }}>Referido por</label>
                <div style={{ padding: '6px 8px', borderRadius: 4, border: '1px solid #e2e8f0', background: '#f7fafc', fontSize: 12, color: '#2d3748' }}>
                  {client.referredBy.fullName}
                </div>
              </div>
            )}
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

// Sentinel para la opción "Otro" — nunca se guarda tal cual, ver SelectWithOther.
const OTHER_SENTINEL = '__OTHER__';

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
      ) : field.fieldType === 'SELECT' ? (
        <SelectWithOther field={field} value={value} onChange={onChange} inputStyle={inputStyle} />
      ) : field.fieldType === 'TEXTAREA' ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={3}
          style={{ ...inputStyle, width: '100%', boxSizing: 'border-box', resize: 'vertical' }}
        />
      ) : (
        <input type={field.fieldType === 'NUMBER' ? 'number' : 'text'} value={value} onChange={(e) => onChange(e.target.value)}
          style={{ ...inputStyle, width: '100%', boxSizing: 'border-box' }} />
      )}
    </div>
  );
}

// Mismo patrón que el Select de ContratoForm.tsx para campos DROPDOWN con
// allowOther: se agrega una opción sentinel "Otro (especifique)" que cambia
// a un <input> de texto libre. El valor se guarda literal (sin prefijo ni
// key especial) — por eso "es Otro" se infiere del valor actual cuando no
// calza con ninguna opción conocida, no de un flag aparte.
function SelectWithOther({
  field,
  value,
  onChange,
  inputStyle,
}: {
  field: SalesClientField;
  value: string;
  onChange: (v: string) => void;
  inputStyle: CSSProperties;
}) {
  const [forceOther, setForceOther] = useState(false);
  const options = field.options || [];
  const isKnownOption = !value || options.some((o) => o.key === value);
  const isOther = field.allowOther && (forceOther || (!!value && !isKnownOption));

  if (isOther) {
    return (
      <div style={{ display: 'flex', gap: 6 }}>
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Especifica..."
          style={{ ...inputStyle, flex: 1, boxSizing: 'border-box' }}
        />
        <button type="button" className="btn-secondary" style={{ padding: '4px 8px', fontSize: 11, whiteSpace: 'nowrap' }}
          onClick={() => { setForceOther(false); onChange(''); }}>
          Elegir de lista
        </button>
      </div>
    );
  }

  return (
    <select
      value={value}
      onChange={(e) => {
        if (e.target.value === OTHER_SENTINEL) { setForceOther(true); onChange(''); }
        else onChange(e.target.value);
      }}
      style={{ ...inputStyle, width: '100%', boxSizing: 'border-box' }}
    >
      <option value="">— Sin definir —</option>
      {options.map((o) => (
        <option key={o.key} value={o.key}>{o.label}</option>
      ))}
      {field.allowOther && <option value={OTHER_SENTINEL}>Otro (especifique)</option>}
    </select>
  );
}
