import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import PageHeader from '../../components/common/PageHeader';
import ErrorAviso from '../../components/marketing/ErrorAviso';
import { ESTADOS_CONEXION, canalPorClave } from '../../components/marketing/marketingCanales';
import {
  cambiarConexion,
  crearRequerimiento,
  listarConexiones,
  listarRequerimientos,
} from '../../services/marketing.service';
import type { MarketingConexion, MarketingRequerimiento } from '../../types/marketing';
import '../../styles/marketing.css';
import '../../styles/marketing-integraciones.css';

const PASOS = [
  { titulo: 'Cuéntale tu idea', texto: 'Escribe qué quieres promocionar. El agente te hace unas preguntas cortas para entender tu negocio.' },
  { titulo: 'La IA arma todo', texto: 'Plan, canales, textos, imágenes y video, con calendario y presupuesto sugerido.' },
  { titulo: 'Tú apruebas', texto: 'Revisas, pides cambios con tus palabras y apruebas. Nada sale sin una persona.' },
  { titulo: 'Se publica y se mide', texto: 'Sale en cada canal y se mide de punta a punta: del anuncio al contrato firmado.' },
];

const PLATAFORMA = [
  { icono: '🤝', nombre: 'CRM de Ventas', texto: 'Contactos, oportunidades y contratos: mide cada campaña de punta a punta.' },
  { icono: '🗂️', nombre: 'Google Drive', texto: 'Guarda el kit de cada campaña aprobada en la carpeta de Marketing.' },
  { icono: '🧠', nombre: 'IA de Google (Gemini, Imagen y Veo)', texto: 'Escribe los textos y crea las imágenes y los videos.' },
  { icono: '🔔', nombre: 'Notificaciones y tareas', texto: 'Avisa y crea la tarea cuando se aprueba una campaña.' },
  { icono: '🌎', nombre: 'Búsqueda de Google', texto: 'Alimenta el radar de competencia con fuentes reales.' },
];

const IDEAS: Array<{ titulo: string; texto: string; disponible: boolean }> = [
  { titulo: 'Agente que propone campañas', texto: 'Cada lunes revisa el CRM (contratos por vencer, contactos fríos, clientes perdidos) y te deja campañas listas para aprobar.', disponible: true },
  { titulo: 'Imágenes y videos con IA', texto: 'Cada pieza con su imagen o video; si algo no te gusta, lo pides con tus palabras y la IA lo rehace.', disponible: true },
  { titulo: 'Calendario de contenido', texto: 'Todas las publicaciones en un calendario con fechas comerciales; muévelas arrastrando.', disponible: true },
  { titulo: 'Radar de competencia', texto: 'Qué ofrecen y cómo se anuncian tus competidores, y qué huecos dejan para ti.', disponible: true },
  { titulo: 'Publicación en un clic', texto: 'Publica o programa cada pieza; las campañas pagadas quedan creadas en pausa para que alguien las active.', disponible: true },
  { titulo: 'Seguimiento por WhatsApp', texto: 'Cada contacto nuevo recibe respuesta y recordatorios, con aprobación de una persona.', disponible: false },
  { titulo: 'Páginas de aterrizaje', texto: 'Una página por servicio y ciudad, con formulario que entra directo a Ventas.', disponible: false },
  { titulo: 'Embudo anuncio → contrato', texto: 'Qué canal trae contratos y no solo clics, explicado en lenguaje sencillo.', disponible: false },
  { titulo: 'Auto-pausa de anuncios', texto: 'Propone pausar lo que gasta sin traer contactos; una persona confirma.', disponible: false },
  { titulo: 'Respuestas a reseñas de Google', texto: 'Redacta respuestas a cada reseña del Perfil de Google para que solo las apruebes.', disponible: false },
];

const TIPOS_PEDIDO: Array<{ valor: MarketingRequerimiento['tipo']; texto: string }> = [
  { valor: 'NECESIDAD', texto: 'Contar mi necesidad' },
  { valor: 'CANAL', texto: 'Pedir un canal nuevo' },
  { valor: 'INTEGRACION', texto: 'Conectar otra herramienta' },
];

const ETIQUETA_TIPO: Record<string, string> = {
  NECESIDAD: 'Necesidad',
  CANAL: 'Canal nuevo',
  INTEGRACION: 'Conexión',
};

