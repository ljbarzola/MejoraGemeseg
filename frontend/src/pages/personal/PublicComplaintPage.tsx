import { useState, useEffect, useRef } from 'react';
import { Send, CircleCheckBig, Phone, MapPin, Mail } from 'lucide-react';
import {
  getPublicComplaintForm,
  submitPublicComplaint,
  type PublicComplaintForm,
} from '../../services/publicComplaint.service';
import '../../styles/quejasPublicas.css';

// Redes oficiales de Gemeseg (las mismas del pie de gemeseg.com).
const REDES = [
  {
    nombre: 'Instagram',
    url: 'https://www.instagram.com/gemeseg_seguridad',
    icono: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
        <rect x="2" y="2" width="20" height="20" rx="5" /><circle cx="12" cy="12" r="4" /><circle cx="17.5" cy="6.5" r="1" />
      </svg>
    ),
  },
  {
    nombre: 'LinkedIn',
    url: 'https://www.linkedin.com/company/grupo-empresarial-gemeseg',
    icono: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M4.98 3.5C4.98 4.88 3.87 6 2.5 6S0 4.88 0 3.5 1.12 1 2.5 1s2.48 1.12 2.48 2.5zM.24 8.25h4.5V23H.24V8.25zm7.5 0h4.32v2.01h.06c.6-1.14 2.07-2.34 4.26-2.34 4.56 0 5.4 3 5.4 6.9V23h-4.5v-6.3c0-1.5-.03-3.42-2.09-3.42-2.1 0-2.42 1.64-2.42 3.33V23h-4.5V8.25z" />
      </svg>
    ),
  },
  {
    nombre: 'Facebook',
    url: 'https://www.facebook.com/GemesegGuayas',
    icono: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M22 12.06C22 6.5 17.52 2 12 2S2 6.5 2 12.06c0 5 3.66 9.15 8.44 9.94v-7.03H7.9v-2.91h2.54V9.85c0-2.51 1.49-3.9 3.77-3.9 1.09 0 2.24.2 2.24.2v2.46h-1.26c-1.24 0-1.63.77-1.63 1.56v1.87h2.78l-.44 2.91h-2.34V22c4.78-.79 8.44-4.94 8.44-9.94z" />
      </svg>
    ),
  },
  {
    nombre: 'TikTok',
    url: 'https://www.tiktok.com/@gemesegec',
    icono: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M16.6 5.82a4.28 4.28 0 0 1-.72-2.42h-3.06v13.6a2.65 2.65 0 1 1-1.87-2.53V11.4a5.65 5.65 0 1 0 4.93 5.6V9.53a7.3 7.3 0 0 0 4.22 1.34V7.82a4.28 4.28 0 0 1-3.5-2z" />
      </svg>
    ),
  },
];

/**
 * Formulario público de quejas de la inducción (quejas.gemeseg.com, al que se llega con el QR que se
 * presenta en la inducción). Es una de las pocas pantallas que se abren sin iniciar sesión: lo llena
 * personal nuevo o en reinducción, casi siempre desde el celular. No usa nada de la sesión ni de
 * permisos. Cada queja cae en el tablero de RRHH con la etiqueta «Externa».
 * Diseño: UNA sola pantalla (marca a la izquierda, formulario a la derecha) con los colores de gemeseg.com.
 */
