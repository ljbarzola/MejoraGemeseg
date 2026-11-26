import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, HelpCircle, ImagePlus, Wand2, X, Send } from 'lucide-react';
import PageHeader from '../../components/common/PageHeader';
import PageTabs from '../../components/common/PageTabs';
import ConfirmDialog from '../../components/common/ConfirmDialog';
import MarketingProgreso from '../../components/marketing/MarketingProgreso';
import RowActionsMenu from '../../components/common/RowActionsMenu';
import ErrorAviso from '../../components/marketing/ErrorAviso';
import MarketingAyuda from '../../components/marketing/MarketingAyuda';
import EstadoMarketing from '../../components/marketing/EstadoMarketing';
import MarketingCalendario from '../../components/marketing/MarketingCalendario';
import MarketingMedicion from '../../components/marketing/MarketingMedicion';
import PiezaVistaPrevia from '../../components/marketing/PiezaVistaPrevia';
import { etiquetaCanal, etiquetaOrigen, etiquetaTipo, fechaMarketing } from '../../components/marketing/marketingEtiquetas';
import { ESTADOS_CONEXION, canalPorClave, claveDeCanal } from '../../components/marketing/marketingCanales';
import {
  listarConexiones,
  publicarEnvio,
  publicarTodo,
  aprobarCampania,
  crearCampania,
  descartarPieza,
  editarPieza,
  getCampania,
  regenerarCampania,
  desaprobarCampania,
  generarImagenPieza,
  generarVideoPieza,
  listarEnviosDeCampana,
  prepararEnvios,
  omitirEnvio,
  recuperarPieza,
} from '../../services/marketing.service';
import type { MarketingCampaniaDetalle, MarketingConexion, MarketingEnvio, MarketingPieza } from '../../types/marketing';
import '../../styles/marketing.css';

type TabKey = 'resumen' | 'piezas' | 'calendario' | 'medicion' | 'envios';

