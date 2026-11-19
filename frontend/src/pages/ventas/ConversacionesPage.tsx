import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Bot, Calculator, Check, FlaskConical, Hand, RotateCcw, Send, UserRound, X } from 'lucide-react';
import ErrorBanner from '../../components/common/ErrorBanner';
import CotizacionBotModal from '../../components/ventas/CotizacionBotModal';
import VentasPageHeader from '../../components/ventas/VentasPageHeader';
import { usePerm } from '../../contexts/PermissionsContext';
import { useToast } from '../../contexts/ToastContext';
import {
  aprobarRespuesta,
  descartarRespuesta,
  devolverConversacion,
  escribirEnConversacion,
  getConversacion,
  getConversaciones,
  simularMensajeCliente,
  tomarConversacion,
  type ConversacionResumen,
  type DetalleConversacion,
  type EstadoConversacion,
  type MensajeWa,
} from '../../services/whatsappBot.service';
import '../../styles/conversaciones.css';

type Filtro = 'todas' | 'necesita' | 'sinleer';

const mensajeDe = (err: any, porDefecto: string) => {
  const m = err?.response?.data?.message;
  return (Array.isArray(m) ? m[0] : m) || porDefecto;
};

const ETIQUETA_ESTADO: Record<EstadoConversacion, string> = {
  BOT: 'Con el bot',
  NECESITA_PERSONA: 'Necesita una persona',
  PERSONA: 'Atiende una persona',
  CERRADA: 'Cerrada',
};

const fechaCorta = (iso: string | null) => {
  if (!iso) return '';
  const d = new Date(iso);
  const hoy = new Date();
  const opciones = { timeZone: 'America/Guayaquil' } as const;
  const mismoDia = d.toLocaleDateString('es-EC', opciones) === hoy.toLocaleDateString('es-EC', opciones);
  return mismoDia
    ? d.toLocaleTimeString('es-EC', { ...opciones, hour: '2-digit', minute: '2-digit' })
    : d.toLocaleDateString('es-EC', { ...opciones, day: '2-digit', month: 'short' });
};

const horaCompleta = (iso: string) =>
  new Date(iso).toLocaleString('es-EC', { timeZone: 'America/Guayaquil', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });

// «593991234567» → «+593 99 123 4567» (solo para leerlo mejor; no se guarda así).
const telefonoLegible = (t: string) => (t.startsWith('593') && t.length === 12 ? `+593 ${t.slice(3, 5)} ${t.slice(5, 8)} ${t.slice(8)}` : `+${t}`);

