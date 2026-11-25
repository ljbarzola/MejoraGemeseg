import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  AlertTriangle, Camera, CheckCircle2, ClipboardList, Cloud, CloudOff, Flag, Menu, MapPin, MessageSquarePlus, PenLine, Phone, Plus, Send, UploadCloud,
} from 'lucide-react';
import type {
  EstadoViaje, FotoPedida, MomentoFoto, PuntoCampo, TipoNovedad, ViajeCampo, CambioGuia,
} from '../../types/custodiaCampo';
import { ETIQUETA_ESTADO, NOVEDADES, etiquetaNovedad } from '../../types/custodiaCampo';
import type { GuiaCustodia } from '../../types/custodiaGuia';
import { camposFaltantes, type GrupoCampos } from '../../utils/guiaCampo';
import { horaEC, telefonoLlamable } from '../../utils/formatoCampo';
import BotonFoto, { type FotoElegida } from './BotonFoto';
import DatosGuia from './DatosGuia';
import FirmaPad from './FirmaPad';
import FotosSlot from './FotosSlot';
import Hoja from './Hoja';

/** Una foto lista para guardar: comprimida, con su hora y de dónde salió (cámara o galería). */
export type FotoTomada = FotoElegida;

export interface FotoVista {
  uuid: string;
  momento: MomentoFoto;
  etiqueta?: string | null;
  puntoId?: number | null;
  /** Miniatura local (solo la hay de las fotos tomadas en este celular desde que se abrió la pantalla). */
  url: string | null;
  tomadaEn: string;
  pendiente: boolean;
}

export interface VistaViaje {
  viaje: ViajeCampo;
  /** Estado que se ve en pantalla: el del servidor más lo que está en la cola sin enviar. */
  estado: EstadoViaje;
  guia: GuiaCustodia;
  grupos: GrupoCampos[];
  horaSalida: string | null;
  horaLlegada: string | null;
  puntos: (PuntoCampo & { marcado: string | null; pendiente: boolean })[];
  puntosLibres: { texto: string; ocurridoEn: string }[];
  novedades: { clientUuid: string; novedadTipo: TipoNovedad; texto?: string | null; ocurridoEn: string; pendiente: boolean }[];
  /** Lo que el custodio ya avisó sobre los datos del viaje (las que aún no subieron llevan `pendiente`). */
  observaciones: { clientUuid: string; texto: string; ocurridoEn: string; autorNombre?: string | null; pendiente: boolean }[];
  fotos: FotoVista[];
  firmas: { momento: 'SALIDA' | 'LLEGADA'; nombre: string; firmadaEn: string; pendiente: boolean }[];
}

export interface AccionesViaje {
  /** Una o varias fotos para un pedido («Carga», «Sellos»…): se guardan juntas. */
  onFotoSlot: (momento: MomentoFoto, etiqueta: string, fotos: FotoTomada[]) => Promise<void>;
  onSalida: (texto?: string) => Promise<void>;
  onLlegada: (texto?: string) => Promise<void>;
  onPunto: (dato: { puntoId?: number; texto?: string }, foto: FotoTomada | null) => Promise<void>;
  onNovedad: (dato: { tipo: TipoNovedad; texto: string }, foto: FotoTomada | null) => Promise<void>;
  onFotoLibre: (foto: FotoTomada, comentario: string) => Promise<void>;
  onFirma: (momento: 'SALIDA' | 'LLEGADA', f: { png: string; nombre: string; cedula: string }) => Promise<void>;
  onDatos: (cambios: CambioGuia[]) => Promise<void>;
  /** El custodio avisa que algo de los datos del viaje está mal o distinto. */
  onObservacion: (texto: string) => Promise<void>;
}

export interface Senal {
  tipo: 'ok' | 'pendiente' | 'sin';
  pendientes: number;
  onReintentar: () => void;
}

const claseEstado = (e: EstadoViaje) => (e === 'EN_CAMINO' ? ' cp-estado--camino' : e === 'LLEGO' ? ' cp-estado--llego' : '');

function Dato({ etiqueta, valor }: { etiqueta: string; valor?: ReactNode }) {
  if (valor === null || valor === undefined || valor === '') return null;
  return <div className="cp-dato"><small>{etiqueta}</small><span>{valor}</span></div>;
}

