import { useEffect, useRef, useState } from 'react';
import {
  Check,
  Copy,
  Download,
  ExternalLink,
  HelpCircle,
  Link2,
  Link2Off,
  Monitor,
  RefreshCw,
  Smartphone,
  Tablet,
  ThumbsUp,
} from 'lucide-react';
import ConfirmDialog from '../../common/ConfirmDialog';
import ErrorBanner from '../../common/ErrorBanner';
import {
  crearCotEnlace,
  desactivarCotEnlace,
  getCotEnlace,
  urlCotizacionPublica,
  type CotEnlaceSeguimiento,
} from '../../../services/cotizador.service';
import { apiError } from '../../../utils/cotizador/format';

interface Props {
  quoteId: number;
  quoteNumber: string;
  clienteNombre: string;
  clienteTelefono: string;
  /** Hay cambios en pantalla que aún no se guardan: el cliente verá la última versión guardada. */
  cambiosSinGuardar: boolean;
  onClose: () => void;
  /** El estado de la cotización pudo cambiar (borrador → enviada). */
  onEstadoCambiado?: () => void;
}

/** Ecuador: 09xxxxxxxx → 5939xxxxxxxx (WhatsApp necesita el número internacional, solo dígitos). */
function numeroWhatsapp(tel: string): string {
  const d = tel.replace(/\D/g, '');
  if (!d) return '';
  if (d.startsWith('593')) return d;
  if (d.startsWith('0') && d.length === 10) return '593' + d.slice(1);
  return d;
}

const fechaHora = (iso: string | null) =>
  iso
    ? new Intl.DateTimeFormat('es-EC', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'America/Guayaquil',
      }).format(new Date(iso))
    : '—';

/** 75 → «1 min 15 s»; 0 → «menos de 15 s». */
function duracion(seg: number): string {
  if (seg <= 0) return 'menos de 15 s';
  const h = Math.floor(seg / 3600);
  const m = Math.floor((seg % 3600) / 60);
  const s = seg % 60;
  if (h > 0) return `${h} h ${m} min`;
  if (m > 0) return s > 0 ? `${m} min ${s} s` : `${m} min`;
  return `${s} s`;
}

const ICONO_EQUIPO: Record<string, typeof Monitor> = { celular: Smartphone, tablet: Tablet, computadora: Monitor };

/**
 * «Enviar al cliente» (2026-11-17): crea el enlace público de la cotización, lo copia o lo manda por
 * WhatsApp con el mensaje escrito, y muestra lo que el cliente hizo con él (aperturas, tiempo, equipo,
 * descargas y sus «Me interesa» / «Tengo dudas»).
 */