export default function MarketingCampaniaPage() {
  const { id } = useParams();
  const campaniaId = Number(id);
  const navigate = useNavigate();
  const [detalle, setDetalle] = useState<MarketingCampaniaDetalle | null>(null);
  const [error, setError] = useState('');
  const [procesando, setProcesando] = useState(false);
  const [tab, setTab] = useState<TabKey>('resumen');
  const [editando, setEditando] = useState<Record<number, string>>({});
  const [ayuda, setAyuda] = useState(false);
  const [envios, setEnvios] = useState<MarketingEnvio[]>([]);
  const [confirmandoAprobar, setConfirmandoAprobar] = useState(false);
  const [confirmandoDesaprobar, setConfirmandoDesaprobar] = useState(false);
  const [confirmandoMensajes, setConfirmandoMensajes] = useState(false);
  const [confirmandoImagen, setConfirmandoImagen] = useState<MarketingPieza | null>(null);
  const [confirmandoVideo, setConfirmandoVideo] = useState<MarketingPieza | null>(null);
  const [confirmandoDuplicar, setConfirmandoDuplicar] = useState(false);
  const [regenerando, setRegenerando] = useState(false);
  const [guardados, setGuardados] = useState<Record<number, boolean>>({});
  const [accionTexto, setAccionTexto] = useState('');
  const [rehaciendo, setRehaciendo] = useState<MarketingPieza | null>(null);
  const [conexiones, setConexiones] = useState<MarketingConexion[]>([]);
  const [programando, setProgramando] = useState<MarketingEnvio | null>(null);
  const [confirmandoPublicarTodo, setConfirmandoPublicarTodo] = useState(false);

  useEffect(() => {
    getCampania(campaniaId)
      .then(setDetalle)
      .catch((err: any) => setError(err.response?.data?.message || 'No se pudo cargar la campaña.'));
  }, [campaniaId]);

  // Mientras Veo prepara un video se vuelve a pedir la campaña cada pocos segundos hasta que termine.
  const generandoArchivo = !!detalle?.piezas.some((p) => p.estadoArchivo === 'GENERANDO');
  useEffect(() => {
    if (!generandoArchivo) return;
    const temporizador = setInterval(() => {
      getCampania(campaniaId).then(setDetalle).catch(() => undefined);
    }, 6000);
    return () => clearInterval(temporizador);
  }, [generandoArchivo, campaniaId]);

  useEffect(() => {
    listarEnviosDeCampana(campaniaId)
      .then(setEnvios)
      .catch((err: any) => setError(err.response?.data?.message || 'No se pudo cargar la cola de envíos.'));
    if (tab === 'envios') listarConexiones().then(setConexiones).catch(() => undefined);
  }, [tab, campaniaId]);

  const conexionDe = (canal: string | null | undefined) => {
    const clave = claveDeCanal(canal);
    return { clave, info: canalPorClave(clave), conexion: conexiones.find((c) => c.canal === clave) };
  };

  const enviosAccion = async (fn: () => Promise<MarketingEnvio[]>, texto: string, mensaje: string) => {
    setProcesando(true);
    setAccionTexto(texto);
    setError('');
    try {
      setEnvios(await fn());
    } catch (err: any) {
      setError(err.response?.data?.message || mensaje);
    } finally {
      setProcesando(false);
      setAccionTexto('');
    }
  };

  const accion = async (
    fn: () => Promise<MarketingCampaniaDetalle>,
    mensaje: string,
    texto = 'Guardando cambios...',
  ) => {
    setProcesando(true);
    setAccionTexto(texto);
    setError('');
    try {
      setDetalle(await fn());
    } catch (err: any) {
      setError(err.response?.data?.message || mensaje);
    } finally {
      setProcesando(false);
      setAccionTexto('');
    }
  };

  const guardarPieza = async (pieza: MarketingPieza) => {
    setProcesando(true);
    setAccionTexto('Guardando el texto de la pieza...');
    setError('');
    try {
      setDetalle(await editarPieza(pieza.id, editando[pieza.id] ?? pieza.contenido, pieza.titulo || undefined));
      setEditando((prev) => {
        const copia = { ...prev };
        delete copia[pieza.id];
        return copia;
      });
      setGuardados((prev) => ({ ...prev, [pieza.id]: true }));
    } catch (err: any) {
      setError(err.response?.data?.message || 'No se pudo guardar la pieza.');
    } finally {
      setProcesando(false);
      setAccionTexto('');
    }
  };

  const copiar = async (valor: string) => {
    try {
      await navigator.clipboard.writeText(valor);
    } catch {
      setError('El navegador no permitió copiar. Selecciona el texto y cópialo a mano.');
    }
  };

  const duplicar = async () => {
    if (!detalle) return;
    setProcesando(true);
    setAccionTexto('Armando la campaña duplicada...');
    setError('');
    try {
      // Con duplicarDe se copian también los canales y el presupuesto; se abre la nueva (antes quedaba la URL vieja).
      const nueva = await crearCampania(detalle.idea, detalle.objetivo || undefined, detalle.id);
      navigate(`/marketing/campanias/${nueva.id}`);
    } catch (err: any) {
      setError(err.response?.data?.message || 'No se pudo duplicar la campaña.');
    } finally {
      setProcesando(false);
      setAccionTexto('');
    }
  };

  const aprobar = () => accion(
    () => aprobarCampania(campaniaId),
    'No se pudo aprobar la campaña.',
    'Aprobando, guardando el plan y generando las imágenes (puede tardar un minuto)...',
  );

  const desaprobar = () => accion(
    () => desaprobarCampania(campaniaId),
    'No se pudo quitar la aprobación.',
    'Quitando la aprobación...',
  );
  const regenerar = async (mensaje?: string) => {
    setRegenerando(false);
    setProcesando(true);
    setAccionTexto('Regenerando el plan: rearmando la estrategia y las piezas...');
    setError('');
    try {
      setDetalle(await regenerarCampania(campaniaId, mensaje));
      setTab('resumen');
      setGuardados({});
    } catch (err: any) {
      setError(err.response?.data?.message || 'No se pudo regenerar el plan.');
    } finally {
      setProcesando(false);
      setAccionTexto('');
    }
  };

  const generarImagen = (pieza: MarketingPieza, feedback?: string) =>
    accion(
      () => generarImagenPieza(pieza.id, feedback),
      'No se pudo generar la imagen.',
      feedback ? 'La IA está rehaciendo la imagen con tus comentarios...' : 'Generando la imagen con IA...',
    );

  const generarVideo = (pieza: MarketingPieza) =>
    accion(() => generarVideoPieza(pieza.id), 'No se pudo pedir el video.', 'Pidiendo el video a la IA...');

  const preparar = async () => {
    setProcesando(true);
    setAccionTexto('Preparando la cola de envíos...');
    setError('');
    try {
      setEnvios(await prepararEnvios(campaniaId));
      setTab('envios');
    } catch (err: any) {
      setError(err.response?.data?.message || 'No se pudo preparar la cola de envíos.');
    } finally {
      setProcesando(false);
      setAccionTexto('');
    }
  };

  const omitir = async (envioId: number) => {
    setProcesando(true);
    setAccionTexto('Actualizando la cola de envíos...');
    try {
      setEnvios(await omitirEnvio(envioId));
    } catch (err: any) {
      setError(err.response?.data?.message || 'No se pudo omitir el envío.');
    } finally {
      setProcesando(false);
      setAccionTexto('');
    }
  };

  const aprobada = detalle?.estado === 'APROBADA';

  const secciones: Array<[string, string | null]> = [
    ['Resumen', detalle?.plan?.resumen ?? null],
    ['Público', detalle?.plan?.publico ?? null],
    ['Mercado', detalle?.plan?.mercado ?? null],
    ['Canales', detalle?.plan?.canales ?? null],
    ['Presupuesto', detalle?.plan?.presupuesto ?? null],
    ['Avisos', detalle?.plan?.advertencias ?? null],
  ];

  return (
    <div className="page-container">
      <div className="page-header-row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 10 }}>
        <button
          className="cacao-back-btn"
          onClick={() => navigate('/marketing/campanias')}
          style={{ alignSelf: 'flex-start' }}
        >
          <ArrowLeft size={16} strokeWidth={2.4} /> Volver
        </button>
        <PageHeader
          eyebrow="Marketing"
          title={detalle?.nombre || detalle?.idea || 'Campaña'}
          description={
            <>
              {detalle?.objetivo ? `Objetivo: ${detalle.objetivo}` : 'Plan generado a partir de una idea.'}
              {detalle && <> {' '}<EstadoMarketing estado={detalle.estado} /></>}
            </>
          }
          actions={
            <>
              <button
                type="button"
                className="btn-secondary btn-icon-toolbar"
                onClick={() => setAyuda(true)}
                title="Cómo funciona una campaña"
                aria-label="Cómo funciona una campaña"
              >
                <HelpCircle size={18} />
              </button>
              <RowActionsMenu
                boton={{ texto: 'Más acciones', className: 'btn-secondary' }}
                actions={[
                  { label: 'Duplicar idea', hint: 'Armar otra campaña con la misma idea.', onClick: () => setConfirmandoDuplicar(true), disabled: !detalle || procesando },
                  { label: 'Regenerar plan', hint: 'Vuelve a generar el plan y las piezas; puedes pedir cambios.', onClick: () => setRegenerando(true), disabled: !detalle || procesando || detalle.estado === 'APROBADA' },
                ]}
              />
              {aprobada ? (
                <button
                  className="btn-secondary marketing-boton-estado"
                  onClick={() => setConfirmandoDesaprobar(true)}
                  disabled={procesando}
                >
                  Quitar aprobación
                </button>
              ) : (
                <button
                  className="auth-btn marketing-boton-estado"
                  onClick={() => setConfirmandoAprobar(true)}
                  disabled={procesando || !detalle}
                >
                  Aprobar todo
                </button>
              )}
            </>
          }
        />
      </div>

      <PageTabs<TabKey>
        label="Partes del plan"
        value={tab}
        onChange={setTab}
        tabs={[
          { key: 'resumen', label: 'Resumen' },
          { key: 'piezas', label: `Piezas (${detalle?.piezas.length ?? 0})` },
          { key: 'calendario', label: 'Calendario' },
          { key: 'medicion', label: 'Medición' },
          { key: 'envios', label: `Para publicar (${envios.length})` },
        ]}
      />
      <ErrorAviso mensaje={error} />
      {accionTexto && <MarketingProgreso texto={accionTexto} />}

      {!detalle ? (
        <div className="loading-state">Cargando plan...</div>
      ) : tab === 'resumen' ? (
        <div className="admin-section" style={{ padding: '18px' }}>
          {(detalle.canales?.claves.length || detalle.canales?.extras.length || detalle.presupuestoMensual || detalle.fechaInicio) ? (
            <div className="marketing-bloque" style={{ marginBottom: 18, marginTop: 0 }}>
              <div className="marketing-propuesta-pie" style={{ gap: 10 }}>
                {detalle.origen === 'AGENTE' && <span className="marketing-senal" style={{ margin: 0 }}>✨ Propuesta por la IA</span>}
                {detalle.canales?.claves.map((k) => {
                  const c = canalPorClave(k);
                  return c ? <span className="marketing-canal-mini" key={k}>{c.icono} {c.nombre}</span> : null;
                })}
                {detalle.canales?.extras.map((e) => {
                  // Las campañas viejas guardaron el extra como texto suelto.
                  const extra = typeof e === 'string' ? { nombre: e, requiereIntegracion: true, motivo: '' } : e;
                  return (
                    <span
                      className="marketing-canal-mini"
                      key={extra.nombre}
                      title={extra.motivo || (extra.requiereIntegracion ? 'Canal pedido al equipo para habilitarlo' : 'No necesita conexión: la IA prepara el material')}
                    >
                      ➕ {extra.nombre} · {extra.requiereIntegracion ? 'pedido al equipo' : 'sin conexión, la IA prepara el material'}
                    </span>
                  );
                })}
                {detalle.presupuestoMensual ? <span className="marketing-canal-mini">💵 ${detalle.presupuestoMensual} al mes</span> : null}
                {detalle.fechaInicio && (
                  <span className="marketing-canal-mini">
                    📅 Empieza el {new Date(`${detalle.fechaInicio}T12:00:00`).toLocaleDateString('es-EC', { day: 'numeric', month: 'long' })}
                  </span>
                )}
              </div>
            </div>
          ) : null}
          {detalle.nombre && detalle.idea && (
            <section className="marketing-plan-section">
              <h4>Lo que pediste</h4>
              <p>{detalle.idea}</p>
            </section>
          )}
          {secciones.map(([titulo, valor]) => valor && (
            <section className="marketing-plan-section" key={titulo}>
              <h4>{titulo}</h4>
              <p>{valor}</p>
            </section>
          ))}
          {detalle.entrevista.length > 0 && (
            <section className="marketing-plan-section">
              <h4>Lo que me contaste</h4>
              {detalle.entrevista.map((r) => (
                <p key={r.pregunta} style={{ marginBottom: 4 }}>
                  <strong>{r.pregunta}</strong> {r.respuesta}
                </p>
              ))}
            </section>
          )}
          {!detalle.plan && <p style={{ color: '#64748b' }}>Esta campaña todavía no tiene plan guardado.</p>}
        </div>
      ) : tab === 'piezas' ? (
        <div className="admin-section" style={{ padding: '18px' }}>
          {detalle.piezas.length === 0 && <p style={{ color: '#64748b' }}>No se generaron piezas.</p>}
          {aprobada && (
            <p className="marketing-aviso-bloqueo">
              La campaña está aprobada, por eso las piezas no se pueden editar. Para cambiar algo usa «Quitar aprobación».
            </p>
          )}
          {detalle.piezas.map((p: MarketingPieza) => {
            const clase = p.estado === 'APROBADO'
              ? 'marketing-pieza marketing-pieza-aprobada'
              : p.estado === 'DESCARTADO'
                ? 'marketing-pieza marketing-pieza-descartada'
                : 'marketing-pieza';
            const hayCambios = editando[p.id] !== undefined && editando[p.id] !== p.contenido;
            return (
              <section className={clase} key={p.id}>
                <div className="marketing-pieza-cabecera">
                  <strong>
                    {p.titulo || etiquetaTipo(p.tipo)}{' '}
                    <span className="marketing-pieza-canal">· {etiquetaTipo(p.tipo)} · {etiquetaCanal(p.canal)}</span>
                  </strong>
                  <span className={`marketing-origen marketing-origen--${(p.fuenteDato || 'INFERENCIA').toLowerCase()}`} title="De dónde sale lo que dice esta pieza">
                    {etiquetaOrigen(p.fuenteDato)}
                  </span>
                  <EstadoMarketing estado={p.estado} />
                </div>
                <div className="marketing-estudio">
                <PiezaVistaPrevia
                  pieza={p}
                  texto={editando[p.id] ?? p.contenido}
                  puedeGenerar={!procesando && p.estado !== 'DESCARTADO'}
                  onGenerarImagen={() => (p.tipo === 'video' ? setConfirmandoVideo(p) : setConfirmandoImagen(p))}
                />
                <div>
                <div className="marketing-nota" style={{ marginTop: 4 }}>
                  {p.fechaPublicacion ? `Sale el ${new Date(`${p.fechaPublicacion}T12:00:00`).toLocaleDateString('es-EC', { weekday: 'long', day: 'numeric', month: 'long' })}` : ''}
                </div>
                <textarea
                  className="form-textarea"
                  rows={8}
                  value={editando[p.id] ?? p.contenido}
                  disabled={p.estado === 'DESCARTADO' || procesando || aprobada}
                  onChange={(e) => {
                    setEditando((prev) => ({ ...prev, [p.id]: e.target.value }));
                    setGuardados((prev) => ({ ...prev, [p.id]: false }));
                  }}
                />
                {p.feedbackImagen && (
                  <details style={{ marginTop: 6 }}>
                    <summary className="marketing-nota" style={{ cursor: 'pointer' }}>Comentarios que le diste a la IA para la imagen</summary>
                    <ul className="marketing-feedback-historial">
                      {p.feedbackImagen.split('\n').filter(Boolean).map((f, i) => <li key={i}>{f}</li>)}
                    </ul>
                  </details>
                )}
                <div className="marketing-pieza-acciones">
                  {!aprobada && (
                    <button
                      className="btn-secondary"
                      disabled={procesando || p.estado === 'DESCARTADO' || !hayCambios}
                      title="Guarda el texto editado en esta pieza. No aprueba ni envía nada."
                      onClick={() => guardarPieza(p)}
                    >
                      Guardar cambios
                    </button>
                  )}
                  {guardados[p.id] && !hayCambios && (
                    <span className="marketing-guardado">Guardado</span>
                  )}
                  <button className="btn-secondary" disabled={procesando} onClick={() => copiar(editando[p.id] ?? p.contenido)}>
                    Copiar
                  </button>
                  {!aprobada && (p.estado === 'DESCARTADO' ? (
                    <button
                      className="btn-secondary"
                      disabled={procesando}
                      title="Vuelve a poner la pieza en borrador para incluirla otra vez."
                      onClick={() => accion(() => recuperarPieza(p.id), 'No se pudo recuperar la pieza.', 'Recuperando la pieza...')}
                    >
                      Recuperar
                    </button>
                  ) : (
                    <button
                      className="btn-secondary"
                      disabled={procesando}
                      onClick={() => accion(() => descartarPieza(p.id), 'No se pudo descartar la pieza.')}
                    >
                      Descartar
                    </button>
                  ))}
                  {p.tipo !== 'video' && (!p.archivoUrl || p.estadoArchivo === 'ERROR') && (
                    <button
                      className="btn-secondary marketing-boton-ia"
                      disabled={procesando || p.estado === 'DESCARTADO' || p.estadoArchivo === 'GENERANDO'}
                      onClick={() => setConfirmandoImagen(p)}
                    >
                      <ImagePlus size={14} /> {p.estadoArchivo === 'ERROR' ? 'Reintentar imagen' : 'Generar imagen con IA'}
                    </button>
                  )}
                  {p.tipo !== 'video' && p.archivoUrl && p.estadoArchivo !== 'ERROR' && !aprobada && (
                    <button
                      className="btn-secondary marketing-boton-ia"
                      disabled={procesando || p.estado === 'DESCARTADO' || p.estadoArchivo === 'GENERANDO'}
                      onClick={() => setRehaciendo(p)}
                      title="Dile a la IA qué cambiar y la vuelve a hacer."
                    >
                      <Wand2 size={14} /> Rehacer imagen con comentarios
                    </button>
                  )}
                  {p.tipo === 'video' && (!p.archivoUrl || p.estadoArchivo === 'ERROR') && (
                    <button
                      className="btn-secondary"
                      disabled={procesando || p.estado === 'DESCARTADO' || p.estadoArchivo === 'GENERANDO'}
                      onClick={() => setConfirmandoVideo(p)}
                    >
                      {p.estadoArchivo === 'ERROR' ? 'Reintentar video' : 'Generar video'}
                    </button>
                  )}
                </div>
                </div>
                </div>
              </section>
            );
          })}
        </div>
      ) : tab === 'calendario' ? (
        <div className="admin-section" style={{ padding: '18px' }}>
          <MarketingCalendario piezas={detalle.piezas} resumen={detalle.plan?.calendario ?? null} />
          <p style={{ fontSize: '0.8rem', color: '#64748b', marginTop: '14px' }}>
            Es el orden que propuso el agente: semana y día de cada pieza. Las piezas descartadas no aparecen.
          </p>
        </div>
      ) : tab === 'medicion' ? (
        <div className="admin-section" style={{ padding: '18px' }}>
          <MarketingMedicion plan={detalle.plan} />
          <p style={{ fontSize: '0.8rem', color: '#64748b', marginTop: '14px' }}>
            Todavía no hay resultados: los valores se llenarán con los contactos y las cotizaciones de Ventas cuando la publicación esté conectada.
          </p>
        </div>
      ) : (
        <div className="admin-section" style={{ padding: '18px' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center', marginBottom: 14 }}>
            <button
              className={envios.length ? 'btn-secondary' : 'auth-btn'}
              onClick={() => setConfirmandoMensajes(true)}
              disabled={procesando || !aprobada}
              title={aprobada ? 'Deja cada pieza aprobada lista para publicar, con su fecha del calendario.' : 'Aprueba la campaña primero.'}
            >
              {envios.length ? 'Volver a preparar' : 'Preparar para publicar'}
            </button>
            {envios.some((e) => e.estado === 'LISTO') && (
              <button className="auth-btn marketing-boton-ia" onClick={() => setConfirmandoPublicarTodo(true)} disabled={procesando}>
                <Send size={14} /> Publicar todo según el calendario
              </button>
            )}
            {!aprobada && <span style={{ fontSize: '0.82rem', color: '#64748b' }}>Disponible cuando la campaña esté aprobada.</span>}
          </div>
          {conexiones.length > 0 && (
            <div className="marketing-bloque" style={{ marginBottom: 14, marginTop: 0 }}>
              <div className="marketing-propuesta-pie" style={{ gap: 8 }}>
                <strong style={{ fontSize: '0.84rem' }}>Canales de esta campaña:</strong>
                {[...new Set((detalle.piezas.map((p) => p.canalClave ?? claveDeCanal(p.canal))).filter(Boolean) as string[])].map((k) => {
                  const c = conexiones.find((x) => x.canal === k);
                  const est = ESTADOS_CONEXION[c?.estado ?? 'NO_CONECTADO'];
                  return (
                    <span key={k} className="marketing-canal-mini">
                      {canalPorClave(k)?.icono} {canalPorClave(k)?.corto} ·{' '}
                      <span className={`status-badge marketing-estado--${est.clase}`} style={{ padding: '0 6px' }}>{est.texto}</span>
                    </span>
                  );
                })}
                <button className="btn-secondary" style={{ marginLeft: 'auto' }} onClick={() => navigate('/marketing/integraciones')}>
                  Conectar canales
                </button>
              </div>
              <p className="marketing-nota" style={{ marginTop: 6 }}>
                En modo demostración «Publicar» simula todo el flujo sin que nada salga a internet. Sin conexión, la pieza queda lista para publicarla con un clic en la plataforma y se marca como publicada. Los anuncios pagados siempre quedan creados en pausa: los activa una persona.
              </p>
            </div>
          )}
          {envios.length === 0 ? (
            <p style={{ color: '#64748b' }}>Todavía no hay piezas preparadas. Aprueba la campaña y pulsa «Preparar para publicar».</p>
          ) : (
            <div className="tasks-table-wrapper">
              <table className="tasks-table">
                <thead>
                  <tr>
                    <th>Pieza</th>
                    <th>Canal</th>
                    <th>Estado</th>
                    <th>Fecha</th>
                    <th>Nota</th>
                    <th className="col-acciones col-acciones--ancha"><span className="visually-hidden">Acciones</span></th>
                  </tr>
                </thead>
                <tbody>
                  {envios.map((e) => {
                    const { info, conexion } = conexionDe(e.canal);
                    const demo = conexion?.estado === 'DEMO' || conexion?.estado === 'CONECTADO';
                    const cerrada = ['PUBLICADO', 'OMITIDO', 'EN_PAUSA'].includes(e.estado);
                    return (
                      <tr key={e.id}>
                        <td>{e.pieza || `Pieza ${e.pieceId}`}</td>
                        <td>{info ? `${info.icono} ${info.corto}` : etiquetaCanal(e.canal)}</td>
                        <td><EstadoMarketing estado={e.estado} /></td>
                        <td style={{ whiteSpace: 'nowrap' }}>
                          {e.publicadoEn
                            ? fechaMarketing(e.publicadoEn)
                            : e.programadoPara
                              ? fechaMarketing(e.programadoPara)
                              : e.fechaPublicacion
                                ? new Date(`${e.fechaPublicacion}T12:00:00`).toLocaleDateString('es-EC', { day: 'numeric', month: 'short' })
                                : '—'}
                        </td>
                        <td style={{ fontSize: '0.8rem', color: '#64748b' }}>{e.motivo}</td>
                        <td className="col-acciones col-acciones--ancha">
                          <div className="acciones-iconos" style={{ justifyContent: 'flex-end' }}>
                            {!cerrada && (
                              <button
                                className="auth-btn marketing-fila-boton"
                                disabled={procesando}
                                title={demo ? 'Simula la publicación (modo demostración).' : 'Canal sin conectar: la marca como publicada a mano.'}
                                onClick={() => enviosAccion(() => publicarEnvio(e.id), 'Publicando...', 'No se pudo publicar.')}
                              >
                                {info?.key === 'GOOGLE_ADS' && demo ? 'Crear en pausa' : demo ? 'Publicar ya' : 'Marcar publicada'}
                              </button>
                            )}
                            <RowActionsMenu
                              actions={[
                                { label: 'Programar', hint: 'Elegir el día y la hora en que sale.', disabled: cerrada || procesando, onClick: () => setProgramando(e) },
                                { label: 'Copiar texto', hint: 'Para pegarlo en la plataforma.', disabled: !e.contenido, onClick: () => copiar(e.contenido || '') },
                                ...(info && canalPorClave(info.key) && conexion?.administrador
                                  ? [{ label: `Abrir ${info.corto}`, hint: 'Abre la plataforma en otra pestaña.', onClick: () => window.open(conexion.administrador!, '_blank', 'noopener') }]
                                  : []),
                                { label: 'Omitir', hint: 'No publicar esta pieza.', disabled: procesando || e.estado === 'OMITIDO', onClick: () => omitir(e.id) },
                              ]}
                            />
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {confirmandoAprobar && (
        <ConfirmDialog
          title="Aprobar campaña"
          confirmLabel="Aprobar y guardar"
          message={
            <ul className="marketing-confirmar">
              <li>Las piezas que no descartaste quedarán marcadas como aprobadas.</li>
              <li>Se guardará el plan y se creará una tarea y una notificación para ti.</li>
              <li>Las piezas de imagen se generarán solas con IA (puede tardar hasta un minuto).</li>
              <li>Una vez aprobada, la campaña no se puede editar: para cambiar algo usas «Quitar aprobación».</li>
              <li>Si la empresa tiene carpeta de Marketing en Drive, se subirá el kit del plan.</li>
            </ul>
          }
          onConfirm={() => {
            setConfirmandoAprobar(false);
            aprobar();
          }}
          onCancel={() => setConfirmandoAprobar(false)}
        />
      )}
      {confirmandoDesaprobar && (
        <ConfirmDialog
          title="Quitar aprobación"
          confirmLabel="Quitar aprobación"
          message={
            <ul className="marketing-confirmar">
              <li>Las piezas aprobadas vuelven a borrador.</li>
              <li>Se borra la lista de piezas que hubieras preparado para publicar.</li>
              <li>Podrás editar, regenerar y volver a aprobar cuando quieras.</li>
            </ul>
          }
          onConfirm={() => {
            setConfirmandoDesaprobar(false);
            desaprobar();
          }}
          onCancel={() => setConfirmandoDesaprobar(false)}
        />
      )}
      {confirmandoMensajes && (
        <ConfirmDialog
          title="Preparar para publicar"
          confirmLabel="Preparar"
          message={
            <ul className="marketing-confirmar">
              <li>Deja cada pieza aprobada lista, con su fecha del calendario, para publicarla o programarla.</li>
              <li>Todavía no sale nada: publicas después, pieza por pieza o todo junto.</li>
              <li>Si ya la habías preparado, se vuelve a armar la lista.</li>
            </ul>
          }
          onConfirm={() => {
            setConfirmandoMensajes(false);
            preparar();
          }}
          onCancel={() => setConfirmandoMensajes(false)}
        />
      )}
      {confirmandoVideo && (
        <ConfirmDialog
          title="Generar video con IA"
          confirmLabel="Generar video"
          message={
            <ul className="marketing-confirmar">
              <li>Se crea con IA (Veo) un video corto de 6 segundos, sin audio, a partir del guion de «{confirmandoVideo.titulo || 'la pieza'}».</li>
              <li>Tarda unos minutos. Puedes seguir trabajando: aparecerá en la pieza cuando termine.</li>
              <li>Tiene un costo en la cuenta de Google Cloud de la empresa y hay un tope diario de videos.</li>
            </ul>
          }
          onConfirm={() => {
            const pieza = confirmandoVideo;
            setConfirmandoVideo(null);
            if (pieza) generarVideo(pieza);
          }}
          onCancel={() => setConfirmandoVideo(null)}
        />
      )}
      {confirmandoImagen && (
        <ConfirmDialog
          title="Generar imagen con IA"
          confirmLabel="Generar imagen"
          message={
            <ul className="marketing-confirmar">
              <li>La IA crea la pieza completa de «{confirmandoImagen.titulo || etiquetaTipo(confirmandoImagen.tipo)}»: la escena, el titular escrito y los colores de tu marca.</li>
              <li>Tarda unos segundos. Si algo no te gusta, usa «Rehacer imagen con comentarios» y dile qué cambiar.</li>
            </ul>
          }
          onConfirm={() => {
            const pieza = confirmandoImagen;
            setConfirmandoImagen(null);
            if (pieza) generarImagen(pieza);
          }}
          onCancel={() => setConfirmandoImagen(null)}
        />
      )}
      {confirmandoDuplicar && (
        <ConfirmDialog
          title="Duplicar campaña"
          confirmLabel="Crear campaña"
          message={
            <ul className="marketing-confirmar">
              <li>Se arma una campaña nueva con la misma idea y el mismo objetivo. El agente vuelve a trabajar (30 a 60 segundos).</li>
              <li>La campaña actual no cambia.</li>
            </ul>
          }
          onConfirm={() => {
            setConfirmandoDuplicar(false);
            duplicar();
          }}
          onCancel={() => setConfirmandoDuplicar(false)}
        />
      )}
      {regenerando && (
        <RegenerarModal
          onClose={() => setRegenerando(false)}
          onRegenerar={(mensaje) => regenerar(mensaje)}
        />
      )}
      {rehaciendo && (
        <RehacerImagenModal
          pieza={rehaciendo}
          onClose={() => setRehaciendo(null)}
          onEnviar={(feedback) => {
            const pieza = rehaciendo;
            setRehaciendo(null);
            generarImagen(pieza, feedback);
          }}
        />
      )}
      {programando && (
        <ProgramarModal
          envio={programando}
          onClose={() => setProgramando(null)}
          onProgramar={(cuando) => {
            const envio = programando;
            setProgramando(null);
            enviosAccion(() => publicarEnvio(envio.id, cuando), 'Programando...', 'No se pudo programar.');
          }}
        />
      )}
      {confirmandoPublicarTodo && (
        <ConfirmDialog
          title="Publicar todo según el calendario"
          confirmLabel="Publicar"
          message={
            <ul className="marketing-confirmar">
              <li>Cada pieza lista sale en su fecha del calendario a las 9:00. Si la fecha ya pasó, sale ahora.</li>
              <li>En los canales en modo demostración se simula: nada sale a internet.</li>
              <li>En los canales sin conectar, la pieza queda marcada para publicarla a mano ese día.</li>
              <li>Los anuncios pagados quedan creados en pausa: una persona revisa el gasto y los activa.</li>
            </ul>
          }
          onConfirm={() => {
            setConfirmandoPublicarTodo(false);
            enviosAccion(() => publicarTodo(campaniaId), 'Publicando la campaña...', 'No se pudo publicar la campaña.');
          }}
          onCancel={() => setConfirmandoPublicarTodo(false)}
        />
      )}
      {ayuda && <MarketingAyuda onClose={() => setAyuda(false)} />}
    </div>
  );
}

const EJEMPLOS_IMAGEN = [
  'Más luminosa y moderna',
  'Que se vea gente real trabajando',
  'Titular más grande',
  'Menos texto en la imagen',
  'Usa más los colores de la marca',
  'Ambiente nocturno',
];

function RehacerImagenModal({
  pieza,
  onClose,
  onEnviar,
}: {
  pieza: MarketingPieza;
  onClose: () => void;
  onEnviar: (feedback: string) => void;
}) {
  const [texto, setTexto] = useState('');
  return (
    <div className="modal-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal modal-ventas-sm">
        <div className="modal-header">
          <h3>Rehacer imagen con IA</h3>
          <button className="modal-close" onClick={onClose} aria-label="Cerrar"><X size={16} /></button>
        </div>
        <div className="modal-body">
          <p className="marketing-nota">
            Dile qué cambiar de «{pieza.titulo || 'la imagen'}». La IA toma la imagen actual y la corrige con tus comentarios.
          </p>
          <div className="marketing-chips" style={{ margin: '10px 0' }}>
            {EJEMPLOS_IMAGEN.map((e) => (
              <button key={e} type="button" className="marketing-chip"
                onClick={() => setTexto((prev) => (prev ? `${prev}. ${e}` : e))}>
                {e}
              </button>
            ))}
          </div>
          <div className="form-group">
            <label htmlFor="marketing-rehacer">Qué quieres cambiar</label>
            <textarea id="marketing-rehacer" rows={4} maxLength={1000} value={texto}
              onChange={(e) => setTexto(e.target.value)}
              placeholder="Ej. Cambia el fondo a una oficina y pon el titular arriba." />
          </div>
        </div>
        <div className="modal-actions">
          <button className="btn-secondary" onClick={onClose}>Cancelar</button>
          <button className="auth-btn" disabled={texto.trim().length < 3} onClick={() => onEnviar(texto.trim())}>
            Rehacer imagen
          </button>
        </div>
      </div>
    </div>
  );
}

function ProgramarModal({
  envio,
  onClose,
  onProgramar,
}: {
  envio: MarketingEnvio;
  onClose: () => void;
  onProgramar: (cuandoIso: string) => void;
}) {
  const [fecha, setFecha] = useState(envio.fechaPublicacion || new Date().toISOString().slice(0, 10));
  const [hora, setHora] = useState('09:00');
  const cuando = new Date(`${fecha}T${hora}:00-05:00`);
  const valido = !Number.isNaN(cuando.getTime()) && cuando.getTime() > Date.now();
  return (
    <div className="modal-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal modal-ventas-sm">
        <div className="modal-header">
          <h3>Programar publicación</h3>
          <button className="modal-close" onClick={onClose} aria-label="Cerrar"><X size={16} /></button>
        </div>
        <div className="modal-body">
          <p className="marketing-nota">«{envio.pieza || 'Pieza'}» saldrá el día y la hora que elijas (hora de Ecuador).</p>
          <div className="marketing-dos-columnas" style={{ marginTop: 10 }}>
            <div className="form-group">
              <label htmlFor="marketing-prog-fecha">Día</label>
              <input id="marketing-prog-fecha" type="date" className="form-input" value={fecha} onChange={(e) => setFecha(e.target.value)} />
            </div>
            <div className="form-group">
              <label htmlFor="marketing-prog-hora">Hora</label>
              <input id="marketing-prog-hora" type="time" className="form-input" value={hora} onChange={(e) => setHora(e.target.value)} />
            </div>
          </div>
          {!valido && <p className="marketing-nota" style={{ color: '#b91c1c' }}>Elige una fecha y hora futuras.</p>}
        </div>
        <div className="modal-actions">
          <button className="btn-secondary" onClick={onClose}>Cancelar</button>
          <button className="auth-btn" disabled={!valido} onClick={() => onProgramar(cuando.toISOString())}>Programar</button>
        </div>
      </div>
    </div>
  );
}

const EJEMPLOS_FEEDBACK = [
  'Enfócate en empresas industriales',
  'Menos texto y más foco en imágenes',
  'Usa solo WhatsApp y correo',
  'Tono más formal',
  'Añade un llamado a agendar una visita',
];

function RegenerarModal({
  onClose,
  onRegenerar,
}: {
  onClose: () => void;
  onRegenerar: (feedback: string) => void;
}) {
  const [texto, setTexto] = useState('');
  const [confirmando, setConfirmando] = useState(false);
  return (
    <>
      <div className="modal-overlay" onClick={onClose}>
        <div className="modal modal-ventas-sm" onClick={(e) => e.stopPropagation()}>
          <div className="modal-header">
            <h3>Regenerar plan</h3>
            <button className="modal-close" onClick={onClose} aria-label="Cerrar"><X size={16} /></button>
          </div>
          <div className="modal-body">
            <p style={{ fontSize: '0.88rem', color: '#475569', margin: 0 }}>
              Cuéntale qué quieres cambiar. Es opcional: si lo dejas vacío, el agente vuelve a armar el plan desde cero con la misma idea.
            </p>
            <div className="form-group">
              <label id="marketing-ejemplos">Ejemplos de qué pedir</label>
              <div className="marketing-chips" role="group" aria-labelledby="marketing-ejemplos">
                {EJEMPLOS_FEEDBACK.map((ejemplo) => (
                  <button
                    key={ejemplo}
                    type="button"
                    className="marketing-chip"
                    onClick={() => setTexto((prev) => (prev ? `${prev}\n${ejemplo}` : ejemplo))}
                  >
                    {ejemplo}
                  </button>
                ))}
              </div>
            </div>
            <div className="form-group">
              <label htmlFor="marketing-feedback">Qué quieres cambiar</label>
              <textarea
                id="marketing-feedback"
                rows={4}
                value={texto}
                maxLength={1000}
                onChange={(e) => setTexto(e.target.value)}
                placeholder="Ej. Enfócate en clientes industriales y quita la parte de redes sociales."
              />
            </div>
          </div>
          <div className="modal-actions">
            <button className="btn-secondary" onClick={onClose}>Cancelar</button>
            <button className="auth-btn" onClick={() => setConfirmando(true)}>
              Regenerar plan
            </button>
          </div>
        </div>
      </div>
      {confirmando && (
        <ConfirmDialog
          title="Regenerar plan"
          confirmLabel="Regenerar plan"
          danger
          message={
            <ul className="marketing-confirmar">
              <li>El agente de IA arma el plan de nuevo y <strong>reemplaza el plan y todas las piezas actuales</strong>.</li>
              <li>Lo que hayas editado en las piezas se pierde.</li>
              <li>Puede tardar entre 30 y 60 segundos.</li>
            </ul>
          }
          onConfirm={() => {
            setConfirmando(false);
            onRegenerar(texto.trim());
          }}
          onCancel={() => setConfirmando(false)}
        />
      )}
    </>
  );
}
