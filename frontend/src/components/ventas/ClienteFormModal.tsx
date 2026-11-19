import { useState } from 'react';
import { X } from 'lucide-react';
import ErrorBanner from '../common/ErrorBanner';
import {
  createSalesClient,
  updateSalesClient,
  SalesClient,
  SalesClientField,
  SERVICIO_KEY,
  SUBSERVICIOS_KEY,
  LISTA_SUBOPCIONES,
  subopcionesKey,
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
  // Registrar a alguien que YA contrata con ustedes (se creó antes de usar el
  // sistema): queda como Cliente «Por contratar» en lugar de una negociación nueva.
  yaEsCliente?: boolean;
  // Directorio (2026-10-16): guardar solo los datos de la empresa o persona,
  // sin abrir una oportunidad (esa se crea en Posibles clientes u Oportunidades).
  soloDatos?: boolean;
  // Nombre con el que arranca el formulario (por ejemplo, lo que se estaba buscando al decidir crearlo).
  nombreInicial?: string;
  onClose: () => void;
  // Al CREAR devuelve la empresa o persona recién guardada (para quien necesita elegirla enseguida,
  // como Planificación y Campo); al editar no devuelve nada.
  onSaved: (creado?: SalesClient) => void;
}

// Con «solo datos» (Directorio y visitas) solo se piden el nombre y la fecha de ingreso; la fuente se
// ofrece a la vista y el resto queda en «Más datos (opcional)». Nadie siempre tiene a la mano la cédula,
// el teléfono o el correo. «Servicio requerido» NO se pide: es de la oportunidad, no de la empresa.
// «Tipo de negocio» y «Público / Privado» (2026-11-17) van a la vista: alimentan los filtros del Dashboard.
const CAMPOS_VISIBLES = ['tipo_negocio', 'sector', 'fuente'];

// Únicos campos núcleo que viven como columna propia de SalesClient en vez
// de en `extra` — todo lo demás (fuente, servicio_requerido, cualquier
// campo que Ventas agregue) se guarda en `extra`.
const NATIVE_KEYS = ['email', 'phone', 'ruc', 'address', 'observaciones'];

// 'YYYY-MM-DD' en hora local (el usuario está en Ecuador), no en UTC.
const aDiaLocal = (d: Date) => d.toLocaleDateString('en-CA');