function BloqueFirma({ momento, titulo, firma, obligatoria, onAbrir }: {
  momento: 'SALIDA' | 'LLEGADA';
  titulo: string;
  firma: VistaViaje['firmas'][number] | undefined;
  obligatoria: boolean;
  onAbrir: (m: 'SALIDA' | 'LLEGADA') => void;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, borderTop: '1px solid #e2e8f0', paddingTop: 12 }}>
      <h3>{titulo}{obligatoria ? ' *' : ''}</h3>
      {firma ? (
        <div className="cp-firma-ok"><CheckCircle2 size={22} /> Firmó {firma.nombre} a las {horaEC(firma.firmadaEn)}{firma.pendiente ? ' · por subir' : ''}</div>
      ) : (
        <p className="cp-texto">{obligatoria ? 'Es obligatoria para continuar.' : 'Pídele al cliente que firme con el dedo.'}</p>
      )}
      <button type="button" className={`cp-btn${firma ? ' cp-btn--suave' : ' cp-btn--primario'}`} onClick={() => onAbrir(momento)}>
        <PenLine size={22} /> {firma ? 'Firmar de nuevo' : 'Pedir firma'}
      </button>
    </div>
  );
}

/** Una foto elegida dentro de una hoja (punto, novedad, foto libre): se ve antes de guardarla. */
function FotoEnHoja({ foto, onFoto, onError, texto = 'Tomar foto' }: { foto: (FotoTomada & { url: string }) | null; onFoto: (f: FotoTomada) => void; onError: (m: string) => void; texto?: string }) {
  return (
    <div className="cp-campo">
      {foto && <img src={foto.url} alt="Foto tomada" style={{ width: '100%', maxHeight: 220, objectFit: 'cover', borderRadius: 12, border: '2px solid #15803d' }} />}
      <BotonFoto texto={foto ? 'Tomar otra' : texto} hecha={!!foto} ancha onFotos={(l) => { if (l[0]) onFoto(l[0]); }} onError={onError} />
    </div>
  );
}

function useFotoLocal() {
  const [foto, setFoto] = useState<(FotoTomada & { url: string }) | null>(null);
  const ref = useRef<string | null>(null);
  useEffect(() => () => { if (ref.current) URL.revokeObjectURL(ref.current); }, []);
  const poner = (f: FotoTomada) => {
    if (ref.current) URL.revokeObjectURL(ref.current);
    const url = URL.createObjectURL(f.miniatura);
    ref.current = url;
    setFoto({ ...f, url });
  };
  return { foto, poner };
}

function HojaPunto({ punto, onClose, onGuardar, onError }: {
  punto: PuntoCampo;
  onClose: () => void;
  onGuardar: (foto: FotoTomada | null) => Promise<void>;
  onError: (m: string) => void;
}) {
  const { foto, poner } = useFotoLocal();
  const [guardando, setGuardando] = useState(false);
  return (
    <Hoja titulo={`Punto ${punto.orden}: ${punto.nombre}`} onClose={onClose} bloqueada={guardando}>
      <p className="cp-texto">Se guarda la hora de ahora. La foto es opcional.</p>
      <FotoEnHoja foto={foto} onFoto={poner} onError={onError} texto="Foto del punto (opcional)" />
      <button type="button" className="cp-btn cp-btn--ok" disabled={guardando} onClick={async () => { setGuardando(true); try { await onGuardar(foto); } finally { setGuardando(false); } }}>
        <MapPin size={24} /> {guardando ? 'Guardando...' : 'Marcar ahora'}
      </button>
    </Hoja>
  );
}

function HojaPuntoLibre({ onClose, onGuardar }: { onClose: () => void; onGuardar: (texto: string) => Promise<void> }) {
  const [texto, setTexto] = useState('');
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);
  return (
    <Hoja titulo="Punto no previsto" onClose={onClose} bloqueada={guardando}>
      {error && <div className="cp-msg cp-msg--error" role="alert">{error}</div>}
      <div className="cp-campo">
        <label htmlFor="punto-libre">¿Dónde están?</label>
        <input id="punto-libre" value={texto} onChange={(e) => setTexto(e.target.value)} maxLength={160} placeholder="Ej: Gasolinera km 52" autoComplete="off" />
      </div>
      <button type="button" className="cp-btn cp-btn--primario" disabled={guardando} onClick={async () => {
        if (!texto.trim()) { setError('Escribe dónde están.'); return; }
        setGuardando(true);
        try { await onGuardar(texto.trim()); } finally { setGuardando(false); }
      }}>{guardando ? 'Guardando...' : 'Guardar punto'}</button>
    </Hoja>
  );
}

