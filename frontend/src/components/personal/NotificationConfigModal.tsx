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
                Configura el remitente de correos y el numero de WhatsApp Business para enviar recordatorios de cumplimiento.
              </p>

              {/* Correo */}
              <div style={{ marginBottom: '20px' }}>
                <h4 style={{ fontSize: '0.85rem', color: 'var(--azul-oscuro)', margin: '0 0 10px' }}>Correo electronico (Gmail)</h4>
                <div style={{ display: 'grid', gap: '10px' }}>
                  <div className="form-group">
                    <label style={{ fontSize: '0.8rem' }}>Correo de envio</label>
                    <input
                      type="email"
                      value={senderEmail}
                      onChange={(e) => setSenderEmail(e.target.value)}
                      placeholder="rrhh@tudominio.com"
                      style={{ fontSize: '0.82rem' }}
                    />
                    <p style={{ fontSize: '0.72rem', color: '#a0aec0', margin: '4px 0 0' }}>
                      Debe coincidir con la casilla configurada en Google Workspace para domain-wide delegation.
                    </p>
                  </div>
                  <div className="form-group">
                    <label style={{ fontSize: '0.8rem' }}>Nombre del remitente</label>
                    <input
                      type="text"
                      value={senderName}
                      onChange={(e) => setSenderName(e.target.value)}
                      placeholder="Recursos Humanos - Gemeseg"
                      style={{ fontSize: '0.82rem' }}
                    />
                  </div>
                </div>
              </div>

              {/* WhatsApp */}
              <div style={{ marginBottom: '16px' }}>
                <h4 style={{ fontSize: '0.85rem', color: 'var(--azul-oscuro)', margin: '0 0 10px' }}>WhatsApp Business (Twilio)</h4>
                <div className="form-group">
                  <label style={{ fontSize: '0.8rem' }}>Numero de WhatsApp Business</label>
                  <input
                    type="text"
                    value={whatsappFrom}
                    onChange={(e) => setWhatsappFrom(e.target.value)}
                    placeholder="+593991234567"
                    style={{ fontSize: '0.82rem' }}
                  />
                  <p style={{ fontSize: '0.72rem', color: '#a0aec0', margin: '4px 0 0' }}>
                    Numero aprobado por Meta para WhatsApp Business. Requiere TWILIO_ACCOUNT_SID y TWILIO_AUTH_TOKEN en el servidor.
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
