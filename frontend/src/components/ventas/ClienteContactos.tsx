import { useEffect, useState } from 'react';
import { Plus, Trash2, Pencil, X, Check, Phone, Mail, User } from 'lucide-react';
import { useToast } from '../../contexts/ToastContext';
import ConfirmDialog from '../common/ConfirmDialog';
import {
  getSalesContacts,
  createSalesContact,
  updateSalesContact,
  deleteSalesContact,
  type SalesContact,
  type SalesContactValue,
} from '../../services/ventas.service';

interface Props {
  clientId: number;
}

const ETIQUETAS = ['WHATSAPP', 'CASA', 'TRABAJO', 'OTRO'];

const labelStyle = { display: 'block', fontSize: 11, fontWeight: 600, color: '#888', marginBottom: 2 };
const inputStyle = {
  padding: '6px 8px', borderRadius: 4, border: '1px solid #ddd',
  fontSize: 13, boxSizing: 'border-box' as const, fontFamily: 'inherit',
};

interface FormState {
  name: string;
  role: string;
  phones: SalesContactValue[];
  emails: SalesContactValue[];
  notes: string;
}

const formVacio: FormState = { name: '', role: '', phones: [], emails: [], notes: '' };

// Una lista de { label, value } con fila "+ agregar" — mismo editor para
// teléfonos y correos del contacto.
function ListaValores({
  valores,
  onChange,
  placeholder,
}: {
  valores: SalesContactValue[];
  onChange: (v: SalesContactValue[]) => void;
  placeholder: string;
}) {
  const actualizar = (i: number, campo: 'label' | 'value', v: string) => {
    const copia = valores.map((x, idx) => (idx === i ? { ...x, [campo]: v } : x));
    onChange(copia);
  };
  const quitar = (i: number) => onChange(valores.filter((_, idx) => idx !== i));
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {valores.map((v, i) => (
        <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <select value={v.label} onChange={(e) => actualizar(i, 'label', e.target.value)} style={{ ...inputStyle, width: 110 }}>
            {ETIQUETAS.map((et) => <option key={et} value={et}>{et}</option>)}
          </select>
          <input value={v.value} onChange={(e) => actualizar(i, 'value', e.target.value)} placeholder={placeholder} style={{ ...inputStyle, flex: 1 }} />
          <button type="button" onClick={() => quitar(i)} title="Quitar"
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#c53030', display: 'inline-flex' }}>
            <Trash2 size={14} />
          </button>
        </div>
      ))}
      <button type="button" onClick={() => onChange([...valores, { label: 'OTRO', value: '' }])}
        style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#2b6cb0', fontSize: 12.5, padding: 0, display: 'inline-flex', alignItems: 'center', gap: 4, alignSelf: 'flex-start' }}>
        <Plus size={13} /> Agregar {placeholder.toLowerCase()}
      </button>
    </div>
  );
}

