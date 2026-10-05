import { useEffect, useState, useCallback, type ReactNode } from 'react';
import {
  X, StickyNote, Phone, Users, Mail, Tag, ArrowRight, FileText, UserPlus, Pencil, Trash2, Check,
} from 'lucide-react';
import ConfirmDialog from '../common/ConfirmDialog';
import { useToast } from '../../contexts/ToastContext';
import { getUser } from '../../services/auth.service';
import {
  getSalesClientTimeline,
  addSalesClientActivity,
  updateSalesClientActivity,
  deleteSalesClientActivity,
  SALES_ACTIVITY_TYPES,
  SalesClient,
  SalesClientField,
  SalesActivityType,
  TimelineEvent,
  SERVICIO_KEY,
  FUENTE_KEY,
  salesClientListaSubopcionesLabel,
} from '../../services/ventas.service';

interface Props {
  client: SalesClient;
  // Campos de la empresa: sirven para mostrar el label actual del servicio y
  // de los sub-servicios (en extra solo se guardan las keys).
  fields: SalesClientField[];
  onClose: () => void;
  // Abre el cuadro de "siguiente paso" de la página de Clientes.
  onEditNextStep: (client: SalesClient) => void;
}

const ACTIVITY_ICON: Record<SalesActivityType, typeof StickyNote> = {
  NOTA: StickyNote,
  LLAMADA: Phone,
  REUNION: Users,
  CORREO: Mail,
  OTRO: Tag,
};

const labelStyle = { display: 'block', fontSize: 11, fontWeight: 600, color: '#888', marginBottom: 2 };
const inputStyle = {
  width: '100%', padding: '6px 8px', borderRadius: 4, border: '1px solid #ddd',
  fontSize: 13, boxSizing: 'border-box' as const, fontFamily: 'inherit',
};