function HojaNovedad({ onClose, onGuardar, onError }: {
  onClose: () => void;
  onGuardar: (dato: { tipo: TipoNovedad; texto: string }, foto: FotoTomada | null) => Promise<void>;
  onError: (m: string) => void;
}) {
  const [tipo, setTipo] = useState<TipoNovedad | null>(null);
  const [texto, setTexto] = useState('');
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);
  const { foto, poner } = useFotoLocal();
  return (
    <Hoja titulo="Novedad" onClose={onClose} bloqueada={guardando}>
      {error && <div className="cp-msg cp-msg--error" role="alert">{error}</div>}
      <div className="cp-opciones" role="group" aria-label="Tipo de novedad">
        {NOVEDADES.map((n) => (
          <button key={n.valor} type="button" className="cp-opcion" aria-pressed={tipo === n.valor} onClick={() => setTipo(n.valor)}>{n.etiqueta}</button>
        ))}
      </div>
      <div className="cp-campo">
        <label htmlFor="novedad-texto">¿Qué pasó?{tipo === 'OTRO' ? ' *' : ''}</label>
        <textarea id="novedad-texto" value={texto} onChange={(e) => setTexto(e.target.value)} maxLength={500} />
      </div>
      <FotoEnHoja foto={foto} onFoto={poner} onError={onError} texto="Foto (opcional)" />
      <button type="button" className="cp-btn cp-btn--primario" disabled={guardando} onClick={async () => {
        if (!tipo) { setError('Elige qué tipo de novedad es.'); return; }
        if (tipo === 'OTRO' && !texto.trim()) { setError('Cuéntanos qué pasó.'); return; }
        setGuardando(true);
        try { await onGuardar({ tipo, texto: texto.trim() }, foto); } finally { setGuardando(false); }
      }}><Send size={22} /> {guardando ? 'Enviando...' : 'Enviar novedad'}</button>
    </Hoja>
  );
}

function HojaFotoLibre({ onClose, onGuardar, onError }: {
  onClose: () => void;
  onGuardar: (foto: FotoTomada, comentario: string) => Promise<void>;
  onError: (m: string) => void;
}) {
  const [comentario, setComentario] = useState('');
  const [guardando, setGuardando] = useState(false);
  const { foto, poner } = useFotoLocal();
  return (
    <Hoja titulo="Foto" onClose={onClose} bloqueada={guardando}>
      <FotoEnHoja foto={foto} onFoto={poner} onError={onError} />
      <div className="cp-campo">
        <label htmlFor="foto-comentario">Comentario (opcional)</label>
        <input id="foto-comentario" value={comentario} onChange={(e) => setComentario(e.target.value)} maxLength={200} autoComplete="off" />
      </div>
      <button type="button" className="cp-btn cp-btn--primario" disabled={!foto || guardando} onClick={async () => {
        if (!foto) return;
        setGuardando(true);
        try { await onGuardar(foto, comentario.trim()); } finally { setGuardando(false); }
      }}>{guardando ? 'Guardando...' : 'Guardar foto'}</button>
    </Hoja>
  );
}

/** El custodio le avisa a Operaciones que algo de los datos del viaje está mal o distinto. */
function HojaObservacion({ onClose, onGuardar }: { onClose: () => void; onGuardar: (texto: string) => Promise<void> }) {
  const [texto, setTexto] = useState('');
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);
  return (
    <Hoja titulo="Agregar observación" onClose={onClose} bloqueada={guardando}>
      <p className="cp-texto">Cuéntale a Operaciones qué está mal o distinto en los datos del viaje. Ejemplo: «Fueron 3 contenedores, no 2».</p>
      {error && <div className="cp-msg cp-msg--error" role="alert">{error}</div>}
      <div className="cp-campo">
        <label htmlFor="obs-texto">¿Qué está mal o distinto? *</label>
        <textarea id="obs-texto" value={texto} onChange={(e) => setTexto(e.target.value)} maxLength={500} />
      </div>
      <button type="button" className="cp-btn cp-btn--primario" disabled={guardando} onClick={async () => {
        if (!texto.trim()) { setError('Escribe la observación.'); return; }
        setGuardando(true);
        try { await onGuardar(texto.trim()); } finally { setGuardando(false); }
      }}><Send size={22} /> {guardando ? 'Enviando...' : 'Enviar observación'}</button>
    </Hoja>
  );
}