export default function ConversacionesPage() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { canWrite } = usePerm();
  const puedeEscribir = canWrite('VENTAS');
  const [params, setParams] = useSearchParams();
  const elegida = params.get('c') ? Number(params.get('c')) : null;

  const [filtro, setFiltro] = useState<Filtro>('todas');
  const [lista, setLista] = useState<ConversacionResumen[]>([]);
  const [detalle, setDetalle] = useState<DetalleConversacion | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [texto, setTexto] = useState('');
  const [enviando, setEnviando] = useState(false);
  // Mensaje del bot cuya cotización se está viendo en la vista previa.
  const [verCot, setVerCot] = useState<MensajeWa | null>(null);
  // Borradores editados de las respuestas propuestas, por id de mensaje.
  const [borradores, setBorradores] = useState<Record<number, string>>({});
  const finRef = useRef<HTMLDivElement>(null);

  const cargarLista = useCallback(async () => {
    try {
      setLista(await getConversaciones(filtro === 'todas' ? undefined : filtro));
    } catch (err) {
      setError(mensajeDe(err, 'No se pudieron cargar las conversaciones. Intenta de nuevo.'));
    } finally {
      setCargando(false);
    }
  }, [filtro]);

  const cargarDetalle = useCallback(async (id: number) => {
    try {
      setDetalle(await getConversacion(id));
    } catch (err) {
      setError(mensajeDe(err, 'No se pudo abrir la conversación. Intenta de nuevo.'));
    }
  }, []);

  useEffect(() => { cargarLista(); }, [cargarLista]);
  useEffect(() => {
    if (elegida) cargarDetalle(elegida);
    else setDetalle(null);
  }, [elegida, cargarDetalle]);

  // Mensajes nuevos sin recargar a mano: se revisa cada 15 s (mientras la pestaña está a la vista).
  useEffect(() => {
    const t = setInterval(() => {
      if (document.hidden) return;
      cargarLista();
      if (elegida) cargarDetalle(elegida);
    }, 15000);
    return () => clearInterval(t);
  }, [cargarLista, cargarDetalle, elegida]);

  useEffect(() => { finRef.current?.scrollIntoView({ block: 'end' }); }, [detalle?.mensajes.length, elegida]);

  const abrir = (id: number) => setParams({ c: String(id) }, { replace: true });
  const refrescar = async () => {
    await cargarLista();
    if (elegida) await cargarDetalle(elegida);
  };

  const accion = async (fn: () => Promise<unknown>, exito?: string) => {
    setError('');
    try {
      await fn();
      if (exito) showToast(exito, 'success');
      await refrescar();
    } catch (err) {
      setError(mensajeDe(err, 'No se pudo completar la acción. Intenta de nuevo.'));
    }
  };

  const resultadoEnvio = (r: { success: boolean; error?: string; simulado?: boolean }) => {
    if (!r.success) setError(r.error || 'No se pudo enviar el mensaje.');
    else if (r.simulado) showToast('Envío simulado (local): no salió por WhatsApp.', 'info');
    else showToast('Mensaje enviado.', 'success');
  };

  const aprobar = async (m: MensajeWa) => {
    if (!elegida) return;
    setEnviando(true);
    setError('');
    try {
      const editado = borradores[m.id];
      resultadoEnvio(await aprobarRespuesta(elegida, m.id, editado !== undefined && editado !== m.texto ? editado : undefined));
      await refrescar();
    } catch (err) {
      setError(mensajeDe(err, 'No se pudo enviar la respuesta. Intenta de nuevo.'));
    } finally {
      setEnviando(false);
    }
  };

  const enviarPropio = async () => {
    if (!elegida || !texto.trim()) return;
    setEnviando(true);
    setError('');
    try {
      resultadoEnvio(await escribirEnConversacion(elegida, texto.trim()));
      setTexto('');
      await refrescar();
    } catch (err) {
      setError(mensajeDe(err, 'No se pudo enviar el mensaje. Intenta de nuevo.'));
    } finally {
      setEnviando(false);
    }
  };

  const conv = detalle?.conversacion;
  const hayPropuesta = useMemo(() => detalle?.mensajes.some((m) => m.estado === 'PROPUESTO' && m.autor === 'BOT') ?? false, [detalle]);
  const nombre = (c: { contactName: string | null; phone: string }) => c.contactName || telefonoLegible(c.phone);

  return (
    <div className="page-container">
      <VentasPageHeader
        title="Conversaciones"
        description="Los WhatsApp de posibles clientes y clientes. El bot conversa y pregunta solo; las cotizaciones con precio las apruebas tú, y en cualquier momento puedes tomar la conversación."
        ayuda={null}
      />

      <ErrorBanner mensaje={error} />

      <div className="conv-layout" data-tablas-vivas="off">
        <aside className="conv-lista" aria-label="Lista de conversaciones">
          <div className="conv-filtros" role="tablist" aria-label="Filtrar conversaciones">
            {([['todas', 'Todas'], ['necesita', 'Necesitan persona'], ['sinleer', 'Sin leer']] as [Filtro, string][]).map(([k, label]) => (
              <button key={k} type="button" role="tab" aria-selected={filtro === k} className={`conv-chip ${filtro === k ? 'activo' : ''}`} onClick={() => setFiltro(k)}>
                {label}
              </button>
            ))}
          </div>
          <div className="conv-items">
            {cargando && <p className="conv-vacio">Cargando...</p>}
            {!cargando && lista.length === 0 && (
              <p className="conv-vacio">Todavía no hay conversaciones{filtro !== 'todas' ? ' con este filtro' : ''}.</p>
            )}
            {lista.map((c) => (
              <button key={c.id} type="button" className={`conv-item ${elegida === c.id ? 'activa' : ''}`} onClick={() => abrir(c.id)}>
                <span className="conv-item-fila">
                  <strong className="truncate">{nombre(c)}</strong>
                  <small>{fechaCorta(c.ultimoMensajeEn)}</small>
                </span>
                <span className="conv-item-texto truncate">{c.ultimoTexto ?? ''}</span>
                <span className="conv-item-pie">
                  <span className={`conv-estado conv-estado--${c.estado}`}>{ETIQUETA_ESTADO[c.estado]}</span>
                  {c.hayPropuesta && <span className="conv-estado conv-estado--revisar">Por revisar</span>}
                  {c.sinLeer > 0 && <span className="conv-sinleer" aria-label={`${c.sinLeer} sin leer`}>{c.sinLeer}</span>}
                </span>
              </button>
            ))}
          </div>
          {import.meta.env.DEV && <SimuladorCliente onEnviado={async (id) => { await cargarLista(); abrir(id); await cargarDetalle(id); }} />}
        </aside>

        <section className="conv-chat" aria-label="Conversación">
          {!detalle || !conv ? (
            <div className="conv-chat-vacio">
              <Bot size={36} aria-hidden />
              <p>Elige una conversación para ver el historial completo.</p>
            </div>
          ) : (
            <>
              <header className="conv-chat-cab">
                <div>
                  <h2>{nombre(conv)}</h2>
                  <p>
                    {telefonoLegible(conv.phone)} · <span className={`conv-estado conv-estado--${conv.estado}`}>{ETIQUETA_ESTADO[conv.estado]}</span>
                    {conv.motivoEscalado && conv.estado === 'NECESITA_PERSONA' && <> · <em>{conv.motivoEscalado}</em></>}
                  </p>
                </div>
                <div className="conv-chat-acciones">
                  {conv.leadId && (
                    <button type="button" className="btn-secondary" onClick={() => navigate('/ventas/leads')}>
                      <UserRound size={16} aria-hidden /> Ver posible cliente
                    </button>
                  )}
                  {conv.estado === 'PERSONA' ? (
                    <button type="button" className="btn-secondary" disabled={!puedeEscribir} onClick={() => accion(() => devolverConversacion(conv.id), 'La conversación volvió al bot.')}>
                      <RotateCcw size={16} aria-hidden /> Devolver al bot
                    </button>
                  ) : (
                    <button type="button" className="auth-btn" disabled={!puedeEscribir} onClick={() => accion(() => tomarConversacion(conv.id), 'Tomaste la conversación: el bot está en pausa.')}>
                      <Hand size={16} aria-hidden /> Tomar conversación
                    </button>
                  )}
                </div>
              </header>

              <div className="conv-mensajes" aria-live="polite">
                {detalle.mensajes.filter((m) => m.estado !== 'DESCARTADO').map((m) => (
                  <Burbuja
                    key={m.id}
                    m={m}
                    borrador={borradores[m.id]}
                    onBorrador={(v) => setBorradores((b) => ({ ...b, [m.id]: v }))}
                    puedeEscribir={puedeEscribir}
                    enviando={enviando}
                    onVerCotizacion={() => setVerCot(m)}
                    onAprobar={() => aprobar(m)}
                    onDescartar={() => accion(() => descartarRespuesta(conv.id, m.id), 'Respuesta descartada.')}
                  />
                ))}
                <div ref={finRef} />
              </div>

              <footer className="conv-redactar">
                {!detalle.ventanaAbierta && (
                  <p className="conv-aviso">
                    Pasaron más de 24 horas desde el último mensaje del cliente: WhatsApp no deja escribirle texto libre. Llámalo o espera a que escriba.
                  </p>
                )}
                {hayPropuesta && detalle.ventanaAbierta && (
                  <p className="conv-aviso conv-aviso--info">Hay una respuesta del bot por revisar arriba. Si escribes aquí, tomas la conversación y el bot se pausa.</p>
                )}
                <div className="conv-redactar-fila">
                  <textarea
                    value={texto}
                    onChange={(e) => setTexto(e.target.value)}
                    placeholder={puedeEscribir ? 'Escribe tu respuesta…' : 'Solo lectura'}
                    rows={2}
                    disabled={!puedeEscribir || !detalle.ventanaAbierta || enviando}
                    aria-label="Escribir un mensaje al cliente"
                    onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) enviarPropio(); }}
                  />
                  <button type="button" className="auth-btn" disabled={!puedeEscribir || !detalle.ventanaAbierta || enviando || !texto.trim()} onClick={enviarPropio}>
                    <Send size={16} aria-hidden /> Enviar
                  </button>
                </div>
              </footer>
            </>
          )}
        </section>
      </div>

      {verCot?.cotizacion && conv && (
        <CotizacionBotModal
          cotizacion={verCot.cotizacion}
          puedeEditar={puedeEscribir}
          onClose={() => setVerCot(null)}
          onEditar={() => navigate(`/ventas/cotizador?conversacion=${conv.id}&mensaje=${verCot.id}`)}
        />
      )}
    </div>
  );
}

