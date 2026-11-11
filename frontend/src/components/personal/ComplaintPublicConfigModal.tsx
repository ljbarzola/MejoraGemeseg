import { useState, useEffect, useRef } from 'react';
import { X, Plus, Trash2, Download, Copy } from 'lucide-react';
import { QRCodeCanvas } from 'qrcode.react';
import {
  getComplaintPublicConfig,
  setComplaintPublicEnabled,
  addComplaintPublicOption,
  deleteComplaintPublicOption,
  type ComplaintPublicConfig,
  type ComplaintPublicOption,
} from '../../services/personal.service';
import { URL_QUEJAS_PUBLICAS } from '../../services/publicComplaint.service';

interface Props {
  onClose: () => void;
}

// RRHH configura el formulario público de quejas de la inducción (quejas.gemeseg.com):
// lo enciende o apaga, edita las sedes y los tipos de queja que ofrece, y descarga el
// código QR para presentarlo durante la inducción.
export default function ComplaintPublicConfigModal({ onClose }: Props) {
  const [config, setConfig] = useState<ComplaintPublicConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [nuevaSede, setNuevaSede] = useState('');
  const [nuevoTipo, setNuevoTipo] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [copiado, setCopiado] = useState(false);
  const errorRef = useRef<HTMLDivElement>(null);
  const qrRef = useRef<HTMLDivElement>(null);

  const load = () =>
    getComplaintPublicConfig()
      .then(setConfig)
      .catch(() => setError('No se pudo cargar la configuración.'))
      .finally(() => setLoading(false));

  useEffect(() => { load(); }, []);

  // El banner puede quedar fuera de vista si el modal tiene scroll.
  useEffect(() => {
    if (error) errorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [error]);

  const toggle = async () => {
    if (!config) return;
    setBusy(true);
    setError('');
    try {
      setConfig(await setComplaintPublicEnabled(!config.enabled));
    } catch (err: any) {
      setError(err.response?.data?.message || 'No se pudo cambiar el estado del formulario.');
    } finally {
      setBusy(false);
    }
  };

  const agregar = async (kind: 'TIPO' | 'SEDE') => {
    const label = (kind === 'SEDE' ? nuevaSede : nuevoTipo).trim();
    if (!label) return;
    setBusy(true);
    setError('');
    try {
      await addComplaintPublicOption({ kind, label });
      if (kind === 'SEDE') setNuevaSede(''); else setNuevoTipo('');
      await load();
    } catch (err: any) {
      const msg = err.response?.data?.message;
      setError((Array.isArray(msg) ? msg[0] : msg) || 'No se pudo agregar la opción.');
    } finally {
      setBusy(false);
    }
  };

  const quitar = async (op: ComplaintPublicOption) => {
    setError('');
    try {
      await deleteComplaintPublicOption(op.id);
      await load();
    } catch (err: any) {
      setError(err.response?.data?.message || 'No se pudo quitar la opción.');
    }
  };

  const descargarQr = () => {
    const canvas = qrRef.current?.querySelector('canvas');
    if (!canvas) return;
    const a = document.createElement('a');
    a.href = canvas.toDataURL('image/png');
    a.download = 'qr-quejas-gemeseg.png';
    a.click();
  };

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(URL_QUEJAS_PUBLICAS);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      setError('No se pudo copiar el enlace. Selecciónalo y cópialo a mano.');
    }
  };

  const lista = (titulo: string, kind: 'TIPO' | 'SEDE', items: ComplaintPublicOption[], valor: string, setValor: (v: string) => void, ejemplo: string) => (
    <div style={{ marginBottom: 18 }}>
      <p style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--azul-oscuro)', margin: '0 0 6px' }}>{titulo}</p>
      {items.length === 0 ? (
        <p style={{ fontSize: '0.8rem', color: '#a0aec0', margin: '0 0 8px' }}>Sin opciones todavía.</p>
      ) : (
        <div style={{ marginBottom: 8 }}>
          {items.map((op) => (
            <div key={op.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0', borderBottom: '1px solid #f1f5f9' }}>
              <span style={{ flex: 1, fontSize: '0.86rem' }}>{op.label}</span>
              <button
                type="button"
                onClick={() => quitar(op)}
                title="Quitar"
                aria-label={`Quitar ${op.label}`}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#cbd5e0' }}
              >
                <Trash2 size={15} />
              </button>
            </div>
          ))}
        </div>
      )}
      <div style={{ display: 'flex', gap: 8 }}>
        <input
          type="text"
          value={valor}
          maxLength={80}
          onChange={(e) => setValor(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') agregar(kind); }}
          placeholder={ejemplo}
          style={{ flex: 1, padding: '8px 10px', border: '2px solid #e2e8f0', borderRadius: 8, fontSize: '0.85rem' }}
        />
        <button className="btn-secondary" type="button" onClick={() => agregar(kind)} disabled={busy || !valor.trim()} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <Plus size={14} /> Agregar
        </button>
      </div>
    </div>
  );

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-ventas-md" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Formulario público de quejas (inducción)</h3>
          <button className="modal-close" onClick={onClose}><X size={16} /></button>
        </div>
        <div className="modal-body">
          <p style={{ fontSize: '0.82rem', color: '#718096', margin: '0 0 14px' }}>
            Quien recibe la inducción o la reinducción entra por el código QR a <strong>quejas.gemeseg.com</strong>, sin cuenta, y su queja llega a este mismo tablero con la etiqueta «Externa».
          </p>

          {error && <div className="form-error" ref={errorRef} style={{ marginBottom: 14 }}>{error}</div>}

          {loading || !config ? (
            <div className="loading-state">Cargando...</div>
          ) : (
            <>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.9rem', fontWeight: 600, marginBottom: 6, cursor: 'pointer' }}>
                <input type="checkbox" checked={config.enabled} onChange={toggle} disabled={busy || (config.otraEmpresaActiva && !config.enabled)} />
                Recibir quejas por el formulario público
              </label>
              {config.otraEmpresaActiva && !config.enabled && (
                <p style={{ fontSize: '0.8rem', color: '#c53030', margin: '0 0 12px' }}>
                  Otra empresa ya recibe las quejas de quejas.gemeseg.com. Solo una empresa puede tenerlo activo.
                </p>
              )}
              {!config.enabled && !config.otraEmpresaActiva && (
                <p style={{ fontSize: '0.8rem', color: '#718096', margin: '0 0 12px' }}>
                  Mientras esté apagado, quien abra el enlace verá que el formulario no está disponible.
                </p>
              )}

              {config.enabled && (
                <div style={{ display: 'flex', gap: 18, alignItems: 'center', flexWrap: 'wrap', padding: '12px 0', margin: '6px 0 14px', borderTop: '1px solid #f1f5f9', borderBottom: '1px solid #f1f5f9' }}>
                  <div ref={qrRef} style={{ background: '#fff', padding: 8, border: '1px solid #e2e8f0', borderRadius: 8 }}>
                    <QRCodeCanvas value={URL_QUEJAS_PUBLICAS} size={140} marginSize={2} />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <span style={{ fontSize: '0.85rem', color: 'var(--azul-oscuro)', fontWeight: 600 }}>{URL_QUEJAS_PUBLICAS}</span>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      <button className="btn-secondary" type="button" onClick={descargarQr} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <Download size={14} /> Descargar QR
                      </button>
                      <button className="btn-secondary" type="button" onClick={copiar} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <Copy size={14} /> {copiado ? 'Copiado' : 'Copiar enlace'}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {lista('Sedes', 'SEDE', config.sedes, nuevaSede, setNuevaSede, 'Nueva sede (ej. Quito)')}
              {lista('Tipos de queja', 'TIPO', config.tipos, nuevoTipo, setNuevoTipo, 'Nuevo tipo de queja')}
              <p style={{ fontSize: '0.78rem', color: '#a0aec0', margin: 0 }}>
                Quitar una opción no borra ni cambia las quejas que ya llegaron con ella.
              </p>
            </>
          )}
        </div>
        <div className="modal-actions">
          <button className="btn-secondary" onClick={onClose}>Cerrar</button>
        </div>
      </div>
    </div>
  );
}