/** «Faltan fotos»: el botón no se bloquea, pero hay que escribir por qué (queda anotado en el viaje). */
function HojaFaltanFotos({ faltan, boton, onClose, onConfirmar }: {
  faltan: string[];
  boton: string;
  onClose: () => void;
  onConfirmar: (motivo: string) => Promise<void>;
}) {
  const [motivo, setMotivo] = useState('');
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);
  return (
    <Hoja titulo="Faltan fotos" onClose={onClose} bloqueada={guardando}>
      <div className="cp-msg cp-msg--aviso">No tomaste: {faltan.join(', ')}.</div>
      {error && <div className="cp-msg cp-msg--error" role="alert">{error}</div>}
      <div className="cp-campo">
        <label htmlFor="motivo-fotos">¿Por qué no las tomaste? *</label>
        <textarea id="motivo-fotos" value={motivo} onChange={(e) => setMotivo(e.target.value)} maxLength={300} />
      </div>
      <button type="button" className="cp-btn cp-btn--primario" disabled={guardando} onClick={async () => {
        if (!motivo.trim()) { setError('Escribe el motivo para poder continuar.'); return; }
        setGuardando(true);
        try { await onConfirmar(motivo.trim()); } finally { setGuardando(false); }
      }}>{guardando ? 'Guardando...' : boton}</button>
      <button type="button" className="cp-btn cp-btn--suave" onClick={onClose} disabled={guardando}>Volver a tomar las fotos</button>
    </Hoja>
  );
}

type HojaAbierta =
  | { tipo: 'punto'; punto: PuntoCampo }
  | { tipo: 'libre' }
  | { tipo: 'novedad' }
  | { tipo: 'foto' }
  | { tipo: 'datos' }
  | { tipo: 'observacion' }
  | { tipo: 'firma'; momento: 'SALIDA' | 'LLEGADA' }
  | { tipo: 'faltan'; momento: 'SALIDA' | 'LLEGADA'; faltan: string[] }
  | { tipo: 'menu' };

