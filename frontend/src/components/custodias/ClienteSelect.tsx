import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Plus, X } from 'lucide-react';
import { buscarClientesCustodia, crearClienteCustodia } from '../../services/custodia.service';
import type { ClienteDirectorio } from '../../types/custodiaGuia';
import FormModal from '../common/FormModal';

/** Mensaje corto para la persona: el servidor manda uno en español; si no, uno general. */
export function mensajeDeError(err: any, general: string): string {
  const m = err?.response?.data?.message;
  if (typeof m === 'string' && m.trim()) return m;
  if (Array.isArray(m) && typeof m[0] === 'string') return m.join(' ');
  return general;
}

/**
 * «Crear cliente» desde el formulario del viaje: lo da de alta en el Directorio de Ventas como «solo datos».
 * Se abre sobre otra ventana, así que Escape cierra solo ésta (igual que «Crear persona»).
 */
function NuevoClienteModal({
  nombreInicial, onClose, onCreado,
}: {
  nombreInicial: string;
  onClose: () => void;
  onCreado: (c: ClienteDirectorio) => void;
}) {
  const [form, setForm] = useState({ name: nombreInicial, ruc: '', email: '', phone: '' });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const alTeclear = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopImmediatePropagation();
      if (!saving) onClose();
    };
    window.addEventListener('keydown', alTeclear, true);
    return () => window.removeEventListener('keydown', alTeclear, true);
  }, [onClose, saving]);

  const cambiar = (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [e.target.name]: e.target.value }));

  async function guardar() {
    setError('');
    if (form.name.trim().length < 2) { setError('Escribe el nombre del cliente.'); return; }
    if (form.email.trim() && !/^\S+@\S+\.\S+$/.test(form.email.trim())) { setError('El correo no parece válido.'); return; }
    setSaving(true);
    try {
      const datos: { name: string; ruc?: string; email?: string; phone?: string } = { name: form.name.trim() };
      if (form.ruc.trim()) datos.ruc = form.ruc.trim();
      if (form.email.trim()) datos.email = form.email.trim();
      if (form.phone.trim()) datos.phone = form.phone.trim();
      const c = await crearClienteCustodia(datos);
      onCreado({ ...c, contactos: c.contactos ?? [] });
    } catch (err: any) {
      setError(mensajeDeError(err, 'No se pudo crear el cliente. Inténtalo de nuevo.'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <FormModal
      title="Crear cliente"
      descripcion="Se agrega al Directorio de Ventas como un cliente con solo sus datos, y queda elegido en el viaje."
      onClose={onClose}
      onSubmit={guardar}
      submitLabel="Crear y elegir"
      saving={saving}
      error={error}
      ancho={520}
    >
      <div className="form-group">
        <label>Nombre o razón social *</label>
        <input name="name" value={form.name} onChange={cambiar} maxLength={160} />
      </div>
      <div className="form-row">
        <div className="form-group">
          <label>RUC</label>
          <input name="ruc" value={form.ruc} onChange={cambiar} maxLength={20} placeholder="Opcional" />
        </div>
        <div className="form-group">
          <label>Teléfono</label>
          <input name="phone" value={form.phone} onChange={cambiar} maxLength={30} placeholder="Opcional" />
        </div>
      </div>
      <div className="form-group">
        <label>Correo</label>
        <input name="email" value={form.email} onChange={cambiar} maxLength={120} placeholder="Opcional" />
      </div>
    </FormModal>
  );
}

export interface ClienteElegido {
  id: number | null;
  /** Nombre del cliente. Con `id` null es el texto escrito a mano de un viaje anterior al Directorio. */
  nombre: string;
}

/**
 * Buscador de clientes del Directorio de Ventas para el viaje. Muestra el cliente elegido como una ficha con
 * «Cambiar» y «Quitar»; al buscar, lista hasta 20 coincidencias por nombre o RUC y, al pie, «Crear cliente».
 */
export default function ClienteSelect({
  value, onChange, soloLectura = false, permitirCrear = true,
}: {
  value: ClienteElegido;
  /** Entrega el cliente completo (con sus contactos) o null si se quitó. */
  onChange: (cliente: ClienteDirectorio | null) => void;
  soloLectura?: boolean;
  /** Ofrece «Crear cliente» al pie de la lista (no en la Configuración, donde solo se elige uno que ya existe). */
  permitirCrear?: boolean;
}) {
  const [texto, setTexto] = useState('');
  const [abierto, setAbierto] = useState(false);
  const [resultados, setResultados] = useState<ClienteDirectorio[]>([]);
  const [cargando, setCargando] = useState(false);
  const [falla, setFalla] = useState(false);
  const [creando, setCreando] = useState(false);
  const [cambiando, setCambiando] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const tieneCliente = !!value.nombre && !cambiando;

  // Busca con una pausa corta para no pedir al servidor en cada tecla.
  useEffect(() => {
    if (!abierto) return;
    setCargando(true);
    let vigente = true;
    const t = setTimeout(() => {
      buscarClientesCustodia(texto.trim())
        .then((r) => { if (vigente) { setResultados(r); setFalla(false); } })
        .catch(() => { if (vigente) { setResultados([]); setFalla(true); } })
        .finally(() => { if (vigente) setCargando(false); });
    }, 250);
    return () => { vigente = false; clearTimeout(t); };
  }, [texto, abierto]);

  useEffect(() => {
    const fuera = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setAbierto(false); };
    document.addEventListener('mousedown', fuera);
    return () => document.removeEventListener('mousedown', fuera);
  }, []);

  const elegir = (c: ClienteDirectorio) => {
    onChange(c);
    setCambiando(false);
    setAbierto(false);
    setTexto('');
  };

  if (tieneCliente) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, minHeight: 44, padding: '6px 12px', border: '2px solid var(--borde-input)', borderRadius: 10, background: '#f8fafc' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="truncate" style={{ fontWeight: 600, fontSize: '0.9rem' }}>{value.nombre}</div>
          {value.id == null && (
            <div style={{ fontSize: '0.72rem', color: '#b7791f' }}>Escrito a mano en un viaje anterior: no está vinculado al Directorio.</div>
          )}
        </div>
        {!soloLectura && (
          <>
            <button type="button" className="btn-secondary" style={{ padding: '4px 10px', fontSize: 12 }} onClick={() => { setCambiando(true); setAbierto(true); }}>
              Cambiar
            </button>
            <button type="button" className="btn-secondary icon-btn" title="Quitar cliente" aria-label="Quitar cliente" onClick={() => onChange(null)}>
              <X size={14} />
            </button>
          </>
        )}
      </div>
    );
  }

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <input
        value={texto}
        placeholder="Buscar cliente del Directorio por nombre o RUC"
        onFocus={() => setAbierto(true)}
        onChange={(e) => { setTexto(e.target.value); setAbierto(true); }}
        autoComplete="off"
        style={{ width: '100%' }}
      />
      {abierto && (
        <div
          role="listbox"
          style={{ position: 'absolute', zIndex: 20, left: 0, right: 0, top: '100%', marginTop: 4, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, boxShadow: '0 10px 30px rgba(0,0,0,0.12)', maxHeight: 260, overflowY: 'auto' }}
        >
          {cargando && resultados.length === 0 && <div style={{ padding: 12, fontSize: '0.82rem', color: '#718096' }}>Buscando...</div>}
          {falla && <div style={{ padding: 12, fontSize: '0.82rem', color: '#c53030' }}>No se pudo buscar en el Directorio. Inténtalo de nuevo.</div>}
          {!cargando && !falla && resultados.length === 0 && (
            <div style={{ padding: 12, fontSize: '0.82rem', color: '#718096' }}>Ningún cliente coincide.</div>
          )}
          {resultados.map((c) => (
            <button
              key={c.id} type="button" role="option" aria-selected={false}
              onClick={() => elegir(c)}
              style={{ display: 'block', width: '100%', textAlign: 'left', padding: '8px 12px', border: 'none', borderBottom: '1px solid #f1f5f9', background: 'none', cursor: 'pointer', fontFamily: 'inherit' }}
            >
              <div style={{ fontSize: '0.86rem', fontWeight: 600 }}>{c.name}</div>
              {c.ruc && <div style={{ fontSize: '0.74rem', color: '#718096' }}>RUC {c.ruc}</div>}
            </button>
          ))}
          {permitirCrear && <button
            type="button" className="enlace-tabla"
            onClick={() => { setAbierto(false); setCreando(true); }}
            style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, background: '#f8fafc', border: 'none', borderTop: '1px solid #e2e8f0', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 700, color: '#1e3a5f', padding: '10px 12px' }}
          >
            <Plus size={14} /> ¿No existe? Crear cliente
          </button>}
        </div>
      )}

      {creando && createPortal(
        // Los eventos de React suben por el árbol aunque la ventana se pinte en <body>: sin esto, Enter o un clic
        // dentro de «Crear cliente» también actuaban sobre el formulario del viaje que está debajo.
        <div onSubmit={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}>
          <NuevoClienteModal nombreInicial={texto.trim()} onClose={() => setCreando(false)} onCreado={(c) => { setCreando(false); elegir(c); }} />
        </div>,
        document.body,
      )}
    </div>
  );
}
