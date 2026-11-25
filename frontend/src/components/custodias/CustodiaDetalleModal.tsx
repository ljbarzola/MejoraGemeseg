import { useEffect, useState } from 'react';
import { Mail } from 'lucide-react';
import { descargarOrdenCustodia, getCustodia } from '../../services/custodia.service';
import { etiquetaMomento, type EtiquetaCampo, type GuiaCustodia, type ValorCampo } from '../../types/custodiaGuia';
import type { ObservacionCustodio } from '../../types/custodiaCampo';
import ErrorBanner from '../common/ErrorBanner';
import EnviarGuiaModal from './EnviarGuiaModal';
import RecorridoCampo from './RecorridoCampo';

const ESTADO_LABELS: Record<string, string> = {
  LISTO_PARA_CUSTODIAR: 'LISTO PARA CUSTODIAR',
  EN_CAMINO: 'EN CAMINO',
  LLEGO: 'LLEGÓ',
};

const ESTADO_COLORS: Record<string, string> = {
  LISTO_PARA_CUSTODIAR: '#eab308',
  EN_CAMINO: '#3b82f6',
  LLEGO: '#22c55e',
};

const TIPO_LABELS: Record<string, string> = {
  HACIENDA: 'Hacienda',
  PUERTO: 'Puerto',
  VIP: 'VIP',
};

function formatFecha(date: string) {
  if (!date) return '—';
  const d = new Date(date);
  return d.toLocaleDateString('es-EC', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function formatFechaHora(date: string) {
  if (!date) return '—';
  const d = new Date(date);
  return d.toLocaleDateString('es-EC', { day: '2-digit', month: '2-digit', year: 'numeric' }) +
    ' ' + d.toLocaleTimeString('es-EC', { hour: '2-digit', minute: '2-digit', hour12: false });
}

const rotulo: React.CSSProperties = { fontSize: '0.72rem', color: '#718096', fontWeight: 700, textTransform: 'uppercase' };
const titulo: React.CSSProperties = { fontSize: '0.78rem', fontWeight: 700, color: '#1e3a5f', marginBottom: 8, textTransform: 'uppercase' };
const caja: React.CSSProperties = { padding: 12, background: '#f8fafc', borderRadius: 10 };

function Dato({ etiqueta, valor, mono = false }: { etiqueta: string; valor?: string | number | null; mono?: boolean }) {
  return (
    <div>
      <div style={rotulo}>{etiqueta}</div>
      <div style={{ fontSize: '0.86rem', fontWeight: 600, fontFamily: mono ? 'monospace' : undefined }}>
        {valor === null || valor === undefined || valor === '' ? '—' : valor}
      </div>
    </div>
  );
}

const valorLegible = (v: ValorCampo | undefined) => (v === true ? 'Sí' : v === false ? 'No' : v === null || v === undefined || v === '' ? '—' : String(v));

/** Los campos configurados de un bloque, con el nombre con que se guardaron (sellos primero). */
function listarCampos(campos: Record<string, ValorCampo> | undefined, etiquetas: Record<string, EtiquetaCampo> | undefined) {
  return Object.entries(campos ?? {})
    .filter(([, v]) => v !== null && v !== undefined && v !== '')
    .map(([id, v]) => ({ id, nombre: etiquetas?.[id]?.nombre ?? 'Campo', valor: valorLegible(v), esSello: !!etiquetas?.[id]?.esSello, orden: etiquetas?.[id]?.orden ?? 999 }))
    .sort((a, b) => Number(b.esSello) - Number(a.esSello) || a.orden - b.orden);
}

function Campos({ lista }: { lista: ReturnType<typeof listarCampos> }) {
  if (!lista.length) return null;
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, marginTop: 10 }}>
      {lista.map((c) => <Dato key={c.id} etiqueta={c.nombre} valor={c.valor} />)}
    </div>
  );
}

interface Props {
  custodia: any;
  onClose: () => void;
  /** Quien puede editar viajes también puede enviar la guía al cliente. */
  puedeEnviar?: boolean;
}

