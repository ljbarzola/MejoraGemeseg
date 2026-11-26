import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Sparkles, CalendarDays, Plug, Radar, TrendingUp } from 'lucide-react';
import PageHeader from '../../components/common/PageHeader';
import ConfirmDialog from '../../components/common/ConfirmDialog';
import ErrorAviso from '../../components/marketing/ErrorAviso';
import MarketingProgreso from '../../components/marketing/MarketingProgreso';
import NuevaCampaniaModal from '../../components/marketing/NuevaCampaniaModal';
import { CANALES_MARKETING, ESTADOS_CONEXION, canalPorClave } from '../../components/marketing/marketingCanales';
import { estadoMarketing } from '../../components/marketing/marketingEtiquetas';
import {
  aceptarPropuesta,
  descartarPropuesta,
  generarPropuestas,
  getResumenMarketing,
} from '../../services/marketing.service';
import type { MarketingPropuesta, MarketingResumen } from '../../types/marketing';
import '../../styles/marketing.css';

const CANALES_LEAD: Record<string, string> = {
  WEB_FORM: 'Formulario web',
  GOOGLE_ADS: 'Google Ads',
  META_ADS: 'Meta (Facebook/Instagram)',
  EMAIL: 'Correo',
  MANUAL: 'Registro manual',
  WHATSAPP: 'WhatsApp',
};

function fechaCorta(iso: string) {
  const d = new Date(`${iso}T12:00:00`);
  return d.toLocaleDateString('es-EC', { weekday: 'short', day: 'numeric', month: 'short' });
}