function etiquetaConexion(c: MarketingConexion): string {
  if (c.conexion === 'INTERNA') return 'Incluido';
  if (c.conexion === 'MANUAL') return 'Publicar con un clic';
  return 'Publicación automática';
}

function fecha(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ''
    : d.toLocaleDateString('es-EC', { timeZone: 'America/Guayaquil', dateStyle: 'medium' });
}

export default function MarketingIntegracionesPage() {
  const [conexiones, setConexiones] = useState<MarketingConexion[]>([]);
  const [pedidos, setPedidos] = useState<MarketingRequerimiento[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [solicitando, setSolicitando] = useState<MarketingConexion | null>(null);

  const [tipo, setTipo] = useState<MarketingRequerimiento['tipo']>('NECESIDAD');
  const [canal, setCanal] = useState('');
  const [detalle, setDetalle] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [enviado, setEnviado] = useState(false);
  const [errorForm, setErrorForm] = useState('');

  useEffect(() => {
    Promise.all([listarConexiones(), listarRequerimientos()])
      .then(([c, r]) => {
        setConexiones(c);
        setPedidos(r);
      })
      .catch((err: any) => setError(err.response?.data?.message || 'No se pudieron cargar las integraciones.'))
      .finally(() => setCargando(false));
  }, []);

  const cambiar = async (c: MarketingConexion, accion: 'DEMO' | 'SOLICITAR' | 'DESCONECTAR', nota?: string) => {
    setOcupado(c.canal);
    setError('');
    try {
      setConexiones(await cambiarConexion(c.canal, accion, nota));
      if (accion === 'SOLICITAR') setPedidos(await listarRequerimientos());
    } catch (err: any) {
      setError(err.response?.data?.message || 'No se pudo cambiar la conexión.');
    } finally {
      setOcupado(null);
    }
  };

  const enviar = async () => {
    if (detalle.trim().length < 4) {
      setErrorForm('Cuéntanos un poco más (al menos 4 caracteres).');
      return;
    }
    setEnviando(true);
    setErrorForm('');
    setEnviado(false);
    try {
      setPedidos(await crearRequerimiento(tipo, detalle.trim(), tipo === 'NECESIDAD' ? undefined : canal.trim() || undefined));
      setDetalle('');
      setCanal('');
      setEnviado(true);
    } catch (err: any) {
      setErrorForm(err.response?.data?.message || 'No se pudo enviar. Inténtalo de nuevo.');
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="page-container">
      <PageHeader
        eyebrow="Marketing"
        title="Integraciones y capacidades"
        description="Todo lo que el módulo puede hacer y con qué se conecta."
      />
      <ErrorAviso mensaje={error} />

      <section className="admin-section mkt-int-hero">
        <h2>Tu equipo de marketing con IA, conectado a tus ventas</h2>
        <p>
          Una idea basta: la IA arma la campaña completa, tú decides qué sale y el resultado se mide con los contactos y
          contratos reales de Ventas.
        </p>
        <ol className="mkt-int-pasos">
          {PASOS.map((p, i) => (
            <li key={p.titulo}>
              <span className="mkt-int-numero">{i + 1}</span>
              <div>
                <strong>{p.titulo}</strong>
                <p>{p.texto}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className="admin-section mkt-int-bloque">
        <h3>Canales y conexiones</h3>
        <p className="mkt-int-nota">
          En modo demostración todo el flujo funciona igual, pero nada sale a internet. Al conectar la cuenta real, las
          publicaciones salen solas y las campañas pagadas se crean en pausa para que una persona las active.
        </p>
        {cargando ? (
          <div className="loading-state">Cargando canales...</div>
        ) : (
          <div className="mkt-int-grid">
            {conexiones.map((c) => {
              const info = canalPorClave(c.canal);
              const estado = ESTADOS_CONEXION[c.estado] ?? ESTADOS_CONEXION.NO_CONECTADO;
              const deshabilitado = ocupado === c.canal;
              return (
                <article key={c.canal} className="mkt-int-card" style={{ borderTopColor: info?.color || '#cbd5e1' }}>
                  <div className="mkt-int-card-cabecera">
                    <span className="mkt-int-icono" aria-hidden="true">{info?.icono || '📣'}</span>
                    <strong>{c.nombre}</strong>
                    <span className={`mkt-int-estado mkt-int-estado--${estado.clase}`}>{estado.texto}</span>
                  </div>
                  <p className="mkt-int-desc">{c.descripcion}</p>
                  {info?.queHaceLaIa && (
                    <p className="mkt-int-ia"><strong>Qué hace la IA:</strong> {info.queHaceLaIa}</p>
                  )}
                  <div className="mkt-int-tags">
                    <span className="mkt-int-tag">{etiquetaConexion(c)}</span>
                    {c.pagado && <span className="mkt-int-tag mkt-int-tag--pagado">Pagado</span>}
                  </div>
                  {c.conexion !== 'INTERNA' && (
                    <div className="mkt-int-acciones">
                      {c.estado === 'NO_CONECTADO' && (
                        <>
                          <button className="auth-btn" disabled={deshabilitado} onClick={() => cambiar(c, 'DEMO')}>
                            Probar en modo demostración
                          </button>
                          <button className="btn-secondary" disabled={deshabilitado} onClick={() => setSolicitando(c)}>
                            Solicitar conexión real
                          </button>
                        </>
                      )}
                      {c.estado === 'DEMO' && (
                        <>
                          <button className="auth-btn" disabled={deshabilitado} onClick={() => setSolicitando(c)}>
                            Solicitar conexión real
                          </button>
                          <button className="btn-secondary" disabled={deshabilitado} onClick={() => cambiar(c, 'DESCONECTAR')}>
                            Salir de demostración
                          </button>
                        </>
                      )}
                      {c.estado === 'SOLICITADO' && (
                        <>
                          <span className="mkt-int-espera">Nuestro equipo te contactará para conectarla.</span>
                          <button className="btn-secondary" disabled={deshabilitado} onClick={() => cambiar(c, 'DEMO')}>
                            Usar demostración mientras tanto
                          </button>
                        </>
                      )}
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </section>

      <section className="admin-section mkt-int-bloque">
        <h3>También conectado con</h3>
        <div className="mkt-int-grid mkt-int-grid--compacta">
          {PLATAFORMA.map((p) => (
            <article key={p.nombre} className="mkt-int-card mkt-int-card--simple">
              <div className="mkt-int-card-cabecera">
                <span className="mkt-int-icono" aria-hidden="true">{p.icono}</span>
                <strong>{p.nombre}</strong>
              </div>
              <p className="mkt-int-desc">{p.texto}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="admin-section mkt-int-bloque">
        <h3>Lo que la IA puede hacer por ti</h3>
        <div className="mkt-int-grid">
          {IDEAS.map((idea) => (
            <article key={idea.titulo} className="mkt-int-card mkt-int-card--simple">
              <div className="mkt-int-card-cabecera">
                <strong>{idea.titulo}</strong>
                <span className={`mkt-int-estado mkt-int-estado--${idea.disponible ? 'aprobada' : 'pendiente'}`}>
                  {idea.disponible ? 'Disponible' : 'Próximamente'}
                </span>
              </div>
              <p className="mkt-int-desc">{idea.texto}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="admin-section mkt-int-bloque mkt-int-necesidad">
        <div className="mkt-int-necesidad-texto">
          <h3>Todo depende de tus necesidades</h3>
          <p>
            Cuéntanos más a detalle de tu negocio y lo que quieres lograr; armamos la integración o el canal que te falte.
          </p>
        </div>
        <div className="mkt-int-form">
          {errorForm && <ErrorAviso mensaje={errorForm} />}
          {enviado && <div className="mkt-int-exito" role="status">Recibido. Nuestro equipo lo revisa y te contacta.</div>}
          <div className="mkt-int-form-fila">
            <div className="form-group">
              <label id="mkt-int-tipo">¿Qué necesitas?</label>
              <div className="marketing-chips" role="group" aria-labelledby="mkt-int-tipo">
                {TIPOS_PEDIDO.map((t) => (
                  <button key={t.valor} type="button" className="marketing-chip" aria-pressed={tipo === t.valor}
                    onClick={() => setTipo(t.valor as MarketingRequerimiento['tipo'])}>
                    {t.texto}
                  </button>
                ))}
              </div>
            </div>
            {tipo !== 'NECESIDAD' && (
              <div className="form-group">
                <label htmlFor="mkt-int-canal">¿Qué canal o herramienta?</label>
                <input
                  id="mkt-int-canal"
                  value={canal}
                  maxLength={80}
                  onChange={(e) => setCanal(e.target.value)}
                  placeholder="Ej. Radio local, HubSpot, X (Twitter)"
                />
              </div>
            )}
          </div>
          <div className="form-group">
            <label htmlFor="mkt-int-detalle">Cuéntanos</label>
            <textarea
              id="mkt-int-detalle"
              rows={4}
              value={detalle}
              maxLength={3000}
              onChange={(e) => {
                setDetalle(e.target.value);
                setEnviado(false);
              }}
              placeholder="A qué se dedica tu negocio, a quién le vendes y qué te gustaría lograr."
            />
          </div>
          <div className="mkt-int-form-acciones">
            <button className="auth-btn" onClick={enviar} disabled={enviando || detalle.trim().length < 4}>
              {enviando ? 'Enviando...' : 'Enviar al equipo'}
            </button>
          </div>
        </div>
      </section>

      <section className="admin-section mkt-int-bloque">
        <h3>
          Tus pedidos
          {pedidos.length > 0 && <span className="mkt-int-contador">{pedidos.length}</span>}
        </h3>
        {pedidos.length === 0 ? (
          <p className="mkt-int-vacio">Todavía no has enviado pedidos.</p>
        ) : (
          <ul className="mkt-int-pedidos">
            {pedidos.map((p) => (
              <li key={p.id}>
                <div className="mkt-int-pedido-cabecera">
                  <span className="mkt-int-tag">{ETIQUETA_TIPO[p.tipo] ?? p.tipo}</span>
                  {p.canal && <strong>{p.canal}</strong>}
                  <span className="mkt-int-pedido-fecha">{fecha(p.createdAt)}{p.creadoPor ? ` · ${p.creadoPor}` : ''}</span>
                  <span className={`mkt-int-estado mkt-int-estado--${p.estado === 'NUEVO' ? 'pendiente' : 'aprobada'}`}>
                    {p.estado === 'NUEVO' ? 'Nuevo' : p.estado.charAt(0) + p.estado.slice(1).toLowerCase()}
                  </span>
                </div>
                <p className="mkt-int-pedido-detalle">{p.detalle}</p>
              </li>
            ))}
          </ul>
        )}
      </section>

      {solicitando && (
        <SolicitarModal
          conexion={solicitando}
          onClose={() => setSolicitando(null)}
          onEnviar={(nota) => {
            const c = solicitando;
            setSolicitando(null);
            cambiar(c, 'SOLICITAR', nota);
          }}
        />
      )}
    </div>
  );
}

function SolicitarModal({
  conexion,
  onClose,
  onEnviar,
}: {
  conexion: MarketingConexion;
  onClose: () => void;
  onEnviar: (nota: string) => void;
}) {
  const [nota, setNota] = useState('');
  return (
    // Solo se cierra si el clic empezó en el fondo (un arrastre que empieza dentro no la cierra).
    <div className="modal-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal modal-ventas-sm">
        <div className="modal-header">
          <h3>Solicitar conexión: {conexion.nombre}</h3>
          <button className="modal-close" onClick={onClose} aria-label="Cerrar"><X size={16} /></button>
        </div>
        <div className="modal-body">
          <ul className="marketing-confirmar">
            <li>Le avisamos a nuestro equipo para conectar tu cuenta real de {conexion.nombre}.</li>
            <li>Te contactarán para pedir el acceso necesario. Mientras tanto puedes seguir en modo demostración.</li>
            <li>Una vez conectada, las campañas pagadas se crean en pausa: siempre las activa una persona.</li>
          </ul>
          <div className="form-group">
            <label htmlFor="mkt-int-nota">Nota para el equipo (opcional)</label>
            <textarea
              id="mkt-int-nota"
              rows={3}
              maxLength={1000}
              value={nota}
              onChange={(e) => setNota(e.target.value)}
              placeholder="Ej. Quién administra la cuenta o en qué horario te contactamos."
            />
          </div>
        </div>
        <div className="modal-actions">
          <button className="btn-secondary" onClick={onClose}>Cancelar</button>
          <button className="auth-btn" onClick={() => onEnviar(nota.trim())}>Enviar solicitud</button>
        </div>
      </div>
    </div>
  );
}
