import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { useParams } from 'react-router-dom';
import {
  CalendarClock,
  CheckCircle2,
  Download,
  HelpCircle,
  MessageCircle,
  Package,
  Phone,
  RefreshCw,
  ThumbsUp,
  TriangleAlert,
} from 'lucide-react';
import { api } from '../../services/auth.service';
import {
  abrirVisita,
  getCotizacionPublica,
  latidoFinal,
  latidoVisita,
  responderCotizacion,
  type CotizacionPublica,
  type FilaProductoPublica,
} from '../../services/cotizacionPublica.service';
import { isoToDMY, money } from '../../utils/cotizador/format';
import HojaCotizacion, { type HojaDatos } from '../../components/ventas/cotizador/HojaCotizacion';
// Los estilos de la hoja impresa del Cotizador: el PDF del enlace es el MISMO que el de la app.
import './cotizador.css';
import './cotizacionPublica.css';

/**
 * Cotización que el cliente abre desde el enlace que le mandó su asesor (2026-11-17).
 *
 * Se abre SIN iniciar sesión (fuera de ProtectedLayout). Todo lo que muestra viene ya calculado del
 * servidor como precios de venta: esta pantalla no recibe ni puede mostrar costos, márgenes, porcentajes
 * de ganancia ni proveedores. Mientras está a la vista avisa cada 15 s al servidor (para saber cuánto la
 * leyó); al esconderse deja de contar.
 */

const LOGO_GEMESEG_SOBRE_BLANCO = '/resources/logo-gemeseg-bgwhite.png';
const LATIDO_MS = 15_000;
const CLAVE_VISITANTE = 'cotizacion:visitante';

/** Identificador al azar de este navegador (para contar personas distintas). Nada personal. */
function visitanteDeEsteNavegador(): string {
  try {
    const guardado = localStorage.getItem(CLAVE_VISITANTE);
    if (guardado && /^[A-Za-z0-9_-]{8,64}$/.test(guardado)) return guardado;
    const nuevo = Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, '0')).join('');
    localStorage.setItem(CLAVE_VISITANTE, nuevo);
    return nuevo;
  } catch {
    return '';
  }
}

function logoDe(c: CotizacionPublica['empresa']): { src: string | null; enCaja: boolean } {
  if (/gemeseg/i.test(c.nombre)) return { src: LOGO_GEMESEG_SOBRE_BLANCO, enCaja: false };
  if (!c.logoUrl) return { src: null, enCaja: false };
  const src = c.logoUrl.startsWith('/uploads/') ? `${api.defaults.baseURL}${c.logoUrl}` : c.logoUrl;
  return { src, enCaja: true };
}

const iniciales = (nombre: string) =>
  nombre
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('');

const fechaLarga = (iso: string) =>
  new Intl.DateTimeFormat('es-EC', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'America/Guayaquil' }).format(
    new Date(iso),
  );

/** Datos de la hoja impresa (la misma del Cotizador) a partir de lo que mandó el servidor. */
function hojaDe(d: CotizacionPublica, logoUrl: string | null): HojaDatos {
  const c = d.cotizacion;
  return {
    empresa: d.empresa.nombre,
    logoUrl,
    numero: d.numero,
    fecha: d.fecha,
    cliente: {
      name: d.cliente.nombre,
      ruc: d.cliente.ruc,
      phone: d.cliente.telefono,
      address: d.cliente.direccion,
      contact: d.cliente.contacto,
      email: d.cliente.email,
    },
    bloques: c.bloques.map((b) =>
      b.tipo === 'kit'
        ? {
            tipo: 'kit' as const,
            nombre: b.nombre,
            cantidad: b.cantidad,
            filas: b.filas.map((f) => ({ ...f, cantidad: f.cantidadEnKit })),
          }
        : { tipo: 'producto' as const, fila: b.fila },
    ),
    custodias: c.custodias,
    instalaciones: c.instalaciones,
    totales: {
      subtotalEquipo: c.totales.productos,
      totalInstSinIva: c.totales.instalaciones,
      totalCustodiaSinIva: c.totales.custodia,
      base: c.totales.base,
      discount: c.totales.descuento,
      subtotal: c.totales.subtotal,
      iva: c.totales.iva,
      total: c.totales.total,
    },
    discountType: d.descuento.tipo,
    discountValue: d.descuento.porcentaje ?? 0,
    condiciones: d.condiciones.join('\n'),
    notas: d.notas,
    emisor: { nombre: d.asesor.nombre, cargo: d.asesor.cargo, telefono: d.asesor.telefono },
  };
}

