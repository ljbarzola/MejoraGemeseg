import { useState, useEffect, useRef } from 'react';
import {
  getNotificationConfig,
  updateNotificationConfig,
} from '../../services/entidades.service';
import { usePerm } from '../../contexts/PermissionsContext';
import PanelConfig, { SinGuardar } from './PanelConfig';

/**
 * Correo de envío (pestaña de la Configuración de RRHH): desde qué dirección salen los avisos de la empresa
 * (los recordatorios de documentos a los guardias y el código para recuperar la contraseña). Antes era
 * el engranaje «Notificaciones» de Cumplimiento.
 */
export default function CorreoEnvioPanel({ onSucio }: { onSucio?: (sucio: boolean) => void }) {
  const { canWrite } = usePerm();
  const puedeEditar = canWrite('RRHH');

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [senderEmail, setSenderEmail] = useState('');
  const [senderName, setSenderName] = useState('');
  const [whatsappFrom, setWhatsappFrom] = useState('');
  // Lo último guardado, para saber si hay cambios pendientes.
  const [guardadoEmail, setGuardadoEmail] = useState('');
  const [guardadoNombre, setGuardadoNombre] = useState('');

  const sucio = senderEmail.trim() !== guardadoEmail || senderName.trim() !== guardadoNombre;

  const errorRef = useRef<HTMLDivElement>(null);
  // El aviso puede quedar fuera de vista si la persona ya bajó en la pantalla.
  useEffect(() => {
    if (error) errorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [error]);

  // La pantalla avisa antes de cambiar de pestaña si hay algo sin guardar.
  useEffect(() => {
    onSucio?.(sucio);
    return () => onSucio?.(false);
  }, [sucio, onSucio]);

  useEffect(() => {
    getNotificationConfig()
      .then((c) => {
        setSenderEmail(c?.senderEmail || '');
        setSenderName(c?.senderName || '');
        setWhatsappFrom(c?.whatsappFrom || '');
        setGuardadoEmail((c?.senderEmail || '').trim());
        setGuardadoNombre((c?.senderName || '').trim());
      })
      .catch(() => setError('No se pudo cargar la configuración del correo.'))
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
      setGuardadoEmail(senderEmail.trim());
      setGuardadoNombre(senderName.trim());
      setSuccess('Configuración guardada correctamente.');
    } catch (err: any) {
      setError(err.response?.data?.message || 'No se pudo guardar la configuración.');
    } finally {
      setSaving(false);
    }
  };

  const cambio = () => setSuccess('');

  if (loading) return <div className="admin-section"><div className="loading-state">Cargando configuración...</div></div>;

  return (
    <PanelConfig
      descripcion={<>
        Desde qué dirección salen los avisos de tu empresa: los recordatorios de documentos a los guardias y el código para
        recuperar la contraseña. No cambia a quién se le envía: eso sigue siendo el correo de cada persona.
      </>}
      acciones={puedeEditar ? (
        <>
          <SinGuardar visible={sucio} />
          <button type="button" className="auth-btn" onClick={handleSave} disabled={saving || !sucio}>
            {saving ? 'Guardando...' : 'Guardar'}
          </button>
        </>
      ) : undefined}
      estado={<>
        <div ref={errorRef}>{error && <div className="form-error">{error}</div>}</div>
        {!puedeEditar && (
          <div className="form-error" style={{ background: '#fffaf0', borderColor: '#fbd38d', color: '#7b341e' }}>
            Tu usuario solo puede ver esta configuración. Pide a alguien de RRHH con permiso de escribir que la cambie.
          </div>
        )}
        {success && (
          <div style={{ background: '#f0fff4', border: '1px solid #9ae6b4', color: '#276749', borderRadius: 8, padding: '8px 12px', marginBottom: 12, fontSize: '0.84rem', fontWeight: 600 }}>
            {success}
          </div>
        )}
      </>}
    >
      <h4 style={{ fontSize: '0.88rem', color: 'var(--azul-oscuro)', margin: '0 0 10px' }}>Correo electrónico (Gmail)</h4>
      <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', marginBottom: 18 }}>
        <div className="form-group" style={{ margin: 0 }}>
          <label htmlFor="rrhh-correo-envio" style={{ fontSize: '0.8rem' }}>Correo de envío</label>
          <input
            id="rrhh-correo-envio"
            type="text"
            inputMode="email"
            value={senderEmail}
            disabled={!puedeEditar}
            onChange={(e) => { setSenderEmail(e.target.value); cambio(); }}
            placeholder="rrhh@gemeseg.com"
            style={{ fontSize: '0.84rem' }}
          />
          <p style={{ fontSize: '0.74rem', color: '#a0aec0', margin: '4px 0 0' }}>
            Tiene que ser una casilla real de tu dominio, con su propio buzón (no un alias ni un grupo). Al guardar se comprueba
            contra Google: si no existe, te avisa aquí mismo y no se guarda.
          </p>
        </div>
        <div className="form-group" style={{ margin: 0 }}>
          <label htmlFor="rrhh-correo-nombre" style={{ fontSize: '0.8rem' }}>Nombre del remitente</label>
          <input
            id="rrhh-correo-nombre"
            type="text"
            value={senderName}
            disabled={!puedeEditar}
            onChange={(e) => { setSenderName(e.target.value); cambio(); }}
            placeholder="Recursos Humanos - GEMESEG"
            style={{ fontSize: '0.84rem' }}
          />
          <p style={{ fontSize: '0.74rem', color: '#a0aec0', margin: '4px 0 0' }}>
            Opcional. Es el nombre que ve quien recibe el correo
            {senderName.trim() && senderEmail.trim() ? `: "${senderName.trim()} <${senderEmail.trim()}>"` : '.'}
          </p>
        </div>
      </div>

      {/* WhatsApp: bloqueado hasta tener proveedor y cuenta de WhatsApp Business aprobada por Meta. El campo se deja
          visible (para que se sepa que está previsto) pero sin poder escribirse, en vez de dejar configurar algo
          que no enviaría. */}
      <div style={{ opacity: 0.65, marginBottom: 14 }}>
        <h4 style={{ fontSize: '0.88rem', color: 'var(--azul-oscuro)', margin: '0 0 10px', display: 'flex', alignItems: 'center', gap: 8 }}>
          WhatsApp Business
          <span style={{ fontSize: '0.65rem', background: '#e2e8f0', color: '#718096', borderRadius: 999, padding: '2px 8px', fontWeight: 700 }}>
            Próximamente
          </span>
        </h4>
        <div className="form-group" style={{ margin: 0, maxWidth: 420 }}>
          <label htmlFor="rrhh-whatsapp" style={{ fontSize: '0.8rem' }}>Número de WhatsApp Business</label>
          <input
            id="rrhh-whatsapp"
            type="text"
            value={whatsappFrom}
            disabled
            placeholder="+593991234567"
            style={{ fontSize: '0.84rem', background: '#f1f5f9', cursor: 'not-allowed' }}
          />
          <p style={{ fontSize: '0.74rem', color: '#a0aec0', margin: '4px 0 0' }}>
            Todavía no disponible: hace falta contratar el proveedor de mensajería y obtener una cuenta de WhatsApp Business
            aprobada por Meta. Mientras tanto, los recordatorios se envían por correo.
          </p>
        </div>
      </div>
    </PanelConfig>
  );
}