export default function PantallaViaje({
  vista, acciones, senal, nombreUsuario, onSalir, onError, alertas,
}: {
  vista: VistaViaje;
  acciones: AccionesViaje;
  senal: Senal;
  nombreUsuario: string;
  onSalir: () => void;
  onError: (m: string) => void;
  alertas: ReactNode;
}) {
  const { viaje } = vista;
  const [hoja, setHoja] = useState<HojaAbierta | null>(null);
  const [verDatos, setVerDatos] = useState(false);
  const [mensaje, setMensaje] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const mensajeRef = useRef<HTMLDivElement>(null);

  useEffect(() => { if (mensaje) mensajeRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }); }, [mensaje]);

  // Los errores de foto y de acciones se muestran en el cuerpo (lo ve quien ya bajó) y no se pierden.
  const avisar = (m: string) => { setMensaje(m); onError(m); };
  const cerrar = () => setHoja(null);
  // Guardar desde una hoja: si sale bien se cierra; si falla, la hoja se cierra y el aviso queda en el cuerpo.
  const seguro = async (f: () => Promise<void>) => {
    try { await f(); } catch { setMensaje('No se pudo guardar en el celular. Inténtalo de nuevo.'); }
    cerrar();
  };
  const hacer = async (f: () => Promise<void>) => {
    setMensaje('');
    setOcupado(true);
    try { await f(); } catch { setMensaje('No se pudo guardar en el celular. Inténtalo de nuevo.'); } finally { setOcupado(false); }
  };

  const terminado = vista.estado === 'LLEGO' || viaje.soloLectura;
  // Las fotos que se piden salen de la configuración (por tipo de servicio); la pantalla no las trae escritas.
  const pedidasSalida = viaje.fotosPedidas?.SALIDA ?? [];
  const pedidasLlegada = viaje.fotosPedidas?.LLEGADA ?? [];
  const fotosDe = (momento: MomentoFoto, etiqueta: string) =>
    vista.fotos.filter((f) => f.momento === momento && f.etiqueta === etiqueta);
  // Un pedido está hecho con al menos una foto; solo se pide explicar los OBLIGATORIOS que faltan.
  const faltanDe = (momento: 'SALIDA' | 'LLEGADA', lista: FotoPedida[]) =>
    lista.filter((p) => p.obligatoria && fotosDe(momento, p.nombre).length === 0).map((p) => p.nombre);
  const firmaDe = (m: 'SALIDA' | 'LLEGADA') => vista.firmas.find((f) => f.momento === m);
  const pideFirmaSalida = viaje.firmaMomento === 'SALIDA' || viaje.firmaMomento === 'AMBOS';
  const pideFirmaLlegada = viaje.firmaMomento === 'LLEGADA' || viaje.firmaMomento === 'AMBOS';
  const faltanDatos = camposFaltantes(vista.grupos);
  const fotosLibres = vista.fotos.filter((f) => f.momento !== 'SALIDA' && f.momento !== 'LLEGADA');

  const salimos = () => {
    setMensaje('');
    if (pideFirmaSalida && viaje.firmaObligatoria && !firmaDe('SALIDA')) { avisar('Falta la firma de entrega en origen.'); return; }
    const faltan = faltanDe('SALIDA', pedidasSalida);
    if (faltan.length) { setHoja({ tipo: 'faltan', momento: 'SALIDA', faltan }); return; }
    void hacer(() => acciones.onSalida());
  };
  const llegamos = () => {
    setMensaje('');
    if (pideFirmaLlegada && viaje.firmaObligatoria && !firmaDe('LLEGADA')) { avisar('Falta la firma de recepción en destino.'); return; }
    if (faltanDatos.length) { avisar(`Faltan datos obligatorios: ${faltanDatos.join(', ')}. Usa «Completar datos».`); return; }
    const faltan = faltanDe('LLEGADA', pedidasLlegada);
    if (faltan.length) { setHoja({ tipo: 'faltan', momento: 'LLEGADA', faltan }); return; }
    void hacer(() => acciones.onLlegada());
  };

  const botonDatos = vista.grupos.length > 0 && (
    <button type="button" className="cp-btn" onClick={() => setHoja({ tipo: 'datos' })}>
      <ClipboardList size={22} /> Completar datos{faltanDatos.length ? ` (${faltanDatos.length} por llenar)` : ''}
    </button>
  );

  const filasFotos = (momento: 'SALIDA' | 'LLEGADA', lista: FotoPedida[]) =>
    lista.map((pedido) => (
      <FotosSlot
        key={pedido.nombre} pedido={pedido} fotos={fotosDe(momento, pedido.nombre)}
        deshabilitada={ocupado} viajeCreadoEn={viaje.creadoEn} onError={avisar}
        onFotos={(fs) => { void hacer(() => acciones.onFotoSlot(momento, pedido.nombre, fs)); }}
      />
    ));

  return (
    <>
      <header className="cp-cabecera">
        <div className="cp-cabecera-fila">
          <div style={{ minWidth: 0 }}>
            <div className="cp-cabecera-guia">{viaje.numeroGuia} <span className={`cp-estado${claseEstado(vista.estado)}`}>{ETIQUETA_ESTADO[vista.estado] ?? vista.estado}</span></div>
            <div className="cp-cabecera-cliente">{viaje.cliente?.nombre || 'Sin cliente'}</div>
          </div>
          <div className="cp-cabecera-acciones">
            {viaje.telefonoOperaciones && (
              <a className="cp-icono-btn cp-icono-btn--llamar" href={`tel:${telefonoLlamable(viaje.telefonoOperaciones)}`} aria-label="Llamar a Operaciones" title="Llamar a Operaciones">
                <Phone size={22} />
              </a>
            )}
            <button type="button" className="cp-icono-btn" onClick={() => setHoja({ tipo: 'menu' })} aria-label="Menú"><Menu size={24} /></button>
          </div>
        </div>
        <div className={`cp-senal cp-senal--${senal.tipo}`} role="status">
          {senal.tipo === 'sin' ? <CloudOff size={20} /> : senal.tipo === 'pendiente' ? <UploadCloud size={20} /> : <Cloud size={20} />}
          <span>
            {senal.tipo === 'sin' ? `Sin señal${senal.pendientes ? ` · ${senal.pendientes} por subir` : ''}` : senal.tipo === 'pendiente' ? `${senal.pendientes} por subir` : 'Todo enviado'}
          </span>
          {senal.tipo !== 'ok' && <button type="button" onClick={senal.onReintentar}>Reintentar</button>}
        </div>
      </header>

      <main className="cp-cuerpo">
        {alertas}
        {mensaje && <div className="cp-msg cp-msg--error" role="alert" ref={mensajeRef}>{mensaje}</div>}

        {/* Datos del viaje (solo lectura, plegable) */}
        <section className="cp-card">
          <button type="button" className="cp-btn cp-btn--suave" onClick={() => setVerDatos((v) => !v)} aria-expanded={verDatos}>
            {verDatos ? 'Ocultar datos del viaje' : 'Ver datos del viaje'}
          </button>
          {verDatos && (
            <>
              <Dato etiqueta="Salida" valor={[viaje.salida.ciudad, viaje.salida.direccion].filter(Boolean).join(' · ')} />
              <Dato etiqueta="Llegada" valor={[viaje.llegada.ciudad, viaje.llegada.direccion].filter(Boolean).join(' · ')} />
              {viaje.contactoSitio && (viaje.contactoSitio.nombre || viaje.contactoSitio.telefono) && (
                <Dato etiqueta="Contacto en sitio" valor={
                  <>
                    {viaje.contactoSitio.nombre}
                    {viaje.contactoSitio.telefono && <> · <a href={`tel:${telefonoLlamable(viaje.contactoSitio.telefono)}`}>{viaje.contactoSitio.telefono}</a></>}
                  </>
                } />
              )}
              <Dato etiqueta="Patrulla" valor={viaje.patrulla} />
              <Dato etiqueta="Placa" valor={viaje.placa} />
              {viaje.personal.map((p) => <Dato key={`${p.rol}${p.nombre}`} etiqueta={p.etiqueta ?? p.rol} valor={p.nombre} />)}
              {(vista.guia.contenedores ?? []).map((c, i) => <Dato key={`c${i}`} etiqueta={`Contenedor ${i + 1}`} valor={[c.numero, c.guia && `Guía ${c.guia}`].filter(Boolean).join(' · ')} />)}
              {(vista.guia.haciendas ?? []).map((h, i) => <Dato key={`h${i}`} etiqueta={`Hacienda ${i + 1}`} valor={[h.nombre, h.sacos ? `${h.sacos} sacos` : ''].filter(Boolean).join(' · ')} />)}
              {vista.observaciones.length > 0 && (
                <div>
                  <h3 style={{ marginBottom: 6 }}>Observaciones enviadas</h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {vista.observaciones.map((o) => (
                      <div key={o.clientUuid} className="cp-obs">
                        <small>{horaEC(o.ocurridoEn)}{o.autorNombre ? ` · ${o.autorNombre}` : ''}{o.pendiente ? ' · por subir' : ''}</small>
                        <span style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{o.texto}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <button type="button" className="cp-btn" disabled={ocupado} onClick={() => setHoja({ tipo: 'observacion' })}>
                <MessageSquarePlus size={22} /> Agregar observación
              </button>
            </>
          )}
        </section>

        {/* Terminado: resumen de solo lectura */}
        {terminado && (
          <section className="cp-card cp-card--lectura">
            <h2>Viaje terminado</h2>
            <div className="cp-resumen">
              <div className="cp-resumen-fila"><b>{horaEC(vista.horaSalida)}</b><span>Salida</span></div>
              {vista.puntos.filter((p) => p.marcado).map((p) => (
                <div key={p.id} className="cp-resumen-fila"><b>{horaEC(p.marcado)}</b><span>{p.nombre}</span></div>
              ))}
              {vista.puntosLibres.map((p, i) => <div key={i} className="cp-resumen-fila"><b>{horaEC(p.ocurridoEn)}</b><span>{p.texto}</span></div>)}
              {vista.novedades.map((n) => (
                <div key={n.clientUuid} className="cp-resumen-fila"><b>{horaEC(n.ocurridoEn)}</b><span>Novedad: {etiquetaNovedad(n.novedadTipo)}{n.texto ? ` — ${n.texto}` : ''}</span></div>
              ))}
              <div className="cp-resumen-fila"><b>{horaEC(vista.horaLlegada)}</b><span>Llegada</span></div>
            </div>
            <Dato etiqueta="Fotos" valor={String(vista.fotos.length)} />
            {vista.firmas.map((f) => <Dato key={f.momento} etiqueta={f.momento === 'SALIDA' ? 'Firma en origen' : 'Firma en destino'} valor={`${f.nombre} · ${horaEC(f.firmadaEn)}`} />)}
          </section>
        )}

        {/* 1. Salida */}
        {!terminado && vista.estado === 'LISTO_PARA_CUSTODIAR' && (
          <section className="cp-card">
            <h2>1. Salida</h2>
            {pedidasSalida.length > 0 && (
              <>
                <h3>Fotos de salida</h3>
                <div>{filasFotos('SALIDA', pedidasSalida)}</div>
              </>
            )}
            {pideFirmaSalida && (
              <BloqueFirma momento="SALIDA" titulo="Firma de entrega en origen" firma={firmaDe('SALIDA')} obligatoria={viaje.firmaObligatoria} onAbrir={(m) => setHoja({ tipo: 'firma', momento: m })} />
            )}
            {botonDatos}
            <button type="button" className="cp-btn cp-btn--ok" disabled={ocupado} onClick={salimos}><Flag size={26} /> Salimos</button>
          </section>
        )}

        {/* 2. En ruta + 3. Llegada */}
        {!terminado && vista.estado === 'EN_CAMINO' && (
          <>
            <section className="cp-card">
              <h2>En ruta</h2>
              <p className="cp-texto">Salimos a las {horaEC(vista.horaSalida)}</p>

              {vista.viaje.ruta && vista.puntos.length > 0 && (
                <div>
                  <h3 style={{ marginBottom: 4 }}>Ruta: {vista.viaje.ruta.nombre}</h3>
                  {vista.puntos.map((p) => (
                    <div key={p.id} className={`cp-punto${p.marcado ? ' cp-punto--marcado' : ''}`}>
                      <div className="cp-punto-num">{p.marcado ? '✓' : p.orden}</div>
                      <div className="cp-punto-info">
                        <strong>{p.nombre}</strong>
                        <small className={p.marcado ? 'cp-hecho' : undefined}>
                          {p.marcado ? `Marcado a las ${horaEC(p.marcado)}${p.pendiente ? ' · por subir' : ''}` : p.minutosDesdeAnterior ? `${p.minutosDesdeAnterior} min desde el anterior` : 'Sin marcar'}
                        </small>
                      </div>
                      {!p.marcado && (
                        <button type="button" className="cp-btn cp-btn--chico" disabled={ocupado} onClick={() => setHoja({ tipo: 'punto', punto: p })}>Marcar</button>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {vista.puntosLibres.length > 0 && (
                <div>
                  <h3 style={{ marginBottom: 4 }}>Puntos no previstos</h3>
                  {vista.puntosLibres.map((p, i) => <div key={i} className="cp-resumen-fila"><b>{horaEC(p.ocurridoEn)}</b><span>{p.texto}</span></div>)}
                </div>
              )}

              <button type="button" className="cp-btn" disabled={ocupado} onClick={() => setHoja({ tipo: 'libre' })}><Plus size={22} /> Punto no previsto</button>
              <div className="cp-fila-botones">
                <button type="button" className="cp-btn cp-btn--peligro" disabled={ocupado} onClick={() => setHoja({ tipo: 'novedad' })}><AlertTriangle size={22} /> Novedad</button>
                <button type="button" className="cp-btn" disabled={ocupado} onClick={() => setHoja({ tipo: 'foto' })}><Camera size={22} /> Foto</button>
              </div>
              {botonDatos}

              {vista.novedades.length > 0 && (
                <div>
                  <h3 style={{ marginBottom: 4 }}>Novedades enviadas</h3>
                  {vista.novedades.map((n) => (
                    <div key={n.clientUuid} className="cp-resumen-fila"><b>{horaEC(n.ocurridoEn)}</b><span>{etiquetaNovedad(n.novedadTipo)}{n.texto ? ` — ${n.texto}` : ''}{n.pendiente ? ' · por subir' : ''}</span></div>
                  ))}
                </div>
              )}
              {fotosLibres.length > 0 && (
                <div>
                  <h3 style={{ marginBottom: 6 }}>Fotos del recorrido ({fotosLibres.length})</h3>
                  <div className="cp-tira">
                    {fotosLibres.map((f) => (f.url ? <img key={f.uuid} src={f.url} alt="Foto del recorrido" /> : <div key={f.uuid} className="cp-miniatura-vacia"><CheckCircle2 size={22} color="#15803d" /></div>))}
                  </div>
                </div>
              )}
            </section>

            <section className="cp-card">
              <h2>Llegada</h2>
              {pedidasLlegada.length > 0 && (
                <>
                  <h3>Fotos de llegada</h3>
                  <div>{filasFotos('LLEGADA', pedidasLlegada)}</div>
                </>
              )}
              {pideFirmaLlegada && (
                <BloqueFirma momento="LLEGADA" titulo="Firma de recepción en destino" firma={firmaDe('LLEGADA')} obligatoria={viaje.firmaObligatoria} onAbrir={(m) => setHoja({ tipo: 'firma', momento: m })} />
              )}
              <button type="button" className="cp-btn cp-btn--ok" disabled={ocupado} onClick={llegamos}><Flag size={26} /> Llegamos</button>
            </section>
          </>
        )}
      </main>

      {hoja?.tipo === 'punto' && (
        <HojaPunto
          punto={hoja.punto} onClose={cerrar} onError={avisar}
          onGuardar={(foto) => seguro(() => acciones.onPunto({ puntoId: hoja.punto.id }, foto))}
        />
      )}
      {hoja?.tipo === 'libre' && <HojaPuntoLibre onClose={cerrar} onGuardar={(texto) => seguro(() => acciones.onPunto({ texto }, null))} />}
      {hoja?.tipo === 'novedad' && (
        <HojaNovedad onClose={cerrar} onError={avisar} onGuardar={(dato, foto) => seguro(() => acciones.onNovedad(dato, foto))} />
      )}
      {hoja?.tipo === 'foto' && (
        <HojaFotoLibre onClose={cerrar} onError={avisar} onGuardar={(foto, c) => seguro(() => acciones.onFotoLibre(foto, c))} />
      )}
      {hoja?.tipo === 'observacion' && (
        <HojaObservacion onClose={cerrar} onGuardar={(texto) => seguro(() => acciones.onObservacion(texto))} />
      )}
      {hoja?.tipo === 'datos' && (
        <DatosGuia grupos={vista.grupos} onClose={cerrar} onGuardar={(cambios) => { cerrar(); if (cambios.length) void hacer(() => acciones.onDatos(cambios)); }} />
      )}
      {hoja?.tipo === 'firma' && (
        <FirmaPad
          titulo={hoja.momento === 'SALIDA' ? 'Firma de entrega en origen' : 'Firma de recepción en destino'}
          onClose={cerrar}
          onGuardar={(f) => { const m = hoja.momento; cerrar(); void hacer(() => acciones.onFirma(m, f)); }}
        />
      )}
      {hoja?.tipo === 'faltan' && (
        <HojaFaltanFotos
          faltan={hoja.faltan}
          boton={hoja.momento === 'SALIDA' ? 'Salimos igual' : 'Llegamos igual'}
          onClose={cerrar}
          onConfirmar={async (motivo) => {
            const texto = `Sin fotos (${hoja.faltan.join(', ')}). Motivo: ${motivo}`;
            cerrar();
            await hacer(() => (hoja.momento === 'SALIDA' ? acciones.onSalida(texto) : acciones.onLlegada(texto)));
          }}
        />
      )}
      {hoja?.tipo === 'menu' && (
        <Hoja titulo="Menú" onClose={cerrar}>
          <p className="cp-texto">Sesión de <strong>{nombreUsuario}</strong></p>
          {senal.pendientes > 0 && (
            <div className="cp-msg cp-msg--aviso">Hay {senal.pendientes} por subir. Si sales ahora, se enviarán cuando vuelvas a entrar con señal.</div>
          )}
          <button type="button" className="cp-btn cp-btn--peligro" onClick={() => { cerrar(); onSalir(); }}>Salir</button>
          <button type="button" className="cp-btn cp-btn--suave" onClick={cerrar}>Cancelar</button>
        </Hoja>
      )}
    </>
  );
}
