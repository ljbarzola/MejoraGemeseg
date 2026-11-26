import { useEffect, useMemo, useRef, useState } from 'react';
import { X, Sparkles, Plus, Pencil } from 'lucide-react';
import ConfirmDialog from '../common/ConfirmDialog';
import ErrorAviso from './ErrorAviso';
import MarketingProgreso from './MarketingProgreso';
import { CANALES_MARKETING, canalPorClave } from './marketingCanales';
import {
  clasificarCanalExtra,
  crearCampania,
  siguientePreguntaEntrevista,
  sugerirCanales,
} from '../../services/marketing.service';
import '../../styles/marketing-asistente.css';
import type {
  MarketingCampaniaDetalle,
  MarketingRespuestaEntrevista,
  MarketingSiguientePregunta,
  MarketingSugerenciaCanales,
} from '../../types/marketing';

export const OBJETIVOS = [
  'Dar a conocer un servicio',
  'Generar contactos',
  'Reactivar clientes',
  'Promocionar una oferta',
];

type Paso = 'idea' | 'entrevista' | 'canales' | 'detalles';
const PASOS: Array<{ key: Paso; label: string }> = [
  { key: 'idea', label: 'Idea' },
  { key: 'entrevista', label: 'Tu negocio' },
  { key: 'canales', label: 'Canales' },
  { key: 'detalles', label: 'Presupuesto y fechas' },
];

/** Una respuesta ya dada, con lo necesario para poder volver a ella y cambiarla. */
interface RespuestaHistorial extends MarketingRespuestaEntrevista {
  opciones: string[];
  seleccion: string[];
  texto: string;
}

/** Estado de la revisión de un canal extra: la IA dice si necesita conectarse a una herramienta. */
interface ClasificacionExtra {
  revisando: boolean;
  requiereIntegracion: boolean;
  motivo: string;
}

const MAX_RESPUESTA = 1000;

/** Opciones elegidas + texto libre, en una sola frase: «Opción A, Opción B. Texto libre». */
function componerRespuesta(seleccion: string[], texto: string): string {
  const opciones = seleccion.join(', ');
  const libre = texto.trim();
  if (opciones && libre) return `${opciones}. ${libre}`.slice(0, MAX_RESPUESTA);
  return (opciones || libre).slice(0, MAX_RESPUESTA);
}

