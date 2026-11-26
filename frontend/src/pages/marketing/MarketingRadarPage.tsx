import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import PageHeader from '../../components/common/PageHeader';
import ConfirmDialog from '../../components/common/ConfirmDialog';
import ErrorAviso from '../../components/marketing/ErrorAviso';
import MarketingProgreso from '../../components/marketing/MarketingProgreso';
import { fechaMarketing } from '../../components/marketing/marketingEtiquetas';
import { generarRadar, getRadar } from '../../services/marketing.service';
import type { MarketingRadar } from '../../types/marketing';
import '../../styles/marketing.css';
import '../../styles/marketing-radar.css';

// Ejemplos genéricos (sin nombres de empresas): rellenan el cuadro al pulsarlos.
const EJEMPLOS = [
  'Empresas de mi mismo servicio en mi ciudad',
  'Cómo captan clientes corporativos mis competidores',
  'Qué ofertas y mensajes usan en redes los líderes de mi sector',
];

export default function MarketingRadarPage() {
  const navigate = useNavigate();
  const [radar, setRadar] = useState<MarketingRadar | null>(null);
  const [competidores, setCompetidores] = useState('');
  const [cargando, setCargando] = useState(true);
  const [generando, setGenerando] = useState(false);
  const [confirmando, setConfirmando] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    getRadar()
      .then((r) => {
        setRadar(r);
        setCompetidores(r.competidores || '');
      })
      .catch((err: any) => setError(err.response?.data?.message || 'No se pudo cargar el radar.'))
      .finally(() => setCargando(false));
  }, []);

  const actualizar = async () => {
    setGenerando(true);
    setError('');
    try {
      const r = await generarRadar(competidores.trim());
      setRadar(r);
      setCompetidores(r.competidores || '');
    } catch (err: any) {
      setError(err.response?.data?.message || 'No se pudo armar el radar de competencia.');
    } finally {
      setGenerando(false);
    }
  };

  const informe = radar?.informe;

  return (
    <div className="page-container">
      <PageHeader
        eyebrow="Marketing"
        title="Radar de competencia"
        description="La IA busca en Google qué ofrecen y cómo se anuncian tus competidores, y te dice qué huecos aprovechar."
      />
      <ErrorAviso mensaje={error} />

      <div className="admin-section radar-bloque">
        <div className="form-group" style={{ marginBottom: 10 }}>
          <label htmlFor="radar-competidores">¿Qué quieres analizar? (opcional)</label>
          <textarea
            id="radar-competidores"
            rows={3}
            maxLength={1000}
            value={competidores}
            disabled={generando}
            placeholder="Nombres de empresas o sitios web, o lo que quieres saber de tu competencia"
            onChange={(e) => setCompetidores(e.target.value)}
          />
          <p className="radar-ayuda">
            Escribe nombres de empresas, o cuéntanos qué quieres ver y la IA busca y analiza a las empresas que encajen. Si lo
            dejas vacío, identifica a los principales de tu sector.
          </p>
          <div className="marketing-chips radar-ejemplos" role="group" aria-label="Ejemplos de lo que puedes escribir">
            {EJEMPLOS.map((e) => (
              <button
                key={e}
                type="button"
                className="marketing-chip"
                disabled={generando}
                onClick={() => setCompetidores(e)}
              >
                {e}
              </button>
            ))}
          </div>
        </div>
        <div className="radar-acciones">
          <button className="auth-btn" onClick={() => setConfirmando(true)} disabled={generando || cargando}>
            {generando ? 'Actualizando...' : 'Actualizar radar'}
          </button>
          {radar?.generadoEn && (
            <span className="radar-ayuda">Última actualización: {fechaMarketing(radar.generadoEn)}</span>
          )}
        </div>
      </div>

      {generando && <MarketingProgreso texto="Buscando en Google y armando el informe..." />}

      {cargando ? (
        <div className="loading-state">Cargando radar...</div>
      ) : !informe ? (
        <div className="admin-section radar-bloque">
          <h4 className="radar-titulo">Todavía no hay un informe</h4>
          <p className="radar-texto">
            El radar revisa lo que publican y anuncian otras empresas de tu sector para que decidas mejor tus campañas. Por ejemplo:
          </p>
          <ul className="radar-lista">
            <li>Qué servicios ofrecen y con qué mensajes se anuncian.</li>
            <li>En qué canales están (redes, Google, web) y qué no están haciendo.</li>
            <li>Ideas de campaña para ocupar los huecos que dejan.</li>
          </ul>
          <p className="radar-ayuda">Pulsa «Actualizar radar» para armar el primero.</p>
        </div>
      ) : (
        <>
          {informe.enfoque && (
            <div className="admin-section radar-bloque radar-enfoque">
              <span className="radar-dato-titulo">Lo que analicé</span>
              <p className="radar-texto">{informe.enfoque}</p>
            </div>
          )}

          {informe.resumen && (
            <div className="admin-section radar-bloque">
              <h4 className="radar-titulo">Resumen</h4>
              <p className="radar-texto">{informe.resumen}</p>
            </div>
          )}

          {!!informe.competidores?.length && (
            <>
              <h4 className="radar-seccion">Competidores</h4>
              <div className="radar-grid">
                {informe.competidores.map((c) => (
                  <article className="admin-section radar-tarjeta" key={c.nombre}>
                    <h5>{c.nombre}</h5>
                    {c.queOfrecen && <Dato titulo="Qué ofrecen" texto={c.queOfrecen} />}
                    {c.comoSeAnuncian && <Dato titulo="Cómo se anuncian" texto={c.comoSeAnuncian} />}
                    {!!c.canales?.length && (
                      <div className="radar-dato">
                        <span className="radar-dato-titulo">Canales</span>
                        <div className="marketing-chips">
                          {c.canales.map((canal) => (
                            <span key={canal} className="radar-chip">{canal}</span>
                          ))}
                        </div>
                      </div>
                    )}
                    {c.fortalezas && <Dato titulo="Fortalezas" texto={c.fortalezas} />}
                    {c.huecos && (
                      <div className="radar-hueco">
                        <span className="radar-dato-titulo">Huecos que puedes aprovechar</span>
                        <p>{c.huecos}</p>
                      </div>
                    )}
                  </article>
                ))}
              </div>
            </>
          )}

          {(!!informe.tendencias?.length || !!informe.oportunidades?.length) && (
            <div className="radar-dos-columnas">
              <div className="admin-section radar-bloque">
                <h4 className="radar-titulo">Tendencias</h4>
                <ul className="radar-lista">
                  {(informe.tendencias ?? []).map((t) => <li key={t}>{t}</li>)}
                </ul>
              </div>
              <div className="admin-section radar-bloque radar-oportunidades">
                <h4 className="radar-titulo">Oportunidades para ti</h4>
                <ul className="radar-lista">
                  {(informe.oportunidades ?? []).map((o) => <li key={o}>{o}</li>)}
                </ul>
              </div>
            </div>
          )}

          {!!informe.ideas?.length && (
            <>
              <h4 className="radar-seccion">Ideas de campaña</h4>
              <div className="radar-grid">
                {informe.ideas.map((i) => (
                  <article className="admin-section radar-tarjeta radar-idea" key={i.titulo}>
                    <h5>{i.titulo}</h5>
                    <p className="radar-texto">{i.idea}</p>
                    <button
                      className="btn-secondary"
                      onClick={() =>
                        navigate(`/marketing/campanias?nueva=1&idea=${encodeURIComponent(`${i.titulo}: ${i.idea}`)}`)
                      }
                    >
                      Crear campaña con esta idea
                    </button>
                  </article>
                ))}
              </div>
            </>
          )}

          {!!radar?.fuentes.length && (
            <div className="admin-section radar-bloque">
              <h4 className="radar-titulo">Fuentes</h4>
              <p className="radar-ayuda">Fuentes encontradas por la búsqueda de Google</p>
              <ul className="radar-fuentes">
                {radar.fuentes.map((f) => (
                  <li key={f.url}>
                    <a href={f.url} target="_blank" rel="noreferrer">{f.titulo || f.url}</a>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}

      {confirmando && (
        <ConfirmDialog
          title="Actualizar radar"
          confirmLabel="Actualizar"
          message={
            <ul className="marketing-confirmar">
              <li>La IA busca en Google lo que ofrecen y anuncian tus competidores.</li>
              <li>Tarda entre 30 y 60 segundos.</li>
              <li>Lo que no tenga fuente se marca como suposición.</li>
            </ul>
          }
          onConfirm={() => {
            setConfirmando(false);
            actualizar();
          }}
          onCancel={() => setConfirmando(false)}
        />
      )}
    </div>
  );
}

function Dato({ titulo, texto }: { titulo: string; texto: string }) {
  return (
    <div className="radar-dato">
      <span className="radar-dato-titulo">{titulo}</span>
      <p>{texto}</p>
    </div>
  );
}