export default function ClienteContactos({ clientId }: Props) {
  const { showToast } = useToast();
  const [contactos, setContactos] = useState<SalesContact[] | null>(null);
  const [error, setError] = useState(false);
  const [nuevo, setNuevo] = useState(false);
  const [editandoId, setEditandoId] = useState<number | null>(null);
  const [form, setForm] = useState<FormState>(formVacio);
  const [guardando, setGuardando] = useState(false);
  const [borrarId, setBorrarId] = useState<number | null>(null);

  const cargar = () => {
    setError(false);
    getSalesContacts(clientId)
      .then(setContactos)
      .catch(() => { setContactos([]); setError(true); });
  };

  useEffect(cargar, [clientId]);

  const empezarNuevo = () => {
    setForm(formVacio);
    setEditandoId(null);
    setNuevo(true);
  };

  const empezarEditar = (c: SalesContact) => {
    setForm({ name: c.name, role: c.role || '', phones: c.phones, emails: c.emails, notes: c.notes || '' });
    setEditandoId(c.id);
    setNuevo(true);
  };

  const cancelar = () => { setNuevo(false); setEditandoId(null); };

  const guardar = async () => {
    if (!form.name.trim()) { showToast('Falta el nombre del contacto', 'error'); return; }
    setGuardando(true);
    try {
      const payload = {
        name: form.name.trim(),
        role: form.role.trim() || undefined,
        phones: form.phones.filter((p) => p.value.trim()),
        emails: form.emails.filter((e) => e.value.trim()),
        notes: form.notes.trim() || undefined,
      };
      if (editandoId) await updateSalesContact(editandoId, payload);
      else await createSalesContact(clientId, payload);
      showToast(editandoId ? 'Contacto actualizado' : 'Contacto agregado', 'success');
      cancelar();
      cargar();
    } catch (err: any) {
      showToast(err?.response?.data?.message || 'No se pudo guardar el contacto', 'error');
    } finally {
      setGuardando(false);
    }
  };

  const borrar = async () => {
    if (borrarId === null) return;
    try {
      await deleteSalesContact(borrarId);
      setBorrarId(null);
      cargar();
    } catch (err: any) {
      showToast(err?.response?.data?.message || 'No se pudo borrar el contacto', 'error');
      setBorrarId(null);
    }
  };

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <h3 style={{ fontSize: '0.95rem', margin: 0, flex: 1 }}>Personas de contacto</h3>
        {!nuevo && (
          <button type="button" className="btn-secondary" onClick={empezarNuevo}
            style={{ padding: '5px 12px', fontSize: 12.5, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <Plus size={14} /> Agregar
          </button>
        )}
      </div>
      <p style={{ fontSize: 12, color: '#718096', margin: '0 0 12px' }}>
        Varias personas pueden escribir por esta misma empresa — cada una con sus propios teléfonos y correos. Al pasar un posible cliente a oportunidad, se reconoce automáticamente a quien ya está aquí.
      </p>

      {nuevo && (
        <div style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: 12, marginBottom: 14, background: '#f7fafc' }}>
          <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>Nombre *</label>
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} maxLength={150} style={{ ...inputStyle, width: '100%' }} placeholder="Ej: Juan Pérez" />
            </div>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>Cargo (opcional)</label>
              <input value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} maxLength={100} style={{ ...inputStyle, width: '100%' }} placeholder="Ej: Jefe de Seguridad" />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 8 }}>
            <div style={{ flex: '1 1 220px' }}>
              <label style={labelStyle}>Teléfonos</label>
              <ListaValores valores={form.phones} onChange={(v) => setForm({ ...form, phones: v })} placeholder="Teléfono" />
            </div>
            <div style={{ flex: '1 1 220px' }}>
              <label style={labelStyle}>Correos</label>
              <ListaValores valores={form.emails} onChange={(v) => setForm({ ...form, emails: v })} placeholder="Correo" />
            </div>
          </div>
          <div style={{ marginBottom: 10 }}>
            <label style={labelStyle}>Notas (opcional)</label>
            <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} maxLength={500} style={{ ...inputStyle, width: '100%', resize: 'vertical' }} />
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" className="btn-secondary" onClick={cancelar} disabled={guardando} style={{ padding: '6px 14px', fontSize: 12.5 }}>
              <X size={13} /> Cancelar
            </button>
            <button type="button" className="auth-btn" onClick={guardar} disabled={guardando} style={{ padding: '6px 14px', fontSize: 12.5, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <Check size={13} /> {guardando ? 'Guardando...' : 'Guardar'}
            </button>
          </div>
        </div>
      )}

      {contactos === null ? (
        <p style={{ color: '#888', fontSize: 13 }}>Cargando...</p>
      ) : error ? (
        <p style={{ color: '#718096', fontSize: 13 }}>No se pudieron cargar los contactos.</p>
      ) : contactos.length === 0 ? (
        <p style={{ color: '#a0aec0', fontSize: 13 }}>Todavía no hay contactos registrados.</p>
      ) : (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {contactos.map((c) => (
            <li key={c.id} style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: '10px 12px' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                <span style={{ flex: '0 0 auto', width: 26, height: 26, borderRadius: '50%', background: '#2b6cb01a', color: '#2b6cb0', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                  <User size={14} />
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <strong style={{ fontSize: 13.5 }}>{c.name}</strong>
                  {c.role && <span style={{ color: '#718096', fontSize: 12.5 }}> · {c.role}</span>}
                  {(c.phones.length > 0 || c.emails.length > 0) && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 4 }}>
                      {c.phones.map((p, i) => (
                        <span key={`p${i}`} style={{ fontSize: 12, color: '#4a5568', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                          <Phone size={11} /> {p.value} <span style={{ color: '#a0aec0' }}>({p.label})</span>
                        </span>
                      ))}
                      {c.emails.map((e, i) => (
                        <span key={`e${i}`} style={{ fontSize: 12, color: '#4a5568', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                          <Mail size={11} /> {e.value} <span style={{ color: '#a0aec0' }}>({e.label})</span>
                        </span>
                      ))}
                    </div>
                  )}
                  {c.notes && <div style={{ fontSize: 12, color: '#718096', marginTop: 4 }}>{c.notes}</div>}
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button type="button" onClick={() => empezarEditar(c)} title="Editar"
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#718096', display: 'inline-flex' }}>
                    <Pencil size={13} />
                  </button>
                  <button type="button" onClick={() => setBorrarId(c.id)} title="Borrar"
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#c53030', display: 'inline-flex' }}>
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      {borrarId !== null && (
        <ConfirmDialog
          title="Borrar contacto"
          message="¿Borrar esta persona de contacto? No se puede deshacer."
          confirmLabel="Borrar"
          danger
          onConfirm={borrar}
          onCancel={() => setBorrarId(null)}
        />
      )}
    </div>
  );
}
