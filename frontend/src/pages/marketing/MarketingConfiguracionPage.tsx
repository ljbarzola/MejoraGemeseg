import { useEffect, useState } from 'react';
import { HelpCircle, Sparkles } from 'lucide-react';
import PageHeader from '../../components/common/PageHeader';
import ErrorAviso from '../../components/marketing/ErrorAviso';
import ArchivosDeMarca from '../../components/marketing/ArchivosDeMarca';
import MarketingAyuda from '../../components/marketing/MarketingAyuda';
import MarketingProgreso from '../../components/marketing/MarketingProgreso';
import {
  getConfiguracionMarketing,
  guardarConfiguracionMarketing,
  leerWebMarketing,
} from '../../services/marketing.service';
import '../../styles/marketing.css';
import '../../styles/marketing-recursos.css';

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
  const [aprobadorDistinto, setAprobadorDistinto] = useState(false);
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [ayuda, setAyuda] = useState(false);
  const [guardado, setGuardado] = useState(false);
  const [sitioWeb, setSitioWeb] = useState('');
  const [sitioWebGuardado, setSitioWebGuardado] = useState('');
  const [redes, setRedes] = useState('');
  const [herramientas, setHerramientas] = useState('');
  const [resumenWeb, setResumenWeb] = useState('');
  const [leyendoWeb, setLeyendoWeb] = useState(false);
  const [errorWeb, setErrorWeb] = useState('');

  useEffect(() => {
    getConfiguracionMarketing()
      .then((c) => {
        setTono(c.tono || '');
        setServicios(c.servicios || '');
        setCanales(c.canalesPermitidos || '');
        setConsentimiento(c.consentimiento || '');
        setAprobadorDistinto(!!c.aprobadorDistinto);
        setSitioWeb(c.sitioWeb || '');
        setSitioWebGuardado(c.sitioWeb || '');
        setRedes(c.redesSociales || '');
        setHerramientas(c.herramientas || '');
        setResumenWeb(c.resumenWeb || '');
      })
      .catch((err: any) => setError(err.response?.data?.message || 'No se pudo cargar la configuración.'));
  }, []);

  const datosAGuardar = () => ({
    tono,
    servicios,
    canalesPermitidos: canales,
    consentimiento,
    aprobadorDistinto,
    sitioWeb: sitioWeb.trim(),
    redesSociales: redes,
    herramientas,
    resumenWeb,
  });

  const leerWeb = async () => {
    if (!sitioWeb.trim()) {
      setErrorWeb('Escribe primero la dirección de tu sitio web.');
      return;
    }
    setLeyendoWeb(true);
    setErrorWeb('');
    setGuardado(false);
    try {
      // La lectura usa la web ya guardada: si la dirección cambió, se guarda antes.
      if (sitioWeb.trim() !== sitioWebGuardado) {
        const c = await guardarConfiguracionMarketing(datosAGuardar());
        setSitioWebGuardado(c.sitioWeb || '');
      }
      const r = await leerWebMarketing();
      setSitioWeb(r.sitioWeb || sitioWeb);
      setSitioWebGuardado(r.sitioWeb || sitioWeb);
      setResumenWeb(r.resumenWeb || '');
    } catch (err: any) {
      setErrorWeb(err.response?.data?.message || 'No se pudo leer tu web. Revisa que la dirección esté bien escrita e inténtalo de nuevo.');
    } finally {
      setLeyendoWeb(false);
    }
  };

  const guardar = async () => {
    setGuardando(true);
    setError('');
    setGuardado(false);
    try {
      const c = await guardarConfiguracionMarketing(datosAGuardar());
      setSitioWebGuardado(c.sitioWeb || '');
      setGuardado(true);
    } catch (err: any) {
      setError(err.response?.data?.message || 'No se pudo guardar la configuración.');
    } finally {
      setGuardando(false);
    }
  };

  const campo = (valor: string, setter: (v: string) => void, placeholder: string, filas = 5) => (
    <textarea
      className="form-textarea"
      rows={filas}
      value={valor}
      onChange={(e) => { setter(e.target.value); setGuardado(false); }}
      placeholder={placeholder}
      style={{ display: 'block', width: '100%', boxSizing: 'border-box' }}
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
            <button
              type="button"
              className="btn-secondary btn-icon-toolbar"
              onClick={() => setAyuda(true)}
              title="Cómo funciona la configuración"
              aria-label="Cómo funciona la configuración"
            >
              <HelpCircle size={18} />
            </button>
            <button className="auth-btn" onClick={guardar} disabled={guardando}>
              {guardando ? 'Guardando...' : 'Guardar'}
            </button>
          </>
        }
      />
      <ErrorAviso mensaje={error} />
      {guardado && (
        <div className="marketing-exito" role="status">
          <span>✅</span>
          <span>Configuración guardada. El agente la usará en las próximas campañas.</span>
        </div>
      )}

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
            <>
              <p style={{ color: '#475569', lineHeight: 1.6, marginBottom: 14 }}>
                Quién puede aprobar se define con los permisos de cada persona en «Permisos usuarios»: quien tenga «Escribir» en Marketing crea y aprueba. El agente deja todo en borrador.
              </p>
              <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={aprobadorDistinto}
                  onChange={(e) => { setAprobadorDistinto(e.target.checked); setGuardado(false); }}
                  style={{ marginTop: 4 }}
                />
                <span>
                  <strong>Que apruebe otra persona</strong>
                  <span style={{ display: 'block', fontSize: '0.84rem', color: '#64748b' }}>
                    Quien crea una campaña no puede aprobarla si hay otra persona con acceso de escritura a Marketing. Si solo hay una persona, puede aprobar ella misma y queda registrado.
                  </span>
                </span>
              </label>
            </>
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

      <div className="admin-section mkt-rec-bloque">
        <h3>Recursos de marca</h3>
        <p className="mkt-rec-intro">
          La IA usa esto para conocer tu empresa y para que las imágenes lleven tu logo real. Los textos se guardan con el botón «Guardar» de arriba; los archivos se suben al instante.
        </p>

        <section className="mkt-rec-seccion">
          <h4>Tu empresa en internet</h4>
          <div className="form-group">
            <label htmlFor="mkt-sitio-web">Sitio web</label>
            <div className="mkt-rec-web">
              <input
                id="mkt-sitio-web"
                type="text"
                inputMode="url"
                value={sitioWeb}
                onChange={(e) => { setSitioWeb(e.target.value); setGuardado(false); }}
                placeholder="Ej. www.miempresa.com"
                disabled={leyendoWeb}
              />
              <button type="button" className="btn-secondary" onClick={leerWeb} disabled={leyendoWeb || !sitioWeb.trim()}>
                <Sparkles size={16} /> {leyendoWeb ? 'Leyendo...' : 'Leer mi web con IA'}
              </button>
            </div>
          </div>
          <ErrorAviso mensaje={errorWeb} />
          {leyendoWeb && <MarketingProgreso texto="La IA está leyendo tu web. Puede tardar hasta 20 segundos..." />}
          <div className="form-group">
            <label htmlFor="mkt-resumen-web">Lo que la IA entendió de tu web</label>
            <textarea
              id="mkt-resumen-web"
              className="form-textarea"
              rows={6}
              value={resumenWeb}
              onChange={(e) => { setResumenWeb(e.target.value); setGuardado(false); }}
              placeholder="Aquí aparecerá el resumen cuando leas tu web. Puedes corregirlo o escribirlo tú."
              disabled={leyendoWeb}
            />
          </div>
          <div className="mkt-rec-columnas">
            <div className="form-group">
              <label htmlFor="mkt-redes">Redes sociales (una por línea)</label>
              <textarea
                id="mkt-redes"
                className="form-textarea"
                rows={4}
                value={redes}
                onChange={(e) => { setRedes(e.target.value); setGuardado(false); }}
                placeholder={'Ej. instagram.com/miempresa\nfacebook.com/miempresa'}
              />
            </div>
            <div className="form-group">
              <label htmlFor="mkt-herramientas">Apps y herramientas que usan</label>
              <textarea
                id="mkt-herramientas"
                className="form-textarea"
                rows={4}
                value={herramientas}
                onChange={(e) => { setHerramientas(e.target.value); setGuardado(false); }}
                placeholder="Ej. WhatsApp Business, Mailchimp, Canva."
              />
            </div>
          </div>
        </section>

        <h4 style={{ margin: '0 0 10px', fontSize: '0.95rem', color: 'var(--azul-oscuro)' }}>Archivos de marca</h4>
        <ArchivosDeMarca />
      </div>

      {ayuda && <MarketingAyuda onClose={() => setAyuda(false)} />}
    </div>
  );
}