function Burbuja({
  m, borrador, onBorrador, puedeEscribir, enviando, onVerCotizacion, onAprobar, onDescartar,
}: {
  m: MensajeWa;
  borrador: string | undefined;
  onBorrador: (v: string) => void;
  puedeEscribir: boolean;
  enviando: boolean;
  onVerCotizacion: () => void;
  onAprobar: () => void;
  onDescartar: () => void;
}) {
  const propuesta = m.estado === 'PROPUESTO' || m.estado === 'FALLIDO';
  const quien = m.autor === 'CLIENTE' ? 'Cliente' : m.autor === 'BOT' ? 'Bot' : 'Persona del equipo';
  const valor = borrador ?? m.texto;
  return (
    <div className={`conv-burbuja conv-burbuja--${m.autor} ${propuesta ? 'conv-burbuja--propuesta' : ''}`}>
      <span className="conv-burbuja-quien">
        {m.autor === 'BOT' && <Bot size={13} aria-hidden />} {quien}
        {m.estado === 'PROPUESTO' && m.autor === 'BOT' && ' · propuesta, aún no enviada'}
        {m.estado === 'FALLIDO' && ' · no se envió'}
      </span>
      {propuesta && puedeEscribir ? (
        <>
          <textarea
            className="conv-borrador" value={valor} rows={Math.min(8, Math.max(3, Math.ceil(valor.length / 60)))}
            onChange={(e) => onBorrador(e.target.value)} aria-label="Editar la respuesta antes de enviarla"
          />
          {m.cotizacion && (
            <div className="conv-cotizacion-tarjeta">
              <span>{resumenCotizacion(m.cotizacion)}</span>
              <button type="button" className="btn-secondary" onClick={onVerCotizacion}>
                <Calculator size={15} aria-hidden /> Ver cotización
              </button>
            </div>
          )}
          {m.error && <p className="conv-error-envio">{m.error}</p>}
          <span className="conv-borrador-acciones">
            <button type="button" className="auth-btn" disabled={enviando || !valor.trim()} onClick={onAprobar}>
              <Check size={16} aria-hidden /> {valor !== m.texto ? 'Enviar con mis cambios' : 'Aprobar y enviar'}
            </button>
            {m.estado === 'PROPUESTO' && (
              <button type="button" className="btn-secondary" disabled={enviando} onClick={onDescartar}>
                <X size={16} aria-hidden /> Descartar
              </button>
            )}
          </span>
        </>
      ) : (
        <p>{m.texto}</p>
      )}
      <small>
        {horaCompleta(m.enviadoEn ?? m.createdAt)}
        {m.simulado && ' · simulado'}
        {m.textoOriginalBot && m.textoOriginalBot !== m.texto && ' · corregido por una persona'}
      </small>
    </div>
  );
}