const formatCuando = (iso: string) =>
  new Date(iso).toLocaleString('es-EC', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

function Etapa({ info }: { info: { label: string; color: string } | null }) {
  const color = info?.color || '#718096';
  return (
    <span className="status-badge" style={{ backgroundColor: color + '22', color, whiteSpace: 'nowrap' }}>
      {info?.label || 'Sin etapa'}
    </span>
  );
}

// Ficha del cliente: datos de contacto, siguiente paso y línea de tiempo
// (creación, cambios de etapa, notas/llamadas/reuniones y contratos).
export default function ClienteFichaPanel({ client, fields, onClose, onEditNextStep }: Props) {
  const fuenteField = fields.find((f) => f.key === FUENTE_KEY);
  const servicioField = fields.find((f) => f.key === SERVICIO_KEY);
  const { showToast } = useToast();
  const currentUser = getUser();
  const [eventos, setEventos] = useState<TimelineEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  const [type, setType] = useState<SalesActivityType>('NOTA');
  const [otherLabel, setOtherLabel] = useState('');
  const [text, setText] = useState('');
  const [saving, setSaving] = useState(false);

  const [editingId, setEditingId] = useState<number | null>(null);
  const [editText, setEditText] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null);

  const cargar = useCallback(async () => {
    setLoadError(false);
    try {
      setEventos(await getSalesClientTimeline(client.id));
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [client.id]);

  // Se recarga también cuando cambian la etapa o el siguiente paso desde la
  // tabla con la ficha abierta.
  useEffect(() => {
    cargar();
  }, [cargar, client.status, client.nextActionText, client.nextActionDate]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !confirmDelete) onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose, confirmDelete]);

  const agregar = async () => {
    if (!text.trim()) return;
    if (type === 'OTRO' && !otherLabel.trim()) {
      showToast('Escribe cómo quieres llamar a esta actividad.', 'error');
      return;
    }
    setSaving(true);
    try {
      await addSalesClientActivity(client.id, { type, text, ...(type === 'OTRO' ? { otherLabel } : {}) });
      setText('');
      setOtherLabel('');
      setType('NOTA');
      await cargar();
    } catch (err: any) {
      showToast(err?.response?.data?.message || 'No se pudo guardar la actividad.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const guardarEdicion = async (activityId: number) => {
    if (!editText.trim()) return;
    try {
      await updateSalesClientActivity(activityId, { text: editText });
      setEditingId(null);
      await cargar();
    } catch (err: any) {
      showToast(err?.response?.data?.message || 'No se pudo guardar el cambio.', 'error');
    }
  };

  const borrar = async () => {
    if (confirmDelete === null) return;
    try {
      await deleteSalesClientActivity(confirmDelete);
      setConfirmDelete(null);
      await cargar();
    } catch (err: any) {
      showToast(err?.response?.data?.message || 'No se pudo borrar la actividad.', 'error');
      setConfirmDelete(null);
    }
  };

  const puedeEditar = (authorId: number | null) =>
    !!currentUser && (authorId === currentUser.id || currentUser.role === 'ADMIN');

  const dia = client.nextActionDate ? client.nextActionDate.slice(0, 10) : null;

  const dato = (label: string, value?: string | null) =>
    value ? (
      <div>
        <span style={labelStyle}>{label}</span>
        <span style={{ fontSize: 13, color: '#2d3748' }}>{value}</span>
      </div>
    ) : null;

  const renderEvento = (ev: TimelineEvent) => {
    let icono = <UserPlus size={14} />;
    let color = '#718096';
    let contenido: ReactNode = null;

    if (ev.kind === 'creado') {
      contenido = (
        <>
          <strong>Cliente registrado</strong>
          {ev.referredByName && <> · referido por {ev.referredByName}</>}
        </>
      );
    } else if (ev.kind === 'etapa') {
      icono = <ArrowRight size={14} />;
      color = ev.to?.color || '#718096';
      contenido = (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <strong>Cambió de etapa</strong>
            {ev.from && <Etapa info={ev.from} />}
            {ev.from && <ArrowRight size={13} color="#718096" />}
            <Etapa info={ev.to} />
          </div>
          {ev.notes && <div style={{ marginTop: 4, color: '#4a5568' }}>{ev.notes}</div>}
        </>
      );
    } else if (ev.kind === 'contrato') {
      icono = <FileText size={14} />;
      color = ev.step === 'firmado' ? '#276749' : '#2b6cb0';
      const nombre = ev.contractNumber || `#${ev.contractId}`;
      const paso = ev.step === 'creado' ? 'creado' : ev.step === 'enviado' ? 'enviado a firma' : 'firmado';
      contenido = (
        <>
          <strong>Contrato {nombre} {paso}</strong>
          {ev.templateName && <span style={{ color: '#718096' }}> · {ev.templateName}</span>}
        </>
      );
    } else {
      const Icono = ACTIVITY_ICON[ev.type] || StickyNote;
      icono = <Icono size={14} />;
      color = '#4a5568';
      const nombreTipo = ev.type === 'OTRO' ? ev.otherLabel || 'Otro' : SALES_ACTIVITY_TYPES.find((t) => t.value === ev.type)?.label;
      contenido = editingId === ev.activityId ? (
        <div>
          <textarea
            value={editText}
            onChange={(e) => setEditText(e.target.value)}
            rows={3}
            maxLength={2000}
            style={{ ...inputStyle, resize: 'vertical' }}
            autoFocus
          />
          <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
            <button type="button" className="btn-secondary" onClick={() => setEditingId(null)} style={{ padding: '5px 12px', fontSize: 12 }}>
              Cancelar
            </button>
            <button type="button" className="auth-btn" onClick={() => guardarEdicion(ev.activityId)} style={{ padding: '5px 12px', fontSize: 12 }}>
              Guardar
            </button>
          </div>
        </div>
      ) : (
        <>
          <strong>{nombreTipo}</strong>
          {ev.edited && <span style={{ color: '#a0aec0', fontSize: 11 }}> (editada)</span>}
          <div style={{ marginTop: 2, color: '#2d3748', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{ev.text}</div>
        </>
      );
    }

    const autor = ev.authorName;
    return (
      <li key={ev.id} style={{ display: 'flex', gap: 10, padding: '10px 0', borderBottom: '1px solid #edf2f7' }}>
        <span style={{
          flex: '0 0 auto', width: 26, height: 26, borderRadius: '50%', background: color + '1a', color,
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        }}>
          {icono}
        </span>
        <div style={{ flex: 1, minWidth: 0, fontSize: 13, lineHeight: 1.45 }}>
          {contenido}
          <div style={{ marginTop: 3, fontSize: 11.5, color: '#a0aec0', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span>{formatCuando(ev.at)}{autor ? ` · ${autor}` : ''}</span>
            {ev.kind === 'actividad' && editingId !== ev.activityId && puedeEditar(ev.authorId) && (
              <>
                <button type="button" onClick={() => { setEditingId(ev.activityId); setEditText(ev.text); }} title="Editar"
                  style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: '#718096', display: 'inline-flex' }}>
                  <Pencil size={12} />
                </button>
                <button type="button" onClick={() => setConfirmDelete(ev.activityId)} title="Borrar"
                  style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: '#c53030', display: 'inline-flex' }}>
                  <Trash2 size={12} />
                </button>
              </>
            )}
          </div>
        </div>
      </li>
    );
  };

  return (
    <>
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', zIndex: 1000, display: 'flex', justifyContent: 'flex-end' }}
      onClick={onClose}
    >
      <aside
        role="dialog"
        aria-label={`Ficha de ${client.name}`}
        onClick={(e) => e.stopPropagation()}
        style={{ width: 'min(480px, 100vw)', height: '100%', background: '#fff', boxShadow: '-8px 0 30px rgba(0,0,0,0.15)', display: 'flex', flexDirection: 'column' }}
      >
        <div style={{ padding: '18px 22px', borderBottom: '1px solid #edf2f7', display: 'flex', alignItems: 'flex-start', gap: 10 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ margin: 0, fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', color: '#a0aec0', textTransform: 'uppercase' }}>Ficha del cliente</p>
            <h2 style={{ margin: '2px 0 0', fontSize: '1.25rem', wordBreak: 'break-word' }}>{client.name}</h2>
          </div>
          <button type="button" onClick={onClose} title="Cerrar" aria-label="Cerrar"
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#718096', padding: 4, display: 'inline-flex' }}>
            <X size={20} />
          </button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 22px 24px' }}>
          {/* Datos */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 16px', marginBottom: 14 }}>
            <div>
              <span style={labelStyle}>Etapa</span>
              <Etapa info={client.stage ? { label: client.stage.label, color: client.stage.color } : null} />
            </div>
            {dato('Responsable', client.assignedUser?.fullName || 'Sin asignar')}
            {dato('Teléfono', client.phone)}
            {dato('Correo', client.email)}
            {dato('RUC', client.ruc)}
            {dato('Dirección', client.address)}
            {fuenteField && dato(fuenteField.label, salesClientListaSubopcionesLabel(client, fuenteField))}
            {servicioField && dato(servicioField.label, salesClientListaSubopcionesLabel(client, servicioField))}
            {dato('Referido por', client.referredBy?.fullName)}
          </div>

          {/* Siguiente paso */}
          <div style={{ background: '#f7fafc', border: '1px solid #edf2f7', borderRadius: 10, padding: '10px 12px', marginBottom: 18, display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <span style={labelStyle}>Siguiente paso</span>
              <span style={{ fontSize: 13, color: client.nextActionText ? '#2d3748' : '#a0aec0' }}>
                {client.nextActionText || 'Sin definir'}
              </span>
              {dia && <span style={{ fontSize: 12, color: '#718096' }}> · {dia.split('-').reverse().join('/')}</span>}
            </div>
            <button type="button" className="btn-secondary" onClick={() => onEditNextStep(client)} style={{ padding: '6px 12px', fontSize: 12.5, whiteSpace: 'nowrap' }}>
              Editar
            </button>
          </div>

          {/* Agregar actividad */}
          <h3 style={{ fontSize: '0.95rem', margin: '0 0 8px' }}>Agregar a la línea de tiempo</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 }}>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <div style={{ flex: '0 0 auto' }}>
                <label style={labelStyle}>Tipo</label>
                <select value={type} onChange={(e) => setType(e.target.value as SalesActivityType)} style={{ ...inputStyle, width: 'auto' }}>
                  {SALES_ACTIVITY_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>
              {type === 'OTRO' && (
                <div style={{ flex: '1 1 140px', minWidth: 0 }}>
                  <label style={labelStyle}>¿Cuál?</label>
                  <input value={otherLabel} onChange={(e) => setOtherLabel(e.target.value)} maxLength={40} placeholder="Ej: Visita a la obra" style={inputStyle} />
                </div>
              )}
            </div>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={3}
              maxLength={2000}
              placeholder="¿Qué pasó? Ej: Llamé, pidió cotización para 10 guardias."
              style={{ ...inputStyle, resize: 'vertical' }}
            />
            <div>
              <button type="button" className="auth-btn" onClick={agregar} disabled={saving || !text.trim()}
                style={{ padding: '8px 18px', fontSize: '0.9rem', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <Check size={15} /> Agregar
              </button>
            </div>
          </div>

          {/* Línea de tiempo */}
          <h3 style={{ fontSize: '0.95rem', margin: '0 0 4px' }}>Historial</h3>
          {loading ? (
            <p style={{ color: '#888', fontSize: 13 }}>Cargando...</p>
          ) : loadError ? (
            <p style={{ color: '#718096', fontSize: 13 }}>
              No se pudo cargar el historial.{' '}
              <button type="button" onClick={() => { setLoading(true); cargar(); }}
                style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: '#2b6cb0', textDecoration: 'underline', font: 'inherit' }}>
                Reintentar
              </button>
            </p>
          ) : (
            <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>{eventos.map(renderEvento)}</ul>
          )}
        </div>
      </aside>
    </div>

    {/* Fuera del fondo del panel: un clic en el cuadro de confirmar no debe cerrar la ficha. */}
    {confirmDelete !== null && (
      <ConfirmDialog
        title="Borrar actividad"
        message="¿Borrar esta actividad de la línea de tiempo? No se puede deshacer."
        confirmLabel="Borrar"
        danger
        onConfirm={borrar}
        onCancel={() => setConfirmDelete(null)}
      />
    )}
    </>
  );
}