export default function ClienteFormModal({ client, fields, yaEsCliente = false, soloDatos = false, nombreInicial = '', onClose, onSaved }: Props) {
  const { showToast } = useToast();
  // Alta de solo datos: sin «Servicio requerido» (ni sus subopciones). Al editar una ficha que ya lo
  // tiene sí se muestra, para no dejar un dato guardado sin poder corregirlo.
  const sinServicio = soloDatos && !client;
  const otherFields = fields
    .filter((f) => f.key !== 'name' && f.key !== SUBSERVICIOS_KEY && !(sinServicio && f.key === SERVICIO_KEY))
    .sort((a, b) => a.order - b.order);
  const camposVisibles = soloDatos && !client ? otherFields.filter((f) => CAMPOS_VISIBLES.includes(f.key)) : otherFields;
  const camposOpcionales = soloDatos && !client ? otherFields.filter((f) => !CAMPOS_VISIBLES.includes(f.key)) : [];
  const hoy = aDiaLocal(new Date());

  const [name, setName] = useState(client?.name || nombreInicial);
  // Fecha de ingreso editable: permite registrar prospectos de meses anteriores.
  const [fechaIngreso, setFechaIngreso] = useState(client ? aDiaLocal(new Date(client.createdAt)) : hoy);
  const [values, setValues] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = { ...(client?.extra || {}) };
    for (const key of NATIVE_KEYS) {
      const nativeValue = client ? (client as unknown as Record<string, string | null>)[key] : null;
      initial[key] = nativeValue || initial[key] || '';
    }
    const subServicio = subopcionesKey(SERVICIO_KEY);
    if (!initial[subServicio] && initial[SUBSERVICIOS_KEY]) {
      initial[subServicio] = initial[SUBSERVICIOS_KEY];
    }
    return initial;
  });
  const [saving, setSaving] = useState(false);
  // Mismo aviso que Nueva oportunidad: dentro de la ventana y traído a la vista (ErrorBanner).
  const [error, setError] = useState('');

  const handleSave = async () => {
    setError('');
    if (!name.trim()) return setError('Escribe el nombre o la razón social.');
    if (!fechaIngreso) return setError('Indica la fecha de ingreso.');
    if (fechaIngreso > hoy) return setError('La fecha de ingreso no puede ser futura.');
    setSaving(true);
    try {
      // Al editar se parte de lo que la ficha ya tiene: el servidor reemplaza `extra` completo, y lo que este
      // formulario no muestra (por ejemplo «Servicio requerido», oculto en el Directorio) se perdería.
      const extra: Record<string, string> = client ? { ...(client.extra || {}) } : {};
      const payload: any = { name: name.trim(), fechaIngreso };
      for (const field of otherFields) {
        const value = (values[field.key] || '').trim();
        if (NATIVE_KEYS.includes(field.key)) {
          // Al editar se manda el texto vacío para poder BORRAR un dato (el
          // servidor lo guarda como «sin dato»); al crear, lo vacío no se envía.
          payload[field.key] = client ? value : value || undefined;
        } else {
          extra[field.key] = values[field.key] || '';
        }
      }
      // Casillas de una lista con subopciones: van en extra[clave__sub], no en un campo aparte.
      for (const field of otherFields) {
        if (field.fieldType !== LISTA_SUBOPCIONES) continue;
        const subKey = subopcionesKey(field.key);
        const opciones = subserviciosDe(field.options, values[field.key] || '');
        extra[subKey] = opciones.length === 0 ? '' : (values[subKey] || '');
      }
      payload.extra = extra;
      let creado: (SalesClient & { posiblesDuplicados?: { id: number; name: string }[] }) | undefined;
      if (client) await updateSalesClient(client.id, payload);
      else if (soloDatos) creado = await createSalesClient({ ...payload, soloDatos: true });
      else creado = await createSalesClient(yaEsCliente ? { ...payload, yaEsCliente: true } : payload);
      // Una persona nueva en negociación la avisa quien abrió el formulario
      // (dice a dónde quedó); aquí solo la edición, el alta del Directorio y el
      // cliente que ya contrata.
      if (client) showToast('Datos actualizados', 'success');
      else if (soloDatos) showToast('Guardado en el directorio', 'success');
      else if (yaEsCliente) showToast('Registrado en el directorio: quedó «Por contratar»', 'success');
      // Aviso blando (Fase 2): nombre parecido a uno que ya existe — no bloquea.
      if (creado?.posiblesDuplicados?.length) {
        showToast(`Ojo: se parece a «${creado.posiblesDuplicados[0].name}», que ya está en el directorio`, 'info');
      }
      onSaved(creado);
    } catch (err: any) {
      const msg = err?.response?.data?.message;
      setError((Array.isArray(msg) ? msg[0] : msg) || 'No se pudo guardar. Intenta de nuevo.');
    } finally {
      setSaving(false);
    }
  };

  // Mismo formato que «Nueva oportunidad» (2026-11-19): `form-group` con sus etiquetas y campos, sin estilos sueltos.
  const renderCampo = (f: SalesClientField) => {
    if (f.fieldType === LISTA_SUBOPCIONES) {
      const subKey = subopcionesKey(f.key);
      const opciones = subserviciosDe(f.options, values[f.key] || '');
      return (
        <div key={f.key} className="form-group" style={opciones.length > 0 ? { gridColumn: '1 / -1' } : undefined}>
          <label>{f.label}</label>
          <SelectWithOther
            field={f}
            value={values[f.key] || ''}
            onChange={(v) => setValues({ ...values, [f.key]: v, [subKey]: '' })}
          />
          {opciones.length > 0 && (
            <div className="ficha-subopciones">
              <span>Subopciones (opcional)</span>
              <SubserviciosCheckboxes
                options={opciones}
                value={values[subKey] || ''}
                onChange={(v) => setValues({ ...values, [subKey]: v })}
              />
            </div>
          )}
        </div>
      );
    }
    return (
      <div key={f.key} className="form-group" style={f.fieldType === 'TEXTAREA' ? { gridColumn: '1 / -1' } : undefined}>
        <label>{f.label}</label>
        <ExtraField field={f} value={values[f.key] || ''} onChange={(v) => setValues({ ...values, [f.key]: v })} />
      </div>
    );
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className={`modal ${soloDatos && !client ? 'modal-ventas-sm' : 'modal-ventas-md'}`} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>{client ? 'Editar empresa o persona' : soloDatos ? 'Nueva empresa o persona' : yaEsCliente ? 'Nueva empresa o persona (ya contrata)' : 'Nueva empresa o persona en negociación'}</h3>
          <button className="modal-close" onClick={onClose} aria-label="Cerrar">
            <X size={16} />
          </button>
        </div>
        <div className="modal-body">
          <ErrorBanner mensaje={error} />
          {!client && yaEsCliente && (
            <div className="form-ayuda ficha-ayuda-aviso">
              <p>Queda como Cliente «Por contratar» hasta que cargues su contrato y no cuenta en las cifras de ventas nuevas.</p>
            </div>
          )}
          {!client && soloDatos && (
            <div className="form-ayuda">
              <p>
                Solo el <strong>nombre</strong> es obligatorio; el resto lo puedes completar después. La negociación se abre desde
                Posibles clientes o con <strong>+ Nueva oportunidad</strong> en Oportunidades.
              </p>
            </div>
          )}
          {!client && !yaEsCliente && !soloDatos && (
            <div className="form-ayuda">
              <p>Queda en Oportunidades como una negociación nueva y en el Directorio como prospecto hasta que acepte.</p>
            </div>
          )}
          <div className="ficha-grid">
            <div className="form-group" style={{ gridColumn: '1 / -1' }}>
              <label>Nombre / Razón social *</label>
              <input type="text" value={name} maxLength={200} autoFocus={!client}
                onChange={(e) => setName(e.target.value)} placeholder="Ej: Textiles del Valle S.A." />
            </div>
            <div className="form-group">
              <label>Fecha de ingreso *</label>
              <DateInput value={fechaIngreso} onChange={setFechaIngreso} max={hoy} />
            </div>
            {camposVisibles.map(renderCampo)}
            {camposOpcionales.length > 0 && (
              <details className="form-mas" style={{ gridColumn: '1 / -1' }}>
                <summary>Más datos (opcional): correo, teléfono, cédula / RUC, dirección…</summary>
                <div className="ficha-grid">
                  {camposOpcionales.map(renderCampo)}
                </div>
              </details>
            )}
            {/* Solo lectura: el vínculo lo crea el flujo "Referir un cliente", no este formulario. */}
            {client?.referredBy && (
              <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                <label>Referido por</label>
                <input type="text" value={client.referredBy.fullName} readOnly disabled />
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

// El control de un campo (sin etiqueta: la pone el `form-group` de arriba). Toma el estilo de los formularios.
function ExtraField({ field, value, onChange }: { field: SalesClientField; value: string; onChange: (v: string) => void }) {
  if (field.fieldType === 'DATE') return <DateInput value={value} onChange={onChange} />;
  if (field.fieldType === 'BOOLEAN') {
    return (
      <select value={value || 'false'} onChange={(e) => onChange(e.target.value)}>
        <option value="false">No</option>
        <option value="true">Sí</option>
      </select>
    );
  }
  if (field.fieldType === 'SELECT') return <SelectWithOther field={field} value={value} onChange={onChange} />;
  if (field.fieldType === 'TEXTAREA') {
    return <textarea className="form-textarea" rows={3} value={value} onChange={(e) => onChange(e.target.value)} />;
  }
  return (
    <input
      type={field.fieldType === 'NUMBER' ? 'number' : field.fieldType === 'EMAIL' ? 'email' : 'text'}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

// Sentinel para la opción "Otro" — nunca se guarda tal cual, ver SelectWithOther.
const OTHER_SENTINEL = '__OTHER__';

// Mismo patrón que el Select de ContratoForm.tsx para campos DROPDOWN con
// allowOther: se agrega una opción sentinel "Otro (especifique)" que cambia
// a un <input> de texto libre. El valor se guarda literal (sin prefijo ni
// key especial) — por eso "es Otro" se infiere del valor actual cuando no
// calza con ninguna opción conocida, no de un flag aparte. Si la lista ya
// trae su propio «Otro» (la fuente), no se repite.
function SelectWithOther({ field, value, onChange }: { field: SalesClientField; value: string; onChange: (v: string) => void }) {
  const [forceOther, setForceOther] = useState(false);
  const options = field.options || [];
  const isKnownOption = !value || options.some((o) => o.key === value);
  const isOther = field.allowOther && (forceOther || (!!value && !isKnownOption));
  const yaTraeOtro = options.some((o) => o.label.trim().toLowerCase() === 'otro');

  if (isOther) {
    return (
      <div style={{ display: 'flex', gap: 8, minWidth: 0 }}>
        <input type="text" value={value} onChange={(e) => onChange(e.target.value)} placeholder="Especifica..."
          style={{ flex: 1, minWidth: 0 }} />
        <button type="button" className="btn-secondary" title="Elegir de la lista"
          onClick={() => { setForceOther(false); onChange(''); }}>
          Lista
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
    >
      <option value="">Elegir...</option>
      {options.map((o) => (
        <option key={o.key} value={o.key}>{o.label}</option>
      ))}
      {field.allowOther && !yaTraeOtro && <option value={OTHER_SENTINEL}>Otro (especifique)</option>}
    </select>
  );
}