/** Primer submódulo de Marketing: qué está pasando, qué propone la IA y qué sale esta semana. */
export default function MarketingInicioPage() {
  const navigate = useNavigate();
  const [datos, setDatos] = useState<MarketingResumen | null>(null);
  const [error, setError] = useState('');
  const [trabajando, setTrabajando] = useState('');
  const [nueva, setNueva] = useState(false);
  const [aceptando, setAceptando] = useState<MarketingPropuesta | null>(null);

  const cargar = () =>
    getResumenMarketing()
      .then(setDatos)
      .catch((err: any) => setError(err.response?.data?.message || 'No se pudo cargar el resumen de Marketing.'));
  useEffect(() => { cargar(); }, []);

  const proponer = async () => {
    setTrabajando('La IA está revisando tus datos de Ventas y armando propuestas...');
    setError('');
    try {
      const propuestas = await generarPropuestas();
      setDatos((d) => (d ? { ...d, propuestas } : d));
    } catch (err: any) {
      setError(err.response?.data?.message || 'No se pudieron generar propuestas.');
    } finally {
      setTrabajando('');
    }
  };

  const aceptar = async (p: MarketingPropuesta) => {
    setTrabajando('Armando la campaña completa: plan, piezas y calendario (30 a 60 segundos)...');
    setError('');
    try {
      const detalle = await aceptarPropuesta(p.id);
      navigate(`/marketing/campanias/${detalle.id}`);
    } catch (err: any) {
      setError(err.response?.data?.message || 'No se pudo crear la campaña.');
      setTrabajando('');
    }
  };

  const descartar = async (p: MarketingPropuesta) => {
    try {
      const propuestas = await descartarPropuesta(p.id);
      setDatos((d) => (d ? { ...d, propuestas } : d));
    } catch (err: any) {
      setError(err.response?.data?.message || 'No se pudo descartar la propuesta.');
    }
  };

  const maxLeads = Math.max(1, ...(datos?.embudo.porCanal.map((c) => c.leads) ?? [1]));
  const enDemo = datos?.conexiones.filter((c) => c.estado === 'DEMO').length ?? 0;

  return (
    <div className="page-container">
      <PageHeader
        eyebrow="Marketing"
        title="Inicio"
        description="Tu equipo de marketing con IA: propone campañas, crea los textos, imágenes y videos, los publica y mide hasta el contrato firmado."
        actions={
          <button className="auth-btn" onClick={() => setNueva(true)}>+ Nueva campaña</button>
        }
      />
      <ErrorAviso mensaje={error} />
      {trabajando && <MarketingProgreso texto={trabajando} />}

      {!datos ? (
        <div className="loading-state">Cargando Marketing...</div>
      ) : (
        <>
          {datos.campanias.total === 0 && (
            <div className="marketing-hero">
              <div>
                <h2>Empieza con una idea, la IA hace el resto</h2>
                <p>Cuéntale qué quieres promocionar: te hace unas preguntas, sugiere los canales y arma el plan con textos, imágenes y calendario. O acepta una de las campañas que te propone abajo.</p>
              </div>
              <button className="auth-btn" onClick={() => setNueva(true)}>Crear mi primera campaña</button>
            </div>
          )}

          <div className="marketing-kpis">
            <div className="marketing-kpi">
              <span>Campañas</span>
              <strong>{datos.campanias.total}</strong>
              <small>{datos.campanias.aprobadas} aprobadas · {datos.campanias.borrador} en borrador</small>
            </div>
            <div className="marketing-kpi">
              <span>Piezas creadas</span>
              <strong>{datos.piezas.total}</strong>
              <small>{datos.piezas.conArchivo} con imagen o video</small>
            </div>
            <div className="marketing-kpi">
              <span>Publicaciones</span>
              <strong>{datos.publicaciones.publicadas}</strong>
              <small>{datos.publicaciones.programadas} programadas · {datos.publicaciones.enPausa} anuncios en pausa</small>
            </div>
            <div className="marketing-kpi">
              <span>Contactos (90 días)</span>
              <strong>{datos.embudo.leads}</strong>
              <small>{datos.embudo.convertidos} se volvieron clientes</small>
            </div>
          </div>

          <div className="marketing-inicio-grid">
            <div>
              <section className="marketing-panel">
                <div className="marketing-panel-titulo">
                  <h3><Sparkles size={18} /> Campañas que te propone la IA</h3>
                  <button className="btn-secondary" onClick={proponer} disabled={!!trabajando}>
                    {datos.propuestas.length ? 'Proponer otras' : 'Proponer campañas'}
                  </button>
                </div>
                {datos.propuestas.length === 0 ? (
                  <p className="marketing-nota">
                    La IA revisa tus datos de Ventas (contratos por vencer, clientes que se fueron, contactos sin respuesta) y te propone campañas listas para aceptar. Cada lunes llegan nuevas.
                  </p>
                ) : (
                  datos.propuestas.map((p) => (
                    <article className="marketing-propuesta" key={p.id}>
                      {p.senal && <span className="marketing-senal">📊 {p.senal}</span>}
                      <h4>{p.titulo}</h4>
                      <p>{p.idea}</p>
                      {p.porque && <p style={{ fontSize: '0.8rem', color: '#64748b' }}><strong>Por qué:</strong> {p.porque}</p>}
                      <div className="marketing-propuesta-pie">
                        {p.canales.map((k) => {
                          const c = canalPorClave(k);
                          return c ? <span className="marketing-canal-mini" key={k}>{c.icono} {c.corto}</span> : null;
                        })}
                        <span className="acciones">
                          <button className="btn-secondary" onClick={() => descartar(p)} disabled={!!trabajando}>Descartar</button>
                          <button className="auth-btn" onClick={() => setAceptando(p)} disabled={!!trabajando}>Crear esta campaña</button>
                        </span>
                      </div>
                    </article>
                  ))
                )}
              </section>

              <section className="marketing-panel">
                <div className="marketing-panel-titulo">
                  <h3><CalendarDays size={18} /> Sale en los próximos 14 días</h3>
                  <button className="btn-secondary" onClick={() => navigate('/marketing/calendario')}>Ver calendario</button>
                </div>
                {datos.proximas.length === 0 ? (
                  <p className="marketing-nota">No hay piezas para las próximas dos semanas.</p>
                ) : (
                  <ul className="marketing-lista-simple">
                    {datos.proximas.map((p) => {
                      const c = canalPorClave(p.canalClave);
                      const estado = estadoMarketing(p.envioEstado || p.estado);
                      return (
                        <li key={p.id} onClick={() => navigate(`/marketing/campanias/${p.campaignId}`)}>
                          <time>{fechaCorta(p.fecha)}</time>
                          <span title={c?.nombre}>{c?.icono ?? '📝'}</span>
                          <span className="texto">{p.titulo || p.tipo} · <span style={{ color: '#64748b' }}>{p.campania}</span></span>
                          <span className={`status-badge marketing-estado--${estado.clase}`}>{estado.texto}</span>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>
            </div>

            <div>
              <section className="marketing-panel">
                <div className="marketing-panel-titulo">
                  <h3><TrendingUp size={18} /> Del anuncio al contrato (90 días)</h3>
                </div>
                <div className="marketing-embudo">
                  <div><strong>{datos.embudo.leads}</strong><span>Contactos</span></div>
                  <div><strong>{datos.embudo.convertidos}</strong><span>Clientes</span></div>
                  <div><strong>{datos.embudo.contratos}</strong><span>Contratos</span></div>
                </div>
                {datos.embudo.porCanal.length > 0 ? (
                  <ul className="marketing-barras">
                    {datos.embudo.porCanal.slice(0, 6).map((c) => (
                      <li key={c.canal}>
                        <span>{CANALES_LEAD[c.canal] ?? c.canal}</span>
                        <span className="marketing-reparto-barra"><span style={{ width: `${(c.leads / maxLeads) * 100}%`, background: 'var(--azul-claro)' }} /></span>
                        <strong>{c.leads}</strong>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="marketing-nota">Aún no hay contactos registrados en Ventas en los últimos 90 días.</p>
                )}
                <p className="marketing-nota" style={{ marginTop: 10 }}>
                  Se cruza con los contactos, oportunidades y contratos de Ventas: así se sabe qué canal trae clientes que firman, no solo clics.
                </p>
              </section>

              <section className="marketing-panel">
                <div className="marketing-panel-titulo">
                  <h3><Plug size={18} /> Canales conectados</h3>
                  <button className="btn-secondary" onClick={() => navigate('/marketing/integraciones')}>Gestionar</button>
                </div>
                {datos.conexiones.map((c) => {
                  const e = ESTADOS_CONEXION[c.estado] ?? ESTADOS_CONEXION.NO_CONECTADO;
                  return (
                    <div className="marketing-conexion-fila" key={c.canal}>
                      <span>{CANALES_MARKETING.find((x) => x.key === c.canal)?.icono} {c.nombre}</span>
                      <span className={`status-badge marketing-estado--${e.clase}`}>{e.texto}</span>
                    </div>
                  );
                })}
                {enDemo === 0 && (
                  <p className="marketing-nota" style={{ marginTop: 8 }}>
                    Activa el modo demostración en un canal para ver la publicación completa sin que nada salga a internet.
                  </p>
                )}
              </section>

              <section className="marketing-panel">
                <div className="marketing-panel-titulo">
                  <h3><Radar size={18} /> Radar de competencia</h3>
                  <button className="btn-secondary" onClick={() => navigate('/marketing/radar')}>Abrir</button>
                </div>
                <p className="marketing-nota">La IA busca en Google qué ofrecen y cómo se anuncian tus competidores, y te propone campañas para aprovechar sus huecos.</p>
              </section>
            </div>
          </div>
        </>
      )}

      {nueva && (
        <NuevaCampaniaModal
          inicial={{ idea: '', objetivo: '' }}
          onClose={() => setNueva(false)}
          onCreada={(d) => navigate(`/marketing/campanias/${d.id}`)}
        />
      )}
      {aceptando && (
        <ConfirmDialog
          title="Crear campaña propuesta"
          confirmLabel="Crear campaña"
          message={
            <ul className="marketing-confirmar">
              <li>La IA arma la campaña «{aceptando.titulo}» completa: plan, piezas para cada canal y calendario.</li>
              <li>Tarda entre 30 y 60 segundos.</li>
              <li>Queda en borrador: revisas, ajustas y apruebas antes de publicar nada.</li>
            </ul>
          }
          onConfirm={() => {
            const p = aceptando;
            setAceptando(null);
            aceptar(p);
          }}
          onCancel={() => setAceptando(null)}
        />
      )}
    </div>
  );
}