function proximoLunes(): string {
  const d = new Date();
  const suma = d.getDay() === 1 ? 0 : (8 - d.getDay()) % 7;
  d.setDate(d.getDate() + suma);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Asistente de campaña: idea → entrevista corta → canales (la IA sugiere y explica; se puede pedir
 * un canal que no está) → presupuesto y fecha de inicio → el agente arma el plan y las piezas.
 */
export default function NuevaCampaniaModal({
  inicial,
  onClose,
  onCreada,
}: {
  inicial: { idea: string; objetivo: string };
  onClose: () => void;
  onCreada: (detalle: MarketingCampaniaDetalle) => void;
}) {
  const [idea, setIdea] = useState(inicial.idea);
  const [objetivo, setObjetivo] = useState(inicial.objetivo);
  const [paso, setPaso] = useState<Paso>('idea');
  const [historial, setHistorial] = useState<RespuestaHistorial[]>([]);
  const [pregunta, setPregunta] = useState<MarketingSiguientePregunta | null>(null);
  const [seleccion, setSeleccion] = useState<string[]>([]);
  const [borrador, setBorrador] = useState('');
  // Edición de la idea y el objetivo sin salir de la entrevista.
  const [editandoIdea, setEditandoIdea] = useState(false);
  const [ideaEdit, setIdeaEdit] = useState('');
  const [objetivoEdit, setObjetivoEdit] = useState('');
  const [cambioPendiente, setCambioPendiente] = useState<{ idea: string; objetivo: string } | null>(null);
  const [clasificacion, setClasificacion] = useState<Record<string, ClasificacionExtra>>({});
  const [pensando, setPensando] = useState(false);
  const [generando, setGenerando] = useState(false);
  const [pasoGeneracion, setPasoGeneracion] = useState(0);
  const [confirmando, setConfirmando] = useState(false);
  const [error, setError] = useState('');
  const [sugerencia, setSugerencia] = useState<MarketingSugerenciaCanales | null>(null);
  const [elegidos, setElegidos] = useState<string[]>([]);
  const [extras, setExtras] = useState<string[]>([]);
  const [otroCanal, setOtroCanal] = useState('');
  const [presupuesto, setPresupuesto] = useState('');
  const [fechaInicio, setFechaInicio] = useState(proximoLunes());
  const errorRef = useRef<HTMLDivElement>(null);
  const arrastreDesdeDentro = useRef(false);

  useEffect(() => {
    if (error) errorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [error]);

  useEffect(() => {
    if (!generando) {
      setPasoGeneracion(0);
      return;
    }
    const temporizador = setInterval(() => setPasoGeneracion((p) => Math.min(p + 1, 3)), 9000);
    return () => clearInterval(temporizador);
  }, [generando]);

  // Lo que la IA recibe: solo pregunta y respuesta (lo demás del historial es para la pantalla).
  const respuestas = useMemo<MarketingRespuestaEntrevista[]>(
    () => historial.map((h) => ({ pregunta: h.pregunta, respuesta: h.respuesta })),
    [historial],
  );

  /** Pide la siguiente pregunta; devuelve false si falló (para que quien llama pueda deshacer). */
  const pedirPregunta = async (
    lista: MarketingRespuestaEntrevista[],
    ideaUsada: string = idea,
    objetivoUsado: string = objetivo,
  ): Promise<boolean> => {
    setPensando(true);
    setError('');
    try {
      const siguiente = await siguientePreguntaEntrevista(ideaUsada.trim(), objetivoUsado.trim() || undefined, lista);
      if (siguiente.listo) {
        setPregunta(null);
        await irACanales(lista, ideaUsada, objetivoUsado);
      } else {
        setPregunta(siguiente);
        setSeleccion([]);
        setBorrador('');
      }
      return true;
    } catch (err: any) {
      setError(err.response?.data?.message || 'No se pudo preparar la siguiente pregunta. Puedes volver a intentarlo o seguir con lo que ya respondiste.');
      return false;
    } finally {
      setPensando(false);
    }
  };

  const irACanales = async (lista: MarketingRespuestaEntrevista[], ideaUsada: string = idea, objetivoUsado: string = objetivo) => {
    setPaso('canales');
    if (sugerencia) return;
    setPensando(true);
    setError('');
    try {
      const s = await sugerirCanales(ideaUsada.trim(), objetivoUsado.trim() || undefined, lista);
      setSugerencia(s);
      setElegidos(s.sugeridos.map((x) => x.canal));
    } catch (err: any) {
      setError(err.response?.data?.message || 'No se pudieron sugerir canales. Elígelos tú.');
    } finally {
      setPensando(false);
    }
  };

  const empezar = async () => {
    if (idea.trim().length < 4) {
      setError('Escribe la idea con al menos 4 caracteres.');
      return;
    }
    setPaso('entrevista');
    setHistorial([]);
    setSugerencia(null);
    setEditandoIdea(false);
    await pedirPregunta([]);
  };

  const alternarOpcion = (opcion: string) =>
    setSeleccion((prev) => (prev.includes(opcion) ? prev.filter((o) => o !== opcion) : [...prev, opcion]));

  // Nada se envía hasta pulsar «Siguiente»: se juntan las opciones marcadas y lo escrito.
  const responder = async () => {
    const respuesta = componerRespuesta(seleccion, borrador);
    if (!respuesta || !pregunta?.pregunta) return;
    const anterior = historial;
    const lista: RespuestaHistorial[] = [
      ...historial,
      { pregunta: pregunta.pregunta, respuesta, opciones: pregunta.opciones, seleccion, texto: borrador.trim() },
    ];
    setHistorial(lista);
    const ok = await pedirPregunta(lista.map((h) => ({ pregunta: h.pregunta, respuesta: h.respuesta })));
    // Si la IA no pudo preparar la siguiente, la respuesta no se da por enviada: queda lista para reintentar.
    if (!ok) setHistorial(anterior);
  };

  /**
   * Vuelve a la pregunta N para cambiar su respuesta. Las respuestas posteriores se descartan porque las
   * preguntas siguientes dependían de ella; los canales sugeridos también se vuelven a pedir.
   */
  const volverAPregunta = (indice: number) => {
    const entrada = historial[indice];
    if (!entrada || pensando) return;
    setHistorial(historial.slice(0, indice));
    setPregunta({ listo: false, pregunta: entrada.pregunta, opciones: entrada.opciones, numero: indice + 1, maximo });
    setSeleccion(entrada.seleccion);
    setBorrador(entrada.texto);
    setSugerencia(null);
    setElegidos([]);
    setError('');
  };

  const abrirEdicionIdea = () => {
    setIdeaEdit(idea);
    setObjetivoEdit(objetivo);
    setEditandoIdea(true);
    setError('');
  };

  const guardarIdea = () => {
    const nuevaIdea = ideaEdit.trim();
    if (nuevaIdea.length < 4) {
      setError('Escribe la idea con al menos 4 caracteres.');
      return;
    }
    const nuevoObjetivo = objetivoEdit.trim();
    if (nuevaIdea === idea.trim() && nuevoObjetivo === objetivo.trim()) {
      setEditandoIdea(false);
      return;
    }
    // Sin respuestas todavía no hay nada que perder: la pregunta se pide de nuevo con lo nuevo.
    if (historial.length === 0) {
      aplicarIdea(nuevaIdea, nuevoObjetivo, true);
      return;
    }
    setCambioPendiente({ idea: nuevaIdea, objetivo: nuevoObjetivo });
  };

  const aplicarIdea = async (nuevaIdea: string, nuevoObjetivo: string, reiniciar: boolean) => {
    setCambioPendiente(null);
    setEditandoIdea(false);
    setIdea(nuevaIdea);
    setObjetivo(nuevoObjetivo);
    // Los canales dependen de la idea: se piden otra vez cuando se llegue a ese paso.
    setSugerencia(null);
    setElegidos([]);
    if (reiniciar) {
      setHistorial([]);
      await pedirPregunta([], nuevaIdea, nuevoObjetivo);
    }
  };

  const alternar = (key: string) =>
    setElegidos((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));

  const agregarExtra = (nombre: string) => {
    const limpio = nombre.trim().slice(0, 80);
    if (!limpio || extras.some((e) => e.toLowerCase() === limpio.toLowerCase())) return;
    setExtras((prev) => [...prev, limpio].slice(0, 5));
    setOtroCanal('');
    setClasificacion((prev) => ({ ...prev, [limpio]: { revisando: true, requiereIntegracion: false, motivo: '' } }));
    clasificarCanalExtra(limpio)
      .then((r) =>
        setClasificacion((prev) => ({
          ...prev,
          [limpio]: { revisando: false, requiereIntegracion: !!r.requiereIntegracion, motivo: r.motivo || '' },
        })),
      )
      // Si la revisión falla, se asume que no necesita conexión: la IA prepara el material igual.
      .catch(() =>
        setClasificacion((prev) => ({ ...prev, [limpio]: { revisando: false, requiereIntegracion: false, motivo: '' } })),
      );
  };

  const quitarExtra = (nombre: string) => {
    setExtras((p) => p.filter((x) => x !== nombre));
    setClasificacion((p) => Object.fromEntries(Object.entries(p).filter(([k]) => k !== nombre)));
  };

  const armar = async () => {
    setGenerando(true);
    setError('');
    try {
      const monto = Number(presupuesto.replace(',', '.'));
      const detalle = await crearCampania(idea.trim(), objetivo.trim() || undefined, undefined, respuestas, {
        canales: elegidos,
        canalesExtra: extras,
        presupuestoMensual: Number.isFinite(monto) && monto > 0 ? monto : undefined,
        fechaInicio,
      });
      onCreada(detalle);
    } catch (err: any) {
      setError(err.response?.data?.message || 'No se pudo armar la campaña.');
    } finally {
      setGenerando(false);
    }
  };

  // Mientras el agente trabaja la ventana no se cierra (el plan se crearía igual y la pantalla saltaría sola).
  const cerrar = () => {
    if (!generando) onClose();
  };

  const maximo = pregunta?.maximo ?? 7;
  const hechas = historial.length;
  const hayRespuesta = seleccion.length > 0 || borrador.trim().length > 0;
  const limiteTexto = Math.max(0, MAX_RESPUESTA - (seleccion.length ? seleccion.join(', ').length + 2 : 0));
  const indicePaso = PASOS.findIndex((p) => p.key === paso);
  const sugeridoDe = (key: string) => sugerencia?.sugeridos.find((s) => s.canal === key);
  const monto = Number(presupuesto.replace(',', '.'));
  const extrasConIntegracion = extras.filter((e) => clasificacion[e]?.requiereIntegracion);
  const textoExtra = (e: string) => {
    const c = clasificacion[e];
    if (c?.revisando) return 'Revisando…';
    return c?.requiereIntegracion ? 'Pedido al equipo' : 'Sin conexión: la IA prepara el material';
  };
  const pagados = elegidos.map(canalPorClave).filter((c) => c?.pagado);
  // El dinero se reparte solo entre los canales con pauta pagada; si la IA no dio porcentajes, en partes iguales.
  const clavesPagadas = elegidos.filter((k) => canalPorClave(k)?.pagado);
  const pesoDe = (k: string) => {
    const suma = clavesPagadas.reduce((s, x) => s + (sugeridoDe(x)?.reparto ?? 0), 0);
    return suma > 0 ? (sugeridoDe(k)?.reparto ?? 0) / suma : 1 / Math.max(1, clavesPagadas.length);
  };

  return (
    <>
      <div
        className="modal-overlay"
        onMouseDown={(e) => { arrastreDesdeDentro.current = e.target !== e.currentTarget; }}
        onClick={(e) => { if (e.target === e.currentTarget && !arrastreDesdeDentro.current) cerrar(); }}
      >
        <div className="modal modal-ventas-md marketing-asistente">
          <div className="modal-header">
            <h3>Nueva campaña</h3>
            <button className="modal-close" onClick={cerrar} disabled={generando} aria-label="Cerrar">
              <X size={16} />
            </button>
          </div>
          <ol className="marketing-pasos" aria-label="Pasos">
            {PASOS.map((p, i) => (
              <li key={p.key} className={i === indicePaso ? 'activo' : i < indicePaso ? 'hecho' : ''}>
                <span>{i + 1}</span> {p.label}
              </li>
            ))}
          </ol>
          <div className="modal-body">
            <div ref={errorRef}><ErrorAviso mensaje={error} /></div>
            {generando && <MarketingProgreso paso={pasoGeneracion} />}

            {paso === 'idea' && (
              <>
                <div className="form-group">
                  <label htmlFor="marketing-idea">¿Qué quieres promocionar?</label>
                  <textarea
                    id="marketing-idea"
                    rows={3}
                    value={idea}
                    maxLength={1000}
                    onChange={(e) => setIdea(e.target.value)}
                    placeholder="Ej. Promocionar nuestro servicio estrella a empresas de la ciudad"
                  />
                </div>
                <div className="form-group">
                  <label id="marketing-objetivo">Objetivo (opcional)</label>
                  <div className="marketing-chips" role="group" aria-labelledby="marketing-objetivo">
                    {OBJETIVOS.map((o) => (
                      <button key={o} type="button" className="marketing-chip" aria-pressed={objetivo === o}
                        onClick={() => setObjetivo(objetivo === o ? '' : o)}>
                        {o}
                      </button>
                    ))}
                  </div>
                </div>
                <p className="marketing-nota">
                  Te haré unas preguntas cortas sobre tu negocio, la IA te sugerirá dónde publicar y después arma todo: plan, textos, imágenes y calendario.
                </p>
              </>
            )}

            {paso === 'entrevista' && (
              <>
                <div className="marketing-bloque marketing-objetivo-resumen">
                  <div className="marketing-objetivo-cabecera">
                    <strong>Lo que quieres conseguir</strong>
                    {!editandoIdea && (
                      <button type="button" className="marketing-enlace-accion" onClick={abrirEdicionIdea} disabled={pensando}>
                        <Pencil size={12} /> Editar
                      </button>
                    )}
                  </div>
                  {editandoIdea ? (
                    <>
                      <div className="form-group" style={{ marginBottom: 8 }}>
                        <label htmlFor="marketing-idea-edit">Idea</label>
                        <textarea id="marketing-idea-edit" rows={2} value={ideaEdit} maxLength={1000}
                          onChange={(e) => setIdeaEdit(e.target.value)} />
                      </div>
                      <div className="form-group" style={{ marginBottom: 8 }}>
                        <label id="marketing-objetivo-edit">Objetivo (opcional)</label>
                        <div className="marketing-chips" role="group" aria-labelledby="marketing-objetivo-edit">
                          {OBJETIVOS.map((o) => (
                            <button key={o} type="button" className="marketing-chip" aria-pressed={objetivoEdit === o}
                              onClick={() => setObjetivoEdit(objetivoEdit === o ? '' : o)}>
                              {o}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div className="marketing-objetivo-acciones">
                        <button type="button" className="btn-secondary" onClick={() => setEditandoIdea(false)}>Cancelar</button>
                        <button type="button" className="auth-btn" onClick={guardarIdea} disabled={ideaEdit.trim().length < 4}>
                          Guardar cambios
                        </button>
                      </div>
                    </>
                  ) : (
                    <p className="marketing-objetivo-texto">
                      {idea}
                      {objetivo && <span className="marketing-objetivo-etiqueta">{objetivo}</span>}
                    </p>
                  )}
                </div>
                <div className="marketing-entrevista-barra" aria-hidden="true">
                  <span style={{ width: `${Math.min(100, (hechas / maximo) * 100)}%` }} />
                </div>
                {historial.length > 0 && (
                  <ul className="marketing-historial" aria-label="Lo que ya respondiste">
                    {historial.map((h, i) => (
                      <li key={`${i}-${h.pregunta}`}>
                        <span className="marketing-historial-texto">
                          <span className="marketing-historial-pregunta">{i + 1}. {h.pregunta}</span>
                          <span className="marketing-historial-respuesta">{h.respuesta}</span>
                        </span>
                        <button type="button" className="marketing-enlace-accion" onClick={() => volverAPregunta(i)}
                          disabled={pensando} aria-label={`Cambiar la respuesta de la pregunta ${i + 1}`}>
                          Cambiar
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                {pensando ? (
                  <p className="marketing-nota">Pensando la siguiente pregunta...</p>
                ) : pregunta?.pregunta ? (
                  <>
                    <div className="marketing-entrevista-paso">Pregunta {pregunta.numero} de hasta {maximo}</div>
                    <p className="marketing-entrevista-pregunta">{pregunta.pregunta}</p>
                    {pregunta.opciones.length > 0 && (
                      <>
                        <p className="marketing-nota" style={{ marginBottom: 6 }}>Marca las que apliquen (puedes elegir varias):</p>
                        <div className="marketing-chips" role="group" aria-label="Respuestas rápidas" style={{ marginBottom: 10 }}>
                          {pregunta.opciones.map((o) => (
                            <button key={o} type="button" className="marketing-chip" aria-pressed={seleccion.includes(o)}
                              onClick={() => alternarOpcion(o)}>
                              {o}
                            </button>
                          ))}
                        </div>
                      </>
                    )}
                    <div className="form-group">
                      <label htmlFor="marketing-respuesta">
                        {pregunta.opciones.length > 0 ? 'Y si quieres, añade algo con tus palabras' : 'Cuéntalo con tus palabras'}
                      </label>
                      <textarea id="marketing-respuesta" rows={3} value={borrador} maxLength={limiteTexto}
                        onChange={(e) => setBorrador(e.target.value)} />
                    </div>
                  </>
                ) : (
                  <p className="marketing-nota">Listo: ya tengo lo necesario.</p>
                )}
              </>
            )}

            {paso === 'canales' && (
              <>
                {pensando ? (
                  <div className="marketing-archivo marketing-archivo--espera" role="status">
                    <span className="marketing-spinner" aria-hidden="true" /> La IA está eligiendo los mejores canales para tu negocio...
                  </div>
                ) : (
                  <>
                    {sugerencia?.resumen && (
                      <div className="marketing-ia-nota"><Sparkles size={16} /> {sugerencia.resumen}</div>
                    )}
                    <p className="marketing-nota">
                      Marcados: los que sugiere la IA. Puedes quitar o agregar los que quieras.
                    </p>
                    <div className="marketing-canales-grid">
                      {CANALES_MARKETING.map((c) => {
                        const s = sugeridoDe(c.key);
                        const activo = elegidos.includes(c.key);
                        return (
                          <button
                            key={c.key}
                            type="button"
                            className={`marketing-canal-card${activo ? ' activo' : ''}`}
                            aria-pressed={activo}
                            onClick={() => alternar(c.key)}
                            style={{ ['--canal' as string]: c.color }}
                          >
                            <span className="marketing-canal-card-top">
                              <span className="marketing-canal-icono" aria-hidden="true">{c.icono}</span>
                              <strong>{c.nombre}</strong>
                              {s && <span className={`marketing-prioridad marketing-prioridad--${s.prioridad.toLowerCase()}`}>Sugerido</span>}
                            </span>
                            <span className="marketing-canal-card-texto">{s?.porque || c.descripcion}</span>
                            {c.pagado && <span className="marketing-canal-tag">Con pauta pagada</span>}
                          </button>
                        );
                      })}
                    </div>
                    <div className="marketing-bloque">
                      <strong>¿Quieres un canal que no está en la lista?</strong>
                      <p className="marketing-nota" style={{ marginTop: 4 }}>
                        No hay problema: la IA prepara el material igual. Solo si el canal necesita conectarse a una herramienta, a nuestro equipo le llega el pedido para habilitarlo.
                      </p>
                      {sugerencia?.extras.length ? (
                        <div className="marketing-chips" style={{ marginBottom: 8 }}>
                          {sugerencia.extras.map((e) => (
                            <button key={e.nombre} type="button" className="marketing-chip" title={e.porque}
                              aria-pressed={extras.includes(e.nombre)} onClick={() => agregarExtra(e.nombre)}>
                              <Sparkles size={12} /> {e.nombre}
                            </button>
                          ))}
                        </div>
                      ) : null}
                      <div className="marketing-fila-input">
                        <input
                          className="form-input"
                          value={otroCanal}
                          maxLength={80}
                          placeholder="Ej. Radio local, feria del sector, revista empresarial"
                          onChange={(e) => setOtroCanal(e.target.value)}
                          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); agregarExtra(otroCanal); } }}
                        />
                        <button type="button" className="btn-secondary" onClick={() => agregarExtra(otroCanal)} disabled={!otroCanal.trim()}>
                          <Plus size={14} /> Agregar
                        </button>
                      </div>
                      {extras.length > 0 && (
                        <ul className="marketing-extras-lista">
                          {extras.map((e) => {
                            const c = clasificacion[e];
                            return (
                              <li key={e}>
                                <span className="marketing-chip marketing-chip--fijo">
                                  {e}
                                  <button type="button" aria-label={`Quitar ${e}`} onClick={() => quitarExtra(e)}>
                                    <X size={12} />
                                  </button>
                                </span>
                                {c?.revisando ? (
                                  <span className="marketing-extra-estado" role="status">
                                    <span className="marketing-spinner" aria-hidden="true" /> Revisando…
                                  </span>
                                ) : (
                                  <span className="marketing-extra-estado">
                                    <span className={`marketing-extra-insignia${c?.requiereIntegracion ? ' pedido' : ''}`}>
                                      {c?.requiereIntegracion ? 'Pedido al equipo' : 'Sin conexión'}
                                    </span>
                                    {c?.motivo && <span className="marketing-nota">{c.motivo}</span>}
                                  </span>
                                )}
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </div>
                  </>
                )}
              </>
            )}

            {paso === 'detalles' && (
              <>
                <div className="marketing-dos-columnas">
                  <div className="form-group">
                    <label htmlFor="marketing-presupuesto">Presupuesto mensual para anuncios (USD, opcional)</label>
                    <input id="marketing-presupuesto" className="form-input" inputMode="decimal" value={presupuesto}
                      placeholder="Ej. 300" onChange={(e) => setPresupuesto(e.target.value.replace(/[^0-9.,]/g, ''))} />
                    <small className="marketing-nota">
                      {pagados.length
                        ? 'Si lo dejas vacío, la IA sugiere un rango.'
                        : 'Los canales elegidos no necesitan pauta pagada: puedes dejarlo vacío.'}
                    </small>
                  </div>
                  <div className="form-group">
                    <label htmlFor="marketing-inicio">¿Cuándo empieza?</label>
                    <input id="marketing-inicio" type="date" className="form-input" value={fechaInicio}
                      onChange={(e) => setFechaInicio(e.target.value)} />
                    <small className="marketing-nota">Las piezas se reparten en el calendario desde esta fecha.</small>
                  </div>
                </div>
                <div className="marketing-bloque">
                  <strong>Cómo se repartiría</strong>
                  <ul className="marketing-reparto">
                    {elegidos.map((k) => {
                      const c = canalPorClave(k);
                      const pct = c?.pagado ? Math.round(pesoDe(k) * 100) : 0;
                      return (
                        <li key={k}>
                          <span>{c?.icono} {c?.nombre}</span>
                          <span className="marketing-reparto-barra"><span style={{ width: `${pct}%`, background: c?.color }} /></span>
                          <span>
                            {c?.pagado
                              ? Number.isFinite(monto) && monto > 0 ? `${pct}% · $${Math.round((monto * pct) / 100)}` : `${pct}%`
                              : 'Orgánico'}
                          </span>
                        </li>
                      );
                    })}
                    {extras.map((e) => (
                      <li key={e} className="marketing-reparto-extra">
                        <span>➕ {e}</span>
                        <span className="marketing-nota">{textoExtra(e)}</span>
                      </li>
                    ))}
                  </ul>
                  <small className="marketing-nota">Es una sugerencia: el plan final explica el reparto canal por canal.</small>
                </div>
              </>
            )}
          </div>
          <div className="modal-actions">
            <button className="btn-secondary" onClick={cerrar} disabled={generando}>Cancelar</button>
            {paso === 'idea' && <button className="auth-btn" onClick={empezar} disabled={pensando}>Continuar</button>}
            {paso === 'entrevista' && (
              <>
                {hechas > 0 && (
                  <button className="btn-secondary" onClick={() => volverAPregunta(hechas - 1)} disabled={pensando}
                    title="Vuelve a la última pregunta que respondiste para cambiar tu respuesta.">
                    Pregunta anterior
                  </button>
                )}
                {hechas > 0 && (
                  <button className="btn-secondary" onClick={() => irACanales(respuestas)} disabled={pensando}
                    title="Sigue con lo que ya respondiste.">
                    Seguir con esto
                  </button>
                )}
                <button
                  className="auth-btn"
                  onClick={() => (pregunta?.pregunta ? responder() : irACanales(respuestas))}
                  disabled={pensando || (!!pregunta?.pregunta && !hayRespuesta)}
                >
                  {pregunta?.pregunta ? 'Siguiente' : 'Elegir canales'}
                </button>
              </>
            )}
            {paso === 'canales' && (
              <>
                <button className="btn-secondary" onClick={() => setPaso('entrevista')} disabled={pensando}>Atrás</button>
                <button className="auth-btn" onClick={() => setPaso('detalles')}
                  disabled={pensando || (!elegidos.length && !extras.length)}>
                  Continuar
                </button>
              </>
            )}
            {paso === 'detalles' && (
              <>
                <button className="btn-secondary" onClick={() => setPaso('canales')} disabled={generando}>Atrás</button>
                <button className="auth-btn" onClick={() => setConfirmando(true)} disabled={generando}>
                  {generando ? 'Armando campaña...' : 'Armar campaña'}
                </button>
              </>
            )}
          </div>
        </div>
      </div>
      {cambioPendiente && (
        <ConfirmDialog
          title="Cambiaste lo que quieres conseguir"
          confirmLabel="Reiniciar entrevista"
          cancelLabel="Mantener mis respuestas"
          message={
            <ul className="marketing-confirmar">
              <li>Las preguntas que ya respondiste se hicieron con la idea anterior.</li>
              <li>Si reinicias, empiezas de nuevo con las preguntas para esta nueva idea.</li>
              <li>Si mantienes tus respuestas, se conservan y las siguientes preguntas y los canales usarán la idea nueva.</li>
            </ul>
          }
          onConfirm={() => aplicarIdea(cambioPendiente.idea, cambioPendiente.objetivo, true)}
          onCancel={() => aplicarIdea(cambioPendiente.idea, cambioPendiente.objetivo, false)}
        />
      )}
      {confirmando && (
        <ConfirmDialog
          title="Armar campaña con IA"
          confirmLabel="Armar campaña"
          message={
            <ul className="marketing-confirmar">
              <li>El agente arma la estrategia, el calendario, los indicadores y las piezas para {elegidos.length + extras.length} canal(es).</li>
              {extrasConIntegracion.length > 0 && (
                <li>Los canales que necesitan conectarse ({extrasConIntegracion.join(', ')}) se piden a nuestro equipo para habilitarlos.</li>
              )}
              {extras.length > extrasConIntegracion.length && (
                <li>
                  Para {extras.filter((e) => !clasificacion[e]?.requiereIntegracion).join(', ')} la IA prepara el material sin
                  necesidad de conectar nada.
                </li>
              )}
              <li>Tarda entre 30 y 60 segundos. No cierres la ventana mientras trabaja.</li>
              <li>Todo queda en borrador: no se publica nada hasta que una persona lo apruebe.</li>
            </ul>
          }
          onConfirm={() => {
            setConfirmando(false);
            armar();
          }}
          onCancel={() => setConfirmando(false)}
        />
      )}
    </>
  );
}