export default function PublicComplaintPage() {
  const [form, setForm] = useState<PublicComplaintForm | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const [tipo, setTipo] = useState('');
  const [sede, setSede] = useState('');
  const [fechaInduccion, setFechaInduccion] = useState('');
  const [description, setDescription] = useState('');
  const [personas, setPersonas] = useState('');
  const [acepta, setAcepta] = useState(false);
  const [anonima, setAnonima] = useState(true);
  const [nombre, setNombre] = useState('');
  const [email, setEmail] = useState('');
  const [telefono, setTelefono] = useState('');
  const [sitioWeb, setSitioWeb] = useState(''); // trampa para robots: queda vacío
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [enviada, setEnviada] = useState(false);
  const [enviadaAnonima, setEnviadaAnonima] = useState(true);
  const errorRef = useRef<HTMLDivElement>(null);
  const tarjetaRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    document.title = 'Quejas de la inducción · Gemeseg';
    getPublicComplaintForm()
      .then(setForm)
      .catch((err: any) =>
        setLoadError(
          err.response?.data?.message ||
            'No pudimos abrir el formulario en este momento. Inténtalo de nuevo más tarde.',
        ),
      )
      .finally(() => setLoading(false));
  }, []);

  // En celular un error pintado arriba pasa desapercibido si la persona ya bajó a «Enviar».
  useEffect(() => {
    if (error) errorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [error]);

  // Hoy en Ecuador (UTC-5), para limitar el selector de fecha.
  const hoy = new Date(Date.now() - 5 * 3_600_000).toISOString().slice(0, 10);

  const limpiar = () => {
    setTipo(''); setSede(''); setFechaInduccion(''); setDescription('');
    setPersonas(''); setAcepta(false);
    setAnonima(true); setNombre(''); setEmail(''); setTelefono('');
    setError(''); setEnviada(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tipo) return setError('Elige el tipo de queja.');
    if (!sede) return setError('Elige la sede.');
    if (!fechaInduccion) return setError('Indica la fecha de tu inducción.');
    if (description.trim().length < 5) return setError('Cuéntanos qué ocurrió, con al menos 5 caracteres.');
    if (!anonima && !email.trim() && !telefono.trim()) {
      return setError('Deja un correo o un teléfono para que Recursos Humanos pueda comunicarse contigo, o elige enviarla de forma anónima.');
    }
    if (!acepta) return setError('Acepta la política de privacidad para poder enviar tu queja.');
    setError('');
    setSending(true);
    try {
      await submitPublicComplaint({
        tipo,
        sede,
        fechaInduccion,
        description: description.trim(),
        anonima,
        aceptaPrivacidad: acepta,
        personasInvolucradas: personas.trim() || undefined,
        ...(anonima
          ? {}
          : {
              contactoNombre: nombre.trim() || undefined,
              contactoEmail: email.trim() || undefined,
              contactoTelefono: telefono.trim() || undefined,
            }),
        sitioWeb,
      });
      setEnviadaAnonima(anonima);
      setEnviada(true);
      setTimeout(() => tarjetaRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
    } catch (err: any) {
      const msg = err.response?.data?.message;
      setError(
        (Array.isArray(msg) ? msg[0] : msg) ||
          'No se pudo enviar tu queja. Revisa tu conexión e inténtalo de nuevo.',
      );
    } finally {
      setSending(false);
    }
  };

  const tarjeta = () => {
    if (loading) {
      return <p className="qj-sub">Cargando formulario...</p>;
    }
    if (loadError || !form) {
      return (
        <>
          <h2 className="qj-aparte">Formulario no disponible</h2>
          <p className="qj-sub">{loadError}</p>
        </>
      );
    }
    if (enviada) {
      return (
        <div className="qj-ok" role="status">
          <div className="qj-ok-icono"><CircleCheckBig size={32} /></div>
          <h2 className="qj-aparte">Recibimos tu queja</h2>
          <p>
            {enviadaAnonima
              ? 'Recursos Humanos la va a revisar. Como la enviaste de forma anónima, no tendrán cómo responderte directamente.'
              : 'Recursos Humanos la va a revisar y se comunicará contigo por el medio que dejaste.'}{' '}
            Ya puedes cerrar esta página.
          </p>
          <button type="button" className="qj-secundario" onClick={limpiar}>Enviar otra queja</button>
        </div>
      );
    }
    return (
      <form onSubmit={handleSubmit} noValidate>
        {error &&<div ref={errorRef} className="qj-error" role="alert">{error}</div>}

        <div className="qj-doble">
          <div className="qj-campo">
            <label htmlFor="qj-tipo">Tipo de queja *</label>
            <select id="qj-tipo" value={tipo} onChange={(e) => { setTipo(e.target.value); setError(''); }}>
              <option value="">Elige una opción</option>
              {form.tipos.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div className="qj-campo">
            <label htmlFor="qj-sede">Sede *</label>
            <select id="qj-sede" value={sede} onChange={(e) => { setSede(e.target.value); setError(''); }}>
              <option value="">Elige una opción</option>
              {form.sedes.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        </div>
        <div className="qj-doble">
          <div className="qj-campo">
            <label htmlFor="qj-fecha">Fecha de tu inducción *</label>
            <input id="qj-fecha" type="date" max={hoy} value={fechaInduccion}
              onChange={(e) => { setFechaInduccion(e.target.value); setError(''); }} />
          </div>
          <div className="qj-campo">
            <label htmlFor="qj-personas">Personas involucradas (opcional)</label>
            <input id="qj-personas" type="text" maxLength={300} value={personas}
              onChange={(e) => setPersonas(e.target.value)}
              placeholder="Nombres o cargos" />
          </div>
        </div>
        <div className="qj-campo">
          <label htmlFor="qj-desc">¿Qué ocurrió? *</label>
          <textarea id="qj-desc" maxLength={5000} value={description}
            onChange={(e) => { setDescription(e.target.value); setError(''); }}
            placeholder="Cuéntanos qué pasó, dónde y cuándo..." />
        </div>

        <fieldset className="qj-grupo">
          <legend>Cómo quieres enviarla</legend>
          <div className="qj-opciones">
            <label className="qj-opcion">
              <input type="radio" name="qj-modo" checked={anonima} onChange={() => { setAnonima(true); setError(''); }} />
              <strong>De forma anónima</strong>
              <span>No guardamos ningún dato tuyo. RRHH no podrá responderte.</span>
            </label>
            <label className="qj-opcion">
              <input type="radio" name="qj-modo" checked={!anonima} onChange={() => { setAnonima(false); setError(''); }} />
              <strong>Quiero que me contacten</strong>
              <span>Deja un correo o teléfono y RRHH se comunica contigo.</span>
            </label>
          </div>

          {!anonima && (
            <div className="qj-contacto">
              <div className="qj-campo">
                <label htmlFor="qj-nombre">Tu nombre (opcional)</label>
                <input id="qj-nombre" type="text" maxLength={120} autoComplete="name" value={nombre}
                  onChange={(e) => setNombre(e.target.value)} />
              </div>
              <div className="qj-doble">
                <div className="qj-campo">
                  <label htmlFor="qj-email">Correo</label>
                  <input id="qj-email" type="email" maxLength={120} autoComplete="email" value={email}
                    onChange={(e) => { setEmail(e.target.value); setError(''); }} />
                </div>
                <div className="qj-campo">
                  <label htmlFor="qj-tel">Teléfono o WhatsApp</label>
                  <input id="qj-tel" type="tel" maxLength={30} autoComplete="tel" value={telefono}
                    onChange={(e) => { setTelefono(e.target.value); setError(''); }} />
                </div>
              </div>
              <small className="qj-nota">Basta con uno de los dos.</small>
            </div>
          )}
        </fieldset>

        {/* Trampa para robots: fuera de la vista y del teclado; una persona nunca lo llena. */}
        <div aria-hidden="true" style={{ position: 'absolute', left: '-10000px', width: 1, height: 1, overflow: 'hidden' }}>
          <label htmlFor="qj-web">No llenes este campo</label>
          <input id="qj-web" type="text" tabIndex={-1} autoComplete="off" value={sitioWeb}
            onChange={(e) => setSitioWeb(e.target.value)} />
        </div>

        <label className="qj-acepto">
          <input type="checkbox" checked={acepta} onChange={(e) => { setAcepta(e.target.checked); setError(''); }} />
          <span>
            Acepto la{' '}
            <a href="https://gemeseg.com/politica-de-privacidad/" target="_blank" rel="noopener noreferrer">política de privacidad</a>{' '}
            de Gemeseg.
          </span>
        </label>

        <button type="submit" className="qj-enviar" disabled={sending}>
          <Send size={18} /> {sending ? 'Enviando...' : 'Enviar queja'}
        </button>
        <p className="qj-aviso">
          Después de enviarla, Recursos Humanos la revisa y le da seguimiento. Si dejaste contacto, se comunican contigo.
        </p>
      </form>
    );
  };

  return (
    <div className="qj-page">
      <div className="qj-fondo" aria-hidden="true" />

      <header className="qj-cab">
        <img className="qj-logo" src="/resources/quejas/logo.png" alt="Gemeseg Seguridad" />
      </header>

      <main className="qj-centro">
        <div className="qj-card" ref={tarjetaRef}>
          <div className="qj-card-cab">
            <h1>Formulario de quejas de la inducción</h1>
            <p>
              Para el personal que recibió su inducción o reinducción en Gemeseg. Tu queja llega directo a
              Recursos Humanos y puedes enviarla de forma anónima.
            </p>
          </div>
          <div className="qj-card-cuerpo">{tarjeta()}</div>
        </div>
      </main>

      {/* Pie igual al de gemeseg.com: logo y redes a un lado, contacto al otro */}
      <footer className="qj-pie">
        <div className="qj-pie-inner">
          <div className="qj-pie-marca">
            <img className="qj-pie-logo" src="/resources/quejas/logo.png" alt="Gemeseg" />
            <div className="qj-redes">
              {REDES.map((r) => (
                <a key={r.nombre} href={r.url} target="_blank" rel="noopener noreferrer" aria-label={r.nombre}>{r.icono}</a>
              ))}
            </div>
          </div>
          <div className="qj-contacto-pie">
            <a href="https://wa.me/593969135744" target="_blank" rel="noopener noreferrer"><Phone size={16} />+593 96 913 5744</a>
            <span><MapPin size={16} />Guayaquil: Urdesa Central, Víctor Emilio Estrada e Ilanes</span>
            <span><MapPin size={16} />Loja: Av. Héroes del Cenepa y R. Morán Valverde</span>
            <a href="mailto:info@gemeseg.com"><Mail size={16} />info@gemeseg.com</a>
          </div>
        </div>
        <div className="qj-copy">
          Copyright © Gemeseg 2026 | Todos los derechos reservados |{' '}
          <a href="https://gemeseg.com/politica-de-privacidad/" target="_blank" rel="noopener noreferrer">Política de privacidad</a>
        </div>
      </footer>
    </div>
  );
}