/** "Garantía: 12 meses" -> etiqueta en negrita y valor. */
const partirCondicion = (l: string) => {
  const m = l.match(/^([^:]{2,60}):\s*(.+)$/);
  return m ? { etiqueta: m[1], valor: m[2] } : null;
};

export default function CotizacionPublicaPage() {
  const { token = '' } = useParams<{ token: string }>();
  const [datos, setDatos] = useState<CotizacionPublica | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [interna, setInterna] = useState(false);
  const visita = useRef<{ id: number; clave: string } | null>(null);
  // Una sola visita por carga de la página, aunque React monte el efecto dos veces (modo estricto).
  const visitaAbierta = useRef<Promise<{ visita: number; clave: string; interna: boolean }> | null>(null);

  // Que el enlace no aparezca en buscadores ni se filtre por el «referer» al tocar WhatsApp.
  useEffect(() => {
    const metas = [
      Object.assign(document.createElement('meta'), { name: 'robots', content: 'noindex, nofollow' }),
      Object.assign(document.createElement('meta'), { name: 'referrer', content: 'no-referrer' }),
    ];
    metas.forEach((m) => document.head.appendChild(m));
    return () => metas.forEach((m) => m.remove());
  }, []);

  useEffect(() => {
    let vigente = true;
    setCargando(true);
    getCotizacionPublica(token)
      .then((d) => {
        if (!vigente) return;
        setDatos(d);
        document.title = `Cotización ${d.numero} · ${d.empresa.nombre}`;
      })
      .catch((e: { response?: { data?: { message?: string } } }) => {
        if (vigente)
          setError(e.response?.data?.message || 'No pudimos abrir esta cotización. Revisa el enlace o pide uno nuevo a tu asesor.');
      })
      .finally(() => vigente && setCargando(false));
    return () => {
      vigente = false;
    };
  }, [token]);

  // Visita: se abre una vez que la cotización cargó; mientras la página está a la vista avisa cada 15 s.
  useEffect(() => {
    if (!datos) return;
    let detenido = false;
    let intervalo: number | undefined;
    if (!visitaAbierta.current) visitaAbierta.current = abrirVisita(token, visitanteDeEsteNavegador());
    visitaAbierta.current
      .then((v) => {
        if (detenido) return;
        visita.current = { id: v.visita, clave: v.clave };
        setInterna(v.interna);
        intervalo = window.setInterval(() => {
          if (document.visibilityState === 'visible' && visita.current) {
            latidoVisita(token, visita.current.id, visita.current.clave).catch(() => undefined);
          }
        }, LATIDO_MS);
      })
      .catch(() => undefined);

    const alCambiarVisibilidad = () => {
      const v = visita.current;
      if (!v) return;
      if (document.visibilityState === 'hidden') latidoFinal(token, v.id, v.clave);
      else latidoVisita(token, v.id, v.clave, { reanudar: true }).catch(() => undefined);
    };
    document.addEventListener('visibilitychange', alCambiarVisibilidad);
    return () => {
      detenido = true;
      if (intervalo) window.clearInterval(intervalo);
      document.removeEventListener('visibilitychange', alCambiarVisibilidad);
    };
  }, [datos, token]);

  const descargar = useCallback(() => {
    const v = visita.current;
    if (v) latidoVisita(token, v.id, v.clave, { descarga: true }).catch(() => undefined);
    if (datos) {
      // El nombre del PDF sale del título de la pestaña
      const antes = document.title;
      document.title = [datos.numero, datos.cliente.nombre].filter(Boolean).join(' - ');
      window.print();
      document.title = antes;
    } else {
      window.print();
    }
  }, [datos, token]);

  const estilo = useMemo(
    () =>
      datos
        ? ({ '--cp-principal': datos.empresa.colorPrincipal, '--cp-acento': datos.empresa.colorAcento } as CSSProperties)
        : undefined,
    [datos],
  );

  if (cargando) {
    return (
      <div className="cp-page cp-centro">
        <div className="cp-cargando" role="status">
          <RefreshCw size={20} className="cp-girando" aria-hidden="true" /> Abriendo tu cotización…
        </div>
      </div>
    );
  }

  if (error || !datos) {
    return (
      <div className="cp-page cp-centro">
        <div className="cp-aviso-error" role="alert">
          <TriangleAlert size={28} aria-hidden="true" />
          <h1>No pudimos abrir esta cotización</h1>
          <p>{error}</p>
        </div>
      </div>
    );
  }

  const { cotizacion: c, asesor } = datos;
  const logo = logoDe(datos.empresa);
  const saludo = datos.cliente.contacto.split(' - ')[0] || datos.cliente.nombre;
  const mensajeWhatsapp = encodeURIComponent(`Hola ${asesor.nombre.split(' ')[0] || ''}, tengo una consulta sobre la cotización ${datos.numero}.`);
  const hayProductos = c.bloques.length > 0;
  let n = 0;

  const filaProducto = (f: FilaProductoPublica, key: string) => {
    n++;
    return (
      <tr key={key}>
        <td className="cp-num" data-label="#">{n}</td>
        <td className="cp-desc" data-label="Producto">
          <span>{f.nombre}</span>
          <small>
            {f.modelo}
            {f.admiteInstalacion && (
              <span className={`cp-inst${f.instalacionIncluida ? ' si' : ''}`}>
                {f.instalacionIncluida ? 'Instalación incluida' : 'Sin instalación'}
              </span>
            )}
          </small>
        </td>
        <td className="cp-centro-txt" data-label="Cant.">
          <span>
            {f.cantidad}
            {f.unidad && <small> {f.unidad}</small>}
          </span>
        </td>
        <td className="cp-der" data-label="Precio unit.">{money(f.precioUnitario)}</td>
        <td className="cp-der cp-fuerte" data-label="Total">{money(f.total)}</td>
      </tr>
    );
  };

  return (
    <div className="cp-page" style={estilo}>
      <header className="cp-barra">
        <div className="cp-barra-in">
          <div className={`cp-logo${logo.enCaja ? ' en-caja' : ''}`}>
            {logo.src ? <img src={logo.src} alt={datos.empresa.nombre} /> : <strong>{datos.empresa.nombre}</strong>}
          </div>
          <button type="button" className="cp-btn cp-btn-sec cp-no-imprimir" onClick={descargar}>
            <Download size={16} aria-hidden="true" /> Descargar PDF
          </button>
        </div>
      </header>

      <main className="cp-contenido">
        {interna && (
          <div className="cp-nota-interna cp-no-imprimir" role="note">
            Estás viendo el enlace con tu sesión de {datos.empresa.nombre}: tus visitas y respuestas no cuentan como del
            cliente.
          </div>
        )}

        <section className="cp-hero">
          <div className="cp-hero-texto">
            <p className="cp-eyebrow">Cotización {datos.numero}</p>
            <h1>{saludo ? `Hola, ${saludo}` : 'Tu cotización'}</h1>
            <p className="cp-hero-sub">
              Te compartimos la propuesta que preparamos{datos.cliente.nombre ? ` para ${datos.cliente.nombre}` : ''}. Si algo no
              te queda claro, tu asesor está a un mensaje de distancia.
            </p>
            <div className="cp-chips">
              <span className="cp-chip">
                <CalendarClock size={14} aria-hidden="true" /> Emitida el {isoToDMY(datos.fecha)}
              </span>
              {datos.vencida ? (
                <span className="cp-chip cp-chip-alerta">
                  <TriangleAlert size={14} aria-hidden="true" /> La oferta venció el {isoToDMY(datos.validaHasta)}: confirma
                  precios con tu asesor
                </span>
              ) : (
                <span className="cp-chip">Válida hasta el {isoToDMY(datos.validaHasta)}</span>
              )}
              {datos.actualizadaEn && (
                <span className="cp-chip cp-chip-info">
                  <RefreshCw size={14} aria-hidden="true" /> Actualizada el {fechaLarga(datos.actualizadaEn)}
                </span>
              )}
            </div>
          </div>
          <div className="cp-hero-total">
            <span>Total a pagar</span>
            <strong>{money(c.totales.total)}</strong>
            <small>IVA incluido · USD</small>
          </div>
        </section>

        <div className="cp-grid">
          <div className="cp-principal">
            {(datos.cliente.nombre || datos.cliente.ruc || datos.cliente.direccion) && (
              <section className="cp-card cp-cliente">
                <h2>Datos del cliente</h2>
                <dl>
                  {datos.cliente.nombre && (
                    <div>
                      <dt>Cliente</dt>
                      <dd>{datos.cliente.nombre}</dd>
                    </div>
                  )}
                  {datos.cliente.ruc && (
                    <div>
                      <dt>RUC / Cédula</dt>
                      <dd>{datos.cliente.ruc}</dd>
                    </div>
                  )}
                  {datos.cliente.contacto && (
                    <div>
                      <dt>Contacto</dt>
                      <dd>{datos.cliente.contacto}</dd>
                    </div>
                  )}
                  {datos.cliente.direccion && (
                    <div>
                      <dt>Dirección</dt>
                      <dd>{datos.cliente.direccion}</dd>
                    </div>
                  )}
                </dl>
              </section>
            )}

            {hayProductos && (
              <section className="cp-card">
                <h2>Productos y equipos</h2>
                <table className="cp-tabla">
                  <thead>
                    <tr>
                      <th className="cp-num">#</th>
                      <th>Producto</th>
                      <th className="cp-centro-txt">Cant.</th>
                      <th className="cp-der">Precio unit.</th>
                      <th className="cp-der">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {c.bloques.map((b, i) =>
                      b.tipo === 'kit' ? (
                        <Fragment key={`k${i}`}>
                          <tr className="cp-kit">
                            <td colSpan={5}>
                              <Package size={15} aria-hidden="true" /> {b.nombre}
                              {b.cantidad > 1 && <small> × {b.cantidad}</small>}
                              <span className="cp-kit-total">{money(b.total)}</span>
                            </td>
                          </tr>
                          {b.filas.map((f, j) => filaProducto(f, `k${i}-${j}`))}
                        </Fragment>
                      ) : (
                        filaProducto(b.fila, `p${i}`)
                      ),
                    )}
                  </tbody>
                </table>
              </section>
            )}

            {c.custodias.length > 0 && (
              <section className="cp-card">
                <h2>Servicio de custodia móvil</h2>
                <ServiciosTabla filas={c.custodias} />
              </section>
            )}

            {c.instalaciones.length > 0 && (
              <section className="cp-card">
                <h2>Servicios de instalación</h2>
                <ServiciosTabla filas={c.instalaciones} />
              </section>
            )}

            {(datos.condiciones.length > 0 || datos.notas) && (
              <section className="cp-card cp-condiciones">
                {datos.condiciones.length > 0 && (
                  <>
                    <h2>Condiciones comerciales</h2>
                    <ul>
                      {datos.condiciones.map((l, i) => {
                        const p = partirCondicion(l);
                        return (
                          <li key={i}>
                            {p ? (
                              <>
                                <strong>{p.etiqueta}:</strong> {p.valor}
                              </>
                            ) : (
                              l
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  </>
                )}
                {datos.notas && (
                  <>
                    <h2>Notas</h2>
                    <p className="cp-notas">{datos.notas}</p>
                  </>
                )}
              </section>
            )}
          </div>

          <aside className="cp-lateral">
            <section className="cp-card cp-totales" aria-label="Totales de la cotización">
              <h2>Resumen</h2>
              {c.totales.productos > 0 && <Linea etiqueta="Productos" valor={c.totales.productos} />}
              {c.totales.instalaciones > 0 && <Linea etiqueta="Instalaciones" valor={c.totales.instalaciones} />}
              {c.totales.custodia > 0 && <Linea etiqueta="Custodia móvil" valor={c.totales.custodia} />}
              {c.totales.descuento > 0 && (
                <>
                  <Linea etiqueta="Total antes del descuento" valor={c.totales.base} />
                  <div className="cp-linea cp-descuento">
                    <span>
                      Descuento{datos.descuento.porcentaje !== null ? ` (${datos.descuento.porcentaje}%)` : ''}
                    </span>
                    <span>-{money(c.totales.descuento)}</span>
                  </div>
                </>
              )}
              <Linea etiqueta="Subtotal" valor={c.totales.subtotal} />
              <Linea etiqueta="IVA 15%" valor={c.totales.iva} />
              <div className="cp-linea cp-total">
                <span>Total</span>
                <span>{money(c.totales.total)}</span>
              </div>
            </section>

            <section className="cp-card cp-asesor">
              <h2>Tu asesor</h2>
              <div className="cp-asesor-fila">
                <div className="cp-avatar" aria-hidden="true">
                  {iniciales(asesor.nombre) || '·'}
                </div>
                <div>
                  <strong>{asesor.nombre || datos.empresa.nombre}</strong>
                  {asesor.cargo && <small>{asesor.cargo}</small>}
                  <small>{asesor.telefono}</small>
                </div>
              </div>
              <div className="cp-asesor-botones cp-no-imprimir">
                {asesor.whatsapp && (
                  <a
                    className="cp-btn cp-btn-whatsapp"
                    href={`https://wa.me/${asesor.whatsapp}?text=${mensajeWhatsapp}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <MessageCircle size={16} aria-hidden="true" /> Escribir por WhatsApp
                  </a>
                )}
                <a className="cp-btn cp-btn-sec" href={`tel:${asesor.telefono.replace(/[^\d+]/g, '')}`}>
                  <Phone size={16} aria-hidden="true" /> Llamar
                </a>
              </div>
            </section>

            <Respuesta token={token} interna={interna} />
          </aside>
        </div>

        <footer className="cp-legal">
          Los precios están expresados en dólares de los Estados Unidos de América (USD) y el IVA del 15% se muestra
          desglosado. La oferta es válida por 15 días calendario desde la fecha de emisión; los precios pueden variar sin
          previo aviso por fluctuaciones del mercado y disponibilidad del proveedor. Para confirmar la orden, responde a tu
          asesor por escrito.
        </footer>
      </main>

      {/* «Descargar PDF» imprime SOLO esta hoja: la misma del Cotizador de la app */}
      <HojaCotizacion d={hojaDe(datos, logo.enCaja ? logo.src : null)} />
    </div>
  );
}

function Linea({ etiqueta, valor }: { etiqueta: string; valor: number }) {
  return (
    <div className="cp-linea">
      <span>{etiqueta}</span>
      <span>{money(valor)}</span>
    </div>
  );
}

function ServiciosTabla({ filas }: { filas: CotizacionPublica['cotizacion']['custodias'] }) {
  return (
    <table className="cp-tabla">
      <thead>
        <tr>
          <th className="cp-num">#</th>
          <th>Servicio</th>
          <th className="cp-centro-txt">Cant.</th>
          <th className="cp-der">Precio unit.</th>
          <th className="cp-der">Total</th>
        </tr>
      </thead>
      <tbody>
        {filas.map((f, i) => (
          <tr key={i}>
            <td className="cp-num" data-label="#">{i + 1}</td>
            <td className="cp-desc" data-label="Servicio">
              <span>{f.descripcion}</span>
              {f.detalle && <small>{f.detalle}</small>}
            </td>
            <td className="cp-centro-txt" data-label="Cant.">{f.cantidad}</td>
            <td className="cp-der" data-label="Precio unit.">{money(f.precioUnitario)}</td>
            <td className="cp-der cp-fuerte" data-label="Total">{money(f.total)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** «Me interesa» / «Tengo dudas»: avisa al asesor dentro de la app. */
function Respuesta({ token, interna }: { token: string; interna: boolean }) {
  const [tipo, setTipo] = useState<'interesa' | 'dudas' | null>(null);
  const [mensaje, setMensaje] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [enviado, setEnviado] = useState<'interesa' | 'dudas' | null>(null);
  const [error, setError] = useState('');
  const errorRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    if (error) errorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [error]);

  const enviar = async () => {
    if (!tipo) return;
    setEnviando(true);
    setError('');
    try {
      await responderCotizacion(token, tipo, mensaje);
      setEnviado(tipo);
    } catch (e) {
      const m = (e as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setError(m || 'No pudimos enviar tu respuesta. Inténtalo de nuevo o escríbele a tu asesor por WhatsApp.');
    } finally {
      setEnviando(false);
    }
  };

  if (enviado) {
    return (
      <section className="cp-card cp-respuesta cp-no-imprimir" aria-live="polite">
        <div className="cp-gracias">
          <CheckCircle2 size={28} aria-hidden="true" />
          <strong>{enviado === 'interesa' ? '¡Gracias por tu interés!' : 'Recibimos tu consulta'}</strong>
          <p>
            {interna
              ? 'Es una prueba con tu sesión de la empresa: no se avisó a nadie.'
              : 'Ya le avisamos a tu asesor. Te contactará pronto.'}
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className="cp-card cp-respuesta cp-no-imprimir">
      <h2>¿Qué te pareció?</h2>
      <div className="cp-respuesta-botones" role="group" aria-label="Tu respuesta">
        <button
          type="button"
          className={`cp-btn ${tipo === 'interesa' ? 'cp-btn-pri' : 'cp-btn-sec'}`}
          aria-pressed={tipo === 'interesa'}
          onClick={() => setTipo('interesa')}
        >
          <ThumbsUp size={16} aria-hidden="true" /> Me interesa
        </button>
        <button
          type="button"
          className={`cp-btn ${tipo === 'dudas' ? 'cp-btn-pri' : 'cp-btn-sec'}`}
          aria-pressed={tipo === 'dudas'}
          onClick={() => setTipo('dudas')}
        >
          <HelpCircle size={16} aria-hidden="true" /> Tengo dudas
        </button>
      </div>
      {tipo && (
        <div className="cp-respuesta-form">
          <label htmlFor="cp-mensaje">
            {tipo === 'interesa' ? '¿Algo que debamos saber? (opcional)' : '¿Qué te gustaría consultar? (opcional)'}
          </label>
          <textarea
            id="cp-mensaje"
            rows={3}
            maxLength={500}
            value={mensaje}
            onChange={(e) => setMensaje(e.target.value)}
            placeholder={tipo === 'interesa' ? 'Ej.: ¿cuándo podrían instalar?' : 'Ej.: ¿la garantía incluye mantenimiento?'}
          />
          {error && (
            <p className="cp-error" ref={errorRef} role="alert">
              {error}
            </p>
          )}
          <button type="button" className="cp-btn cp-btn-pri cp-ancho" onClick={enviar} disabled={enviando}>
            {enviando ? 'Enviando…' : 'Enviar a mi asesor'}
          </button>
        </div>
      )}
    </section>
  );
}