export default function CustodiaDetalleModal({ custodia: base, onClose, puedeEnviar = false }: Props) {
  const [errorPdf, setErrorPdf] = useState('');
  const [bajando, setBajando] = useState(false);
  const [completa, setCompleta] = useState<any>(null);
  const [enviando, setEnviando] = useState(false);
  // Lo que el custodio avisó desde el celular sobre los datos del viaje (las lee RecorridoCampo).
  const [observaciones, setObservaciones] = useState<ObservacionCustodio[]>([]);

  // La fila del listado no trae la ruta con sus puntos, el cliente del Directorio ni el momento de firma efectivo.
  useEffect(() => {
    setCompleta(null);
    setObservaciones([]);
    if (!base?.id) return;
    let vigente = true;
    getCustodia(base.id).then((c) => { if (vigente) setCompleta(c); }).catch(() => { /* se muestra lo que trae la lista */ });
    return () => { vigente = false; };
  }, [base?.id]);

  // Un viaje en camino se refresca solo cada 30 s (si la pestaña está a la vista): estado, llegada y datos del celular.
  const estadoActual = completa?.estado ?? base?.estado;
  useEffect(() => {
    if (!base?.id || estadoActual !== 'EN_CAMINO') return;
    const t = window.setInterval(() => {
      if (document.visibilityState === 'visible') getCustodia(base.id).then(setCompleta).catch(() => { /* se conserva lo que se ve */ });
    }, 30_000);
    return () => window.clearInterval(t);
  }, [base?.id, estadoActual]);

  if (!base) return null;
  const custodia = { ...base, ...(completa ?? {}) };
  const guia: GuiaCustodia = custodia.guia ?? {};
  const etiquetas = guia.etiquetas;

  const bajarPdf = async () => {
    setErrorPdf('');
    setBajando(true);
    try {
      await descargarOrdenCustodia(custodia.id, custodia.numeroGuia);
    } catch {
      setErrorPdf('No se pudo generar la orden en PDF. Inténtalo de nuevo.');
    } finally {
      setBajando(false);
    }
  };

  const personal = [
    { label: 'Chofer', name: custodia.choferName, cedula: custodia.choferCedula, color: '#eab308' },
    { label: 'Custodio 1', name: custodia.custodio1Name, cedula: custodia.custodio1Cedula, color: '#3b82f6' },
    { label: 'Custodio 2', name: custodia.custodio2Name, cedula: custodia.custodio2Cedula, color: '#3b82f6' },
    { label: 'Custodio 3', name: custodia.custodio3Name, cedula: custodia.custodio3Cedula, color: '#3b82f6' },
    { label: 'Custodio 4', name: custodia.custodio4Name, cedula: custodia.custodio4Cedula, color: '#3b82f6' },
  ].filter((p) => p.name);

  const quienACargo = (rol: string) => {
    if (rol === 'chofer') return custodia.choferName || 'Chofer';
    const n = Number(rol.replace('custodio', ''));
    return n ? `${custodia[`custodio${n}Name`] || '—'} (Custodio ${n})` : rol;
  };

  const nombreCustodio = (ref?: string | null) => {
    const n = ref ? Number(ref.replace('custodio', '')) : 0;
    return n ? `Custodio ${n}: ${custodia[`custodio${n}Name`] || '—'}` : '';
  };

  // Un viaje viejo no tiene contenedores ni haciendas en la guía: se leen de las columnas de antes.
  const contenedores = guia.contenedores ?? [];
  const contenedoresViejos: string[] = !contenedores.length && custodia.tipoCustodia === 'PUERTO' ? (custodia.contenedores ?? []) : [];
  const haciendas = guia.haciendas ?? [];
  const haciendaVieja = !haciendas.length && custodia.tipoCustodia === 'HACIENDA' && custodia.nombreHacienda;
  const generales = listarCampos(guia.campos, etiquetas);
  const ruta = custodia.ruta;
  const momento = custodia.firmaMomentoEfectivo ?? guia.firmaMomento;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-ventas-lg" role="dialog" aria-modal="true" aria-labelledby="detalle-custodia-titulo" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <h3 id="detalle-custodia-titulo">Orden de Custodia</h3>
            <p style={{ margin: '4px 0 0', color: '#718096', fontSize: '0.85rem' }}>{custodia.numeroGuia}</p>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {puedeEnviar && (
              <button type="button" className="btn-secondary" onClick={() => setEnviando(true)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <Mail size={15} /> Enviar al cliente
              </button>
            )}
            <button type="button" className="auth-btn" onClick={bajarPdf} disabled={bajando}>
              {bajando ? 'Generando...' : 'PDF'}
            </button>
            <button type="button" className="modal-close" onClick={onClose} aria-label="Cerrar">✕</button>
          </div>
        </div>

        <div className="modal-body">
          <ErrorBanner mensaje={errorPdf} />

          {/* Lo que el custodio dice que está mal o distinto en los datos del viaje: interno, no sale en el PDF ni en el enlace de fotos. */}
          {observaciones.length > 0 && (
            <div style={{ padding: 12, background: '#fffbeb', borderRadius: 10, border: '1px solid #f6ad55' }} role="status">
              <div style={{ ...titulo, color: '#b7791f' }}>Observaciones del custodio ({observaciones.length})</div>
              <div style={{ fontSize: '0.78rem', color: '#975a16', marginBottom: 8 }}>Revísalas y corrige el viaje si hace falta. Son internas: no salen en el PDF ni en el enlace de fotos.</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {observaciones.map((o) => (
                  <div key={o.id} style={{ padding: '8px 10px', background: '#fff', borderRadius: 8, border: '1px solid #fbd38d' }}>
                    <div style={{ fontSize: '0.74rem', color: '#718096' }}>
                      {o.autorNombre || 'Custodio'} · {formatFechaHora(o.ocurridoEn)}
                    </div>
                    <div style={{ fontSize: '0.86rem', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{o.texto}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 14 }}>
            <div>
              <div style={rotulo}>Tipo</div>
              <span style={{ padding: '3px 10px', borderRadius: 12, background: '#eab30820', color: '#1e3a5f', fontSize: '0.8rem', fontWeight: 600 }}>
                {TIPO_LABELS[custodia.tipoCustodia] || custodia.tipoCustodia}
              </span>
            </div>
            <div>
              <div style={rotulo}>Estado</div>
              <span style={{ padding: '3px 10px', borderRadius: 12, background: `${ESTADO_COLORS[custodia.estado]}20`, color: ESTADO_COLORS[custodia.estado], fontSize: '0.8rem', fontWeight: 600 }}>
                {ESTADO_LABELS[custodia.estado] || custodia.estado}
              </span>
            </div>
            <Dato etiqueta="Cliente" valor={custodia.cliente} />
            <Dato etiqueta="Placa Gemeseg" valor={custodia.placa} mono />
            <Dato etiqueta="Patrulla" valor={custodia.patrulla} />
            <Dato etiqueta="Firma del cliente" valor={momento ? etiquetaMomento(momento) : '—'} />
            {(custodia.dispositivo || custodia.dispositivoId) && <Dato etiqueta="Celular" valor={custodia.dispositivo?.nombre ?? `N.º ${custodia.dispositivoId}`} />}
            {custodia.custodioACargo && <Dato etiqueta="Custodio a cargo" valor={quienACargo(custodia.custodioACargo)} />}
          </div>

          {guia.contactoSitio && (guia.contactoSitio.nombre || guia.contactoSitio.telefono) && (
            <div style={caja}>
              <div style={titulo}>Contacto en sitio</div>
              <div style={{ fontSize: '0.86rem', fontWeight: 600 }}>
                {guia.contactoSitio.nombre || '—'}{guia.contactoSitio.telefono ? ` · ${guia.contactoSitio.telefono}` : ''}
              </div>
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div style={caja}>
              <div style={titulo}>Salida</div>
              <div style={{ fontSize: '0.86rem', fontWeight: 600 }}>{[custodia.ciudadSalida, custodia.direccionSalida].filter(Boolean).join(' · ') || '—'}</div>
              <div style={{ fontSize: '0.78rem', color: '#718096' }}>{formatFechaHora(custodia.fechaHoraSalida)}</div>
            </div>
            <div style={caja}>
              <div style={titulo}>Llegada</div>
              <div style={{ fontSize: '0.86rem', fontWeight: 600 }}>{[custodia.ciudadLlegada, custodia.direccionLlegada].filter(Boolean).join(' · ') || '—'}</div>
              <div style={{ fontSize: '0.78rem', color: '#718096' }}>{formatFechaHora(custodia.fechaHoraLlegada)}</div>
            </div>
          </div>

          <div>
            <div style={titulo}>Personal asignado</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 10 }}>
              {personal.map((p) => (
                <div key={p.label} style={{ padding: 10, background: '#f8fafc', borderRadius: 8, borderLeft: `3px solid ${p.color}` }}>
                  <div style={{ fontSize: '0.68rem', color: '#718096', fontWeight: 700 }}>{p.label}</div>
                  <div style={{ fontSize: '0.85rem', fontWeight: 600 }}>{p.name}</div>
                  {p.cedula && <div style={{ fontSize: '0.72rem', color: '#718096' }}>{p.cedula}</div>}
                </div>
              ))}
            </div>
          </div>

          {contenedores.length > 0 && (
            <div style={{ padding: 12, background: '#eff6ff', borderRadius: 10, border: '1px solid #3b82f640' }}>
              <div style={titulo}>Contenedores</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 10 }}>
                {contenedores.map((c, i) => (
                  <div key={i} style={{ padding: 10, background: '#fff', borderRadius: 8, border: '1px solid #e2e8f0' }}>
                    <div style={{ fontWeight: 700, fontSize: '0.88rem', marginBottom: 6 }}>{i + 1}. {c.numero}</div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                      <Dato etiqueta="Guía" valor={c.guia} />
                      <Dato etiqueta="Lote" valor={c.lote} />
                      <Dato etiqueta="Chofer del cabezal" valor={[c.choferNombre, c.choferCedula].filter(Boolean).join(' · ')} />
                      <Dato etiqueta="Placa del cabezal" valor={c.placaCabezal} mono />
                    </div>
                    <Campos lista={listarCampos(c.campos, etiquetas)} />
                    {c.cabina && (c.cabina.custodio || c.cabina.placa || c.cabina.tipoVehiculo) && (
                      <div style={{ marginTop: 10, paddingTop: 8, borderTop: '1px dashed #e2e8f0' }}>
                        <div style={rotulo}>Custodio de cabina interna</div>
                        <div style={{ fontSize: '0.84rem', fontWeight: 600 }}>
                          {[nombreCustodio(c.cabina.custodio), c.cabina.placa, c.cabina.tipoVehiculo].filter(Boolean).join(' · ')}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {contenedoresViejos.length > 0 && (
            <div style={{ padding: 12, background: '#eff6ff', borderRadius: 10, border: '1px solid #3b82f640' }}>
              <div style={titulo}>Contenedores</div>
              <div style={{ fontSize: '0.9rem', fontWeight: 600 }}>{contenedoresViejos.join(', ')}</div>
            </div>
          )}

          {(guia.furgon || haciendas.length > 0 || haciendaVieja) && (
            <div style={{ padding: 12, background: '#fefce8', borderRadius: 10, border: '1px solid #eab30840' }}>
              {guia.furgon && (guia.furgon.placa || guia.furgon.choferNombre) && (
                <div style={{ marginBottom: 10 }}>
                  <div style={titulo}>Furgón</div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10 }}>
                    <Dato etiqueta="Placa" valor={guia.furgon.placa} mono />
                    <Dato etiqueta="Chofer" valor={guia.furgon.choferNombre} />
                    <Dato etiqueta="Cédula" valor={guia.furgon.choferCedula} />
                  </div>
                </div>
              )}
              <div style={titulo}>Haciendas</div>
              {haciendas.map((h, i) => (
                <div key={i} style={{ padding: 10, background: '#fff', borderRadius: 8, border: '1px solid #e2e8f0', marginBottom: 8 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10 }}>
                    <Dato etiqueta={`Hacienda ${i + 1}`} valor={h.nombre} />
                    <Dato etiqueta="Guía" valor={h.guia} />
                    <Dato etiqueta="Sacos" valor={h.sacos} />
                  </div>
                  <Campos lista={listarCampos(h.campos, etiquetas)} />
                </div>
              ))}
              {haciendaVieja && (
                <div style={{ fontSize: '0.9rem', fontWeight: 600 }}>{custodia.nombreHacienda} — {custodia.cantidadSacos} sacos</div>
              )}
            </div>
          )}

          {ruta && (
            <div style={caja}>
              <div style={titulo}>Ruta: {ruta.nombre}{ruta.minutosTotal ? ` · ${ruta.minutosTotal} min en total` : ''}</div>
              {(ruta.origen || ruta.destino) && <div style={{ fontSize: '0.82rem', color: '#4a5568', marginBottom: 6 }}>{ruta.origen || '—'} ➔ {ruta.destino || '—'}</div>}
              {ruta.puntos?.length > 0 && (
                <ol style={{ margin: 0, paddingLeft: 20, fontSize: '0.84rem', lineHeight: 1.6 }}>
                  {ruta.puntos.map((p: any) => (
                    <li key={p.id}>{p.nombre}{p.minutosDesdeAnterior ? <span style={{ color: '#718096' }}> · {p.minutosDesdeAnterior} min desde el anterior</span> : null}</li>
                  ))}
                </ol>
              )}
            </div>
          )}

          {generales.length > 0 && (
            <div style={caja}>
              <div style={titulo}>Otros datos de la guía</div>
              <Campos lista={generales} />
            </div>
          )}

          {custodia.observaciones && (
            <div style={caja}>
              <div style={titulo}>Observaciones</div>
              <div style={{ fontSize: '0.85rem', whiteSpace: 'pre-wrap' }}>{custodia.observaciones}</div>
            </div>
          )}

          <RecorridoCampo custodiaId={custodia.id} estado={custodia.estado} conCelular={!!(custodia.dispositivo || custodia.dispositivoId)} onObservaciones={setObservaciones} />

          <div style={{ fontSize: '0.72rem', color: '#718096', textAlign: 'right' }}>
            Registrado: {formatFecha(custodia.createdAt)}
          </div>
        </div>
      </div>

      {enviando && <EnviarGuiaModal custodia={custodia} observaciones={observaciones.length} onClose={() => setEnviando(false)} />}
    </div>
  );
}
