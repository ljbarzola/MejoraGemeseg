import { useEffect, useState } from 'react';
import { HelpCircle } from 'lucide-react';
import PageHeader from '../../components/common/PageHeader';
import ErrorAviso from '../../components/marketing/ErrorAviso';
import MarketingAyuda from '../../components/marketing/MarketingAyuda';
import {
  getConfiguracionMarketing,
  guardarConfiguracionMarketing,
} from '../../services/marketing.service';
import '../../styles/marketing.css';

const PASOS = [
  { titulo: 'Marca y tono', que: 'Cómo debe sonar el contenido de tu empresa.' },
  { titulo: 'Servicios', que: 'Qué servicios puede promocionar el agente.' },
  { titulo: 'Canales', que: 'Dónde se va a publicar o enviar el contenido.' },
  { titulo: 'Aprobadores', que: 'Quién revisa antes de que algo salga.' },
  { titulo: 'Consentimiento', que: 'Cómo se avisa que se puede dar de baja.' },
];

export default function MarketingConfiguracionPage() {
  const [paso, setPaso] = useState(0);
  const [tono, setTono] = useState('');
  const [servicios, setServicios] = useState('');
  const [canales, setCanales] = useState('');
  const [consentimiento, setConsentimiento] = useState('');
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [ayuda, setAyuda] = useState(false);

  useEffect(() => {
    getConfiguracionMarketing()
      .then((c) => {
        setTono(c.tono || '');
        setServicios(c.servicios || '');
        setCanales(c.canalesPermitidos || '');
        setConsentimiento(c.consentimiento || '');
      })
      .catch((err: any) => setError(err.response?.data?.message || 'No se pudo cargar la configuración.'));
  }, []);

  const guardar = async () => {
    setGuardando(true);
    setError('');
    try {
      await guardarConfiguracionMarketing({
        tono,
        servicios,
        canalesPermitidos: canales,
        consentimiento,
      });
    } catch (err: any) {
      setError(err.response?.data?.message || 'No se pudo guardar la configuración.');
    } finally {
      setGuardando(false);
    }
  };

  const campo = (valor: string, setter: (v: string) => void, placeholder: string, filas = 5) => (
    <textarea
      rows={filas}
      value={valor}
      onChange={(e) => setter(e.target.value)}
      placeholder={placeholder}
      style={{ display: 'block', width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #e2e8f0', boxSizing: 'border-box', resize: 'vertical', fontSize: '0.88rem' }}
    />
  );

  return (
    <div className="page-container">
      <PageHeader
        eyebrow="Marketing"
        title="Configuración"
        description="Esto le enseña al agente cómo es tu empresa. Se guarda por empresa y no se comparte con otras."
        actions={
          <>
            <button className="btn-secondary" onClick={() => setAyuda(true)} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <HelpCircle size={16} /> Cómo funciona
            </button>
            <button className="auth-btn" onClick={guardar} disabled={guardando}>
              {guardando ? 'Guardando...' : 'Guardar'}
            </button>
          </>
        }
      />
      <ErrorAviso mensaje={error} />

      <div className="admin-section" style={{ padding: '18px' }}>
        <div className="marketing-stepper" role="list" aria-label="Pasos de configuración">
          {PASOS.map((p, i) => (
            <button
              key={p.titulo}
              type="button"
              role="listitem"
              className={i === paso ? 'activo' : ''}
              onClick={() => setPaso(i)}
            >
              <span className="numero">{i + 1}</span>
              {p.titulo}
            </button>
          ))}
        </div>

        <section className="marketing-plan-section">
          <h4>{PASOS[paso].titulo}</h4>
          <p style={{ marginBottom: '12px' }}>{PASOS[paso].que}</p>
          {paso === 0 && campo(tono, setTono, 'Ej. Tono cercano pero formal. No prometer precios ni resultados.')}
          {paso === 1 && campo(servicios, setServicios, 'Un servicio por línea. Ej. Monitoreo de alarmas.')}
          {paso === 2 && campo(canales, setCanales, 'Ej. WhatsApp, Instagram, correo, landing.', 3)}
          {paso === 3 && (
            <p style={{ color: '#475569', lineHeight: 1.6 }}>
              La aprobación se define con los permisos de cada persona en «Permisos usuarios». El agente deja todo en borrador y una persona con acceso de escritura aprueba.
            </p>
          )}
          {paso === 4 && campo(consentimiento, setConsentimiento, 'Ej. Todo mensaje comercial debe explicar cómo darse de baja.', 4)}
        </section>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '18px' }}>
          <button className="btn-secondary" disabled={paso === 0} onClick={() => setPaso((p) => p - 1)}>Atrás</button>
          {paso < PASOS.length - 1 ? (
            <button className="auth-btn" onClick={() => setPaso((p) => p + 1)}>Siguiente</button>
          ) : (
            <button className="auth-btn" onClick={guardar} disabled={guardando}>Guardar y terminar</button>
          )}
        </div>
      </div>

      {ayuda && <MarketingAyuda onClose={() => setAyuda(false)} />}
    </div>
  );
}