export default function EnviarClienteModal({
  quoteId,
  quoteNumber,
  clienteNombre,
  clienteTelefono,
  cambiosSinGuardar,
  onClose,
  onEstadoCambiado,
}: Props) {
  const [datos, setDatos] = useState<CotEnlaceSeguimiento | null>(null);
  const [cargando, setCargando] = useState(true);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState('');
  const [copiado, setCopiado] = useState(false);
  const [confirmarApagar, setConfirmarApagar] = useState(false);
  const errorRef = useRef<HTMLDivElement>(null);

  const cargar = async () => {
    setCargando(true);
    setError('');
    try {
      setDatos(await getCotEnlace(quoteId));
    } catch (e) {
      setError(apiError(e, 'No se pudo cargar el enlace de esta cotización. Intenta de nuevo.'));
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => {
    void cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quoteId]);

  useEffect(() => {
    if (error) errorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [error]);

  const accion = async (fn: () => Promise<CotEnlaceSeguimiento>, msgError: string) => {
    setOcupado(true);
    setError('');
    try {
      setDatos(await fn());
      onEstadoCambiado?.();
    } catch (e) {
      setError(apiError(e, msgError));
    } finally {
      setOcupado(false);
    }
  };

  const url = datos?.enlace ? urlCotizacionPublica(datos.enlace.token) : '';
  const primerNombre = clienteNombre.trim();
  const mensaje =
    `Hola${primerNombre ? ` ${primerNombre}` : ''}, te comparto la cotización ${quoteNumber}. ` +
    `Puedes verla y descargarla aquí: ${url}`;
  const wa = numeroWhatsapp(clienteTelefono);

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      setError('No se pudo copiar automáticamente. Selecciona el enlace y cópialo con Ctrl+C.');
    }
  };

  const r = datos?.resumen;

  // La confirmación va como hermana del overlay (no dentro): un clic en ella no debe cerrar esta ventana.
  return (
    <>
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal modal-ventas-md"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="cot-env-title"
      >
        <div className="modal-header">
          <h3 id="cot-env-title">Enviar al cliente · {quoteNumber}</h3>
          <button className="modal-close" onClick={onClose} aria-label="Cerrar">
            ✕
          </button>
        </div>
        <div className="modal-body cot-env">
          <div ref={errorRef}>
            <ErrorBanner mensaje={error} />
          </div>

          {cargando && !datos ? (
            <p className="cot-muted">Cargando…</p>
          ) : datos ? (
            <>
              {cambiosSinGuardar && (
                <div className="cot-env-aviso" role="note">
                  Tienes cambios sin guardar. El cliente ve la <strong>última versión guardada</strong>: guarda la
                  cotización para que vea lo que tienes en pantalla.
                </div>
              )}

              {!datos.enlace ? (
                <section className="cot-env-crear">
                  <Link2 size={28} aria-hidden="true" />
                  <div>
                    <strong>Comparte la cotización con un enlace</strong>
                    <p className="cot-muted">
                      El cliente la abre en su celular o computadora sin crear cuenta, ve los precios finales (nunca
                      costos ni márgenes), puede descargar el PDF y responderte «Me interesa» o «Tengo dudas». Tú ves
                      cuándo la abrió y cuánto tiempo la miró.
                    </p>
                    {datos.puedeGestionar ? (
                      <button
                        type="button"
                        className="auth-btn"
                        disabled={ocupado}
                        onClick={() => accion(() => crearCotEnlace(quoteId), 'No se pudo crear el enlace. Intenta de nuevo.')}
                      >
                        <Link2 size={15} /> {ocupado ? 'Creando…' : 'Crear enlace'}
                      </button>
                    ) : (
                      <p className="cot-muted">Solo quien creó la cotización (o tiene su edición total) puede crear el enlace.</p>
                    )}
                  </div>
                </section>
              ) : (
                <section className="cot-env-enlace">
                  <label htmlFor="cot-env-url">Enlace de la cotización</label>
                  <div className="cot-env-url">
                    <input id="cot-env-url" readOnly value={url} onFocus={(e) => e.currentTarget.select()} />
                    <button type="button" className="btn-secondary" onClick={copiar}>
                      {copiado ? <Check size={15} /> : <Copy size={15} />} {copiado ? 'Copiado' : 'Copiar'}
                    </button>
                  </div>
                  <div className="cot-env-botones">
                    <a
                      className="auth-btn cot-env-wa"
                      href={`https://wa.me/${wa}?text=${encodeURIComponent(mensaje)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Enviar por WhatsApp
                    </a>
                    <a className="btn-secondary" href={url} target="_blank" rel="noopener noreferrer">
                      <ExternalLink size={15} /> Ver como el cliente
                    </a>
                  </div>
                  <p className="cot-muted cot-env-pie">
                    {wa
                      ? `WhatsApp se abre con el mensaje escrito para el ${clienteTelefono}; solo presiona enviar.`
                      : 'La cotización no tiene teléfono del cliente: WhatsApp se abrirá para que elijas el chat.'}{' '}
                    Creado por {datos.enlace.creadoPor || '—'} el {fechaHora(datos.enlace.creadoEn)}
                  </p>
                </section>
              )}

              {(datos.enlace || datos.huboEnlaces > 0) && r && (
                <section className="cot-env-seguimiento" aria-label="Lo que hizo el cliente">
                  <div className="cot-env-seg-cabecera">
                    <strong>Lo que hizo el cliente</strong>
                    <button type="button" className="btn-icon-toolbar" onClick={cargar} title="Actualizar" aria-label="Actualizar">
                      <RefreshCw size={15} />
                    </button>
                  </div>
                  {r.aperturas === 0 ? (
                    <p className="cot-muted">Todavía no la abre. Te llegará una notificación en la app la primera vez que lo haga.</p>
                  ) : (
                    <>
                      <div className="cot-env-kpis">
                        <div>
                          <span>Veces que la abrió</span>
                          <strong>{r.aperturas}</strong>
                          {r.personas > 1 && <small>{r.personas} navegadores distintos</small>}
                        </div>
                        <div>
                          <span>Tiempo mirándola</span>
                          <strong>{duracion(r.segundos)}</strong>
                          <small>aproximado</small>
                        </div>
                        <div>
                          <span>Descargó el PDF</span>
                          <strong>{r.descargas > 0 ? `Sí (${r.descargas})` : 'No'}</strong>
                        </div>
                      </div>
                      <p className="cot-muted cot-env-fechas">
                        Primera vez: {fechaHora(r.primeraVista)} · Última: {fechaHora(r.ultimaVista)}
                      </p>
                      <table className="cot-env-tabla">
                        <thead>
                          <tr>
                            <th>Cuándo</th>
                            <th>Equipo</th>
                            <th>Tiempo</th>
                            <th>PDF</th>
                          </tr>
                        </thead>
                        <tbody>
                          {datos.visitas.map((v, i) => {
                            const Icono = ICONO_EQUIPO[v.dispositivo] ?? Monitor;
                            return (
                              <tr key={i}>
                                <td>{fechaHora(v.inicio)}</td>
                                <td>
                                  <span className="cot-env-equipo">
                                    <Icono size={14} aria-hidden="true" /> {v.dispositivo}
                                  </span>
                                </td>
                                <td>{duracion(v.segundos)}</td>
                                <td>{v.descargoPdf ? <Download size={14} aria-label="Descargó" /> : '—'}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </>
                  )}
                  {datos.respuestas.length > 0 && (
                    <ul className="cot-env-respuestas">
                      {datos.respuestas.map((x, i) => (
                        <li key={i} className={x.tipo}>
                          {x.tipo === 'interesa' ? <ThumbsUp size={14} aria-hidden="true" /> : <HelpCircle size={14} aria-hidden="true" />}
                          <div>
                            <strong>{x.tipo === 'interesa' ? 'Me interesa' : 'Tengo dudas'}</strong>{' '}
                            <small>{fechaHora(x.creadoEn)}</small>
                            {x.mensaje && <p>«{x.mensaje}»</p>}
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                  {r.internas > 0 && (
                    <p className="cot-muted cot-env-pie">
                      {r.internas === 1 ? 'No se cuenta 1 apertura' : `No se cuentan ${r.internas} aperturas`} del equipo
                      (con sesión de la empresa).
                    </p>
                  )}
                </section>
              )}
            </>
          ) : null}
        </div>
        <div className="modal-actions">
          {datos?.enlace && datos.puedeGestionar && (
            <button
              type="button"
              className="btn-secondary cot-env-apagar"
              disabled={ocupado}
              onClick={() => setConfirmarApagar(true)}
            >
              <Link2Off size={15} /> Desactivar enlace
            </button>
          )}
          <button type="button" className="btn-secondary" onClick={onClose}>
            Cerrar
          </button>
        </div>
      </div>
    </div>

      {confirmarApagar && (
        <ConfirmDialog
          title="Desactivar el enlace"
          message="Quien abra este enlace verá «ya no está disponible». Lo que el cliente hizo hasta ahora se conserva. Si después creas otro enlace, tendrá un código nuevo."
          confirmLabel="Desactivar"
          danger
          onCancel={() => setConfirmarApagar(false)}
          onConfirm={() => {
            setConfirmarApagar(false);
            void accion(() => desactivarCotEnlace(quoteId), 'No se pudo desactivar el enlace. Intenta de nuevo.');
          }}
        />
      )}
    </>
  );
}
