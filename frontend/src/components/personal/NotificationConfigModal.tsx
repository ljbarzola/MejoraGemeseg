import { useState, useEffect } from 'react';
import { X, Settings } from 'lucide-react';
import {
  getNotificationConfig,
  updateNotificationConfig,
} from '../../services/entidades.service';

interface Props {
  onClose: () => void;
  onSaved?: () => void;
}

export default function NotificationConfigModal({ onClose, onSaved }: Props) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [senderEmail, setSenderEmail] = useState('');
  const [senderName, setSenderName] = useState('');
  const [whatsappFrom, setWhatsappFrom] = useState('');

  useEffect(() => {
    getNotificationConfig()
      .then((c) => {
        setSenderEmail(c?.senderEmail || '');
        setSenderName(c?.senderName || '');
        setWhatsappFrom(c?.whatsappFrom || '');
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      await updateNotificationConfig({
        senderEmail: senderEmail.trim() || undefined,
        senderName: senderName.trim() || undefined,
        whatsappFrom: whatsappFrom.trim() || undefined,
        whatsappProvider: whatsappFrom.trim() ? 'twilio' : undefined,
      });
      setSuccess('Configuracion guardada correctamente.');
      onSaved?.();
    } catch (err: any) {
      setError(err.response?.data?.message || 'No se pudo guardar la configuracion.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: '520px' }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Settings size={16} color="var(--azul-oscuro)" />
            <h3>Configuracion de Notificaciones</h3>
          </div>
          <button className="modal-close" onClick={onClose}><X size={16} /></button>
        </div>
        <div className="modal-body">
          {loading ? (
            <div className="loading-state">Cargando configuracion...</div>
          ) : (
            <>
              <p style={{ fontSize: '0.82rem', color: '#718096', margin: '0 0 16px' }}>
                Desde qué dirección salen los avisos de tu empresa: los recordatorios de
                documentos a los guardias y el código para recuperar la contraseña.
                No cambia a quién se le envía — eso sigue siendo el correo de cada persona.
              </p>

              {/* Correo */}
              <div style={{ marginBottom: '20px' }}>
                <h4 style={{ fontSize: '0.85rem', color: 'var(--azul-oscuro)', margin: '0 0 10px' }}>Correo electronico (Gmail)</h4>
                <div style={{ display: 'grid', gap: '10px' }}>
                  <div className="form-group">
                    <label style={{ fontSize: '0.8rem' }}>Correo de envío</label>
                    <input
                      type="text"
                      inputMode="email"
                      value={senderEmail}
                      onChange={(e) => setSenderEmail(e.target.value)}
                      placeholder="rrhh@gemeseg.com"
                      style={{ fontSize: '0.82rem' }}
                    />
                    <p style={{ fontSize: '0.72rem', color: '#a0aec0', margin: '4px 0 0' }}>
                      Tiene que ser una casilla real de tu dominio, con su propio buzón
                      (no un alias ni un grupo). Al guardar se comprueba contra Google:
                      si no existe, te avisa aquí mismo y no se guarda.
                    </p>
                  </div>
                  <div className="form-group">
                    <label style={{ fontSize: '0.8rem' }}>Nombre del remitente</label>
                    <input
                      type="text"
                      value={senderName}
                      onChange={(e) => setSenderName(e.target.value)}
                      placeholder="Recursos Humanos - GEMESEG"
                      style={{ fontSize: '0.82rem' }}
                    />
                    <p style={{ fontSize: '0.72rem', color: '#a0aec0', margin: '4px 0 0' }}>
                      Opcional. Es el nombre que ve quien recibe el correo
                      {senderName.trim() && senderEmail.trim()
                        ? `: "${senderName.trim()} <${senderEmail.trim()}>"`
                        : '.'}
                    </p>
                  </div>
                </div>
              </div>

              {/* WhatsApp: bloqueado hasta tener proveedor y cuenta de
                   WhatsApp Business aprobada por Meta. El campo se deja
                   visible (para que se sepa que está previsto) pero sin poder
                   escribirse, en vez de dejar configurar algo que no enviaría. */}
              <div style={{ marginBottom: '16px', opacity: 0.65 }}>
                <h4 style={{ fontSize: '0.85rem', color: 'var(--azul-oscuro)', margin: '0 0 10px', display: 'flex', alignItems: 'center', gap: 8 }}>
                  WhatsApp Business
                  <span style={{ fontSize: '0.65rem', background: '#e2e8f0', color: '#718096', borderRadius: 999, padding: '2px 8px', fontWeight: 700 }}>
                    Próximamente
                  </span>
                </h4>
                <div className="form-group">
                  <label style={{ fontSize: '0.8rem' }}>Número de WhatsApp Business</label>
                  <input
                    type="text"
                    value={whatsappFrom}
                    disabled
                    placeholder="+593991234567"
                    style={{ fontSize: '0.82rem', background: '#f1f5f9', cursor: 'not-allowed' }}
                  />
                  <p style={{ fontSize: '0.72rem', color: '#a0aec0', margin: '4px 0 0' }}>
                    Todavía no disponible: hace falta contratar el proveedor de mensajería y obtener una cuenta de WhatsApp Business aprobada por Meta. Mientras tanto, los recordatorios se envían por correo.
                  </p>
                </div>
              </div>

              {error && (
                <div style={{ background: '#fff5f5', border: '1px solid #feb2b2', color: '#c53030', borderRadius: '8px', padding: '8px 12px', marginBottom: '12px', fontSize: '0.82rem' }}>
                  {error}
                </div>
              )}
              {success && (
                <div style={{ background: '#f0fff4', border: '1px solid #9ae6b4', color: '#276749', borderRadius: '8px', padding: '8px 12px', marginBottom: '12px', fontSize: '0.82rem' }}>
                  {success}
                </div>
              )}
            </>
          )}
        </div>
        <div className="modal-actions">
          <button className="btn-secondary" onClick={onClose}>Cancelar</button>
          <button className="auth-btn" onClick={handleSave} disabled={saving || loading}>
            {saving ? 'Guardando...' : 'Guardar configuracion'}
          </button>
        </div>
      </div>
    </div>
  );
}