// Lo que ve la persona que revisa una cotización del bot: los números los calculó el sistema con las
// tarifas del Cotizador (el bot no escribe precios); aquí se muestra con qué margen, para que la apruebe o la corrija.
function resumenCotizacion(c: any): string {
  const usd = (n: unknown) => `$${Number(n ?? 0).toFixed(2)}`;
  const total = c?.tipo === 'CUSTODIA' ? c.total : c?.totales?.total;
  return `Cotización del sistema (${c?.tipo === 'CUSTODIA' ? 'custodia móvil' : 'productos'}): ${usd(total)} con IVA. Revísala antes de enviarla.`;
}

// Solo en local (npm run dev): permite probar el bot sin una cuenta de Meta ni un número real.
function SimuladorCliente({ onEnviado }: { onEnviado: (conversacionId: number) => void | Promise<void> }) {
  const { showToast } = useToast();
  const [abierto, setAbierto] = useState(false);
  const [telefono, setTelefono] = useState('593990000001');
  const [nombre, setNombre] = useState('Cliente de prueba');
  const [texto, setTexto] = useState('');
  const [enviando, setEnviando] = useState(false);

  const enviar = async () => {
    if (!texto.trim()) return;
    setEnviando(true);
    try {
      const r = await simularMensajeCliente(telefono, texto.trim(), nombre);
      setTexto('');
      if (r?.conversacionId) await onEnviado(r.conversacionId);
    } catch (err) {
      showToast(mensajeDe(err, 'No se pudo simular el mensaje. ¿Está activado el bot en Configuración?'), 'error');
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="conv-simulador">
      <button type="button" className="conv-simulador-btn" onClick={() => setAbierto(!abierto)} aria-expanded={abierto}>
        <FlaskConical size={15} aria-hidden /> Simular mensaje de un cliente (solo local)
      </button>
      {abierto && (
        <div className="conv-simulador-form">
          <input value={telefono} onChange={(e) => setTelefono(e.target.value)} placeholder="Teléfono con código de país" aria-label="Teléfono del cliente simulado" />
          <input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Nombre" aria-label="Nombre del cliente simulado" />
          <textarea value={texto} onChange={(e) => setTexto(e.target.value)} rows={2} placeholder="Lo que escribe el cliente…" aria-label="Mensaje del cliente simulado" />
          <button type="button" className="btn-secondary" disabled={enviando || !texto.trim()} onClick={enviar}>Enviar como cliente</button>
        </div>
      )}
    </div>
  );
}
