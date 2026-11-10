import { useEffect, useRef, useState } from 'react';
import { Search } from 'lucide-react';
import ErrorBanner from '../common/ErrorBanner';
import {
  buscarClicWhatsapp,
  marcarEscribioWhatsapp,
  type ClicWhatsapp,
} from '../../services/ventas.service';

import { numeroLegible } from '../../utils/numeroWhatsapp';
const servicioLegible = (s: string | null) => (s ? s.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase()) : '');
const fechaHora = (iso: string) =>
  new Date(iso).toLocaleString('es-EC', { timeZone: 'America/Guayaquil', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });

// «Llegó un WhatsApp»: el vendedor recibió un mensaje que trae un código al final (GMS-WA-XXXXXX). Lo escribe, ve a qué
// clic de qué landing corresponde y, con los datos de quien escribió, crea el posible cliente (fuente WhatsApp, mismo
// código, campaña y landing del clic). Si ya se conoce el clic (fila de la lista de clics) se salta la búsqueda.
export default function LlegoWhatsappModal({ clicInicial, onClose, onDone, onVerClics }: {
  clicInicial?: ClicWhatsapp;
  onClose: () => void;
  onDone: () => void;
  // Si se da, el primer paso ofrece abrir la lista de clics (cuando no se encuentra el código).
  onVerClics?: () => void;
}) {
  const [codigo, setCodigo] = useState(clicInicial?.trackingId ?? '');
  const [clic, setClic] = useState<ClicWhatsapp | null>(clicInicial ?? null);
  const [buscando, setBuscando] = useState(false);
  const [datos, setDatos] = useState({ name: '', phone: '', email: '', companyName: '', message: '' });
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);
  const set = (k: keyof typeof datos, v: string) => setDatos((d) => ({ ...d, [k]: v }));
  const nombreRef = useRef<HTMLInputElement>(null);

  // Al encontrar el clic, el cursor pasa al primer dato de contacto.
  useEffect(() => { if (clic) nombreRef.current?.focus(); }, [clic]);

  const mensajeDe = (err: any, porDefecto: string) => {
    const msg = err?.response?.data?.message;
    return (Array.isArray(msg) ? msg[0] : msg) || porDefecto;
  };

  const buscar = async () => {
    setError('');
    if (!codigo.trim()) return setError('Escribe el código que llegó en el mensaje (GMS-WA-XXXXXX).');
    setBuscando(true);
    try {
      const encontrado = await buscarClicWhatsapp(codigo.trim());
      if (encontrado.fase !== 'CLIC') {
        return setError(`Ese código ya tiene posible cliente${encontrado.leadName ? ` (${encontrado.leadName})` : ''}. Búscalo en Posibles clientes.`);
      }
      setClic(encontrado);
    } catch (err: any) {
      setError(mensajeDe(err, 'No se pudo buscar el código. Intenta de nuevo.'));
    } finally {
      setBuscando(false);
    }
  };

  const guardar = async () => {
    if (!clic) return;
    setError('');
    if (!datos.name.trim() && !datos.phone.trim() && !datos.email.trim()) {
      return setError('Escribe al menos un nombre, un teléfono o un correo de quien escribió.');
    }
    setGuardando(true);
    try {
      // Solo viajan los campos con texto: el servidor rechaza vacíos en los que sí valida.
      const limpio = Object.fromEntries(Object.entries(datos).filter(([, v]) => v.trim())) as typeof datos;
      await marcarEscribioWhatsapp(clic.id, limpio);
      onDone();
    } catch (err: any) {
      setError(mensajeDe(err, 'No se pudo crear el posible cliente. Intenta de nuevo.'));
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-ventas-md" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Llegó un WhatsApp</h3>
          <button className="modal-close" onClick={onClose} aria-label="Cerrar">✕</button>
        </div>
        <div className="modal-body">
          <ErrorBanner mensaje={error} />
          {!clic ? (
            <>
              <div className="form-ayuda">
                <p>
                  Si el mensaje llegó desde una landing, trae un <strong>código</strong> al final. Escríbelo para ver de qué campaña y landing viene y crear el posible cliente.
                  {' '}¿El mensaje no trae código? Usa <strong>Nuevo posible cliente</strong> con fuente WhatsApp.
                </p>
              </div>
              <div className="form-group">
                <label>Código del mensaje</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input type="text" value={codigo} maxLength={20} placeholder="GMS-WA-XXXXXX" autoFocus
                    style={{ fontFamily: 'monospace', textTransform: 'uppercase', flex: 1 }}
                    onChange={(e) => setCodigo(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') buscar(); }} />
                  <button className="btn-secondary" onClick={buscar} disabled={buscando} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    <Search size={14} /> {buscando ? 'Buscando...' : 'Buscar'}
                  </button>
                </div>
                {onVerClics && (
                  <small style={{ color: '#718096' }}>
                    ¿No encuentras el código?{' '}
                    <button type="button" className="enlace-tabla" onClick={onVerClics}
                      style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', font: 'inherit' }}>
                      Ver los clics de WhatsApp
                    </button>
                  </small>
                )}
              </div>
            </>
          ) : (
            <>
              <div className="form-ayuda">
                <p>
                  Código <strong style={{ fontFamily: 'monospace' }}>{clic.trackingId}</strong> · tocó el botón el <strong>{fechaHora(clic.clickedAt)}</strong>
                  {clic.landingPage ? <> · landing <strong>{clic.landingPage}</strong></> : null}
                  {clic.utmCampaign !== 'none' ? <> · campaña <strong>{clic.utmCampaign}</strong>{clic.esPrueba ? ' (clic de prueba)' : ''}</> : null}
                  {clic.serviceName ? <> · servicio <strong>{servicioLegible(clic.serviceName)}</strong></> : null}
                  {clic.whatsappNumber ? <> · al WhatsApp <strong>{numeroLegible(clic.whatsappNumber)}</strong></> : null}.
                  {' '}Con los datos de quien escribió se crea el posible cliente; la fuente y el código quedan guardados.
                </p>
                {!clicInicial && (
                  <p>
                    <button type="button" className="enlace-tabla" style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', font: 'inherit' }}
                      onClick={() => { setClic(null); setError(''); }}>
                      Es otro código
                    </button>
                  </p>
                )}
              </div>
              <div className="form-row">
                <div className="form-group"><label>Nombre</label><input ref={nombreRef} type="text" value={datos.name} maxLength={150} onChange={(e) => set('name', e.target.value)} /></div>
                <div className="form-group"><label>Teléfono</label><input type="text" value={datos.phone} maxLength={150} onChange={(e) => set('phone', e.target.value)} /></div>
              </div>
              <div className="form-row">
                <div className="form-group"><label>Correo (opcional)</label><input type="email" value={datos.email} maxLength={150} onChange={(e) => set('email', e.target.value)} /></div>
                <div className="form-group"><label>Empresa (opcional)</label><input type="text" value={datos.companyName} maxLength={150} onChange={(e) => set('companyName', e.target.value)} /></div>
              </div>
              <div className="form-group">
                <label>Qué pidió (opcional)</label>
                <textarea className="form-textarea" rows={2} maxLength={2000} value={datos.message} onChange={(e) => set('message', e.target.value)} />
              </div>
            </>
          )}
        </div>
        <div className="modal-actions">
          <button className="btn-secondary" onClick={onClose}>Cancelar</button>
          {clic && <button className="auth-btn" onClick={guardar} disabled={guardando}>{guardando ? 'Guardando...' : 'Crear posible cliente'}</button>}
        </div>
      </div>
    </div>
  );
}
