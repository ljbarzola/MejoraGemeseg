import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, RefreshCw, Smartphone } from 'lucide-react';
import {
  abrirSesionCampo, cerrarSesionCampo, clasificarError, enviarCambiosGuia, enviarEventos, enviarFirma, enviarFoto,
  getEstadoCampo, getViajeCampo, guardarSesion, guardarSnapshot, guardarTokenCelular, leerSnapshot,
  sesionGuardada, tokenCelular, tomarUbicacion, vincularCelular,
  type DatosFoto, type EventoEnvio, type SesionGuardada,
} from '../../services/custodiaCampo.service';
import type {
  CambioGuia, EstadoCelular, EstadoViaje, MomentoFoto, TipoNovedad, Ubicacion, ViajeCampo,
} from '../../types/custodiaCampo';
import {
  encolar, listarPendientes, nuevoUuid, procesarCola, type Pendiente, type ResultadoEnvio,
} from '../../utils/colaCampo';
import { aplicarCambios, gruposDelCustodio } from '../../utils/guiaCampo';
import { registrarSwCampo } from '../../utils/registrarSwCampo';
import PantallaViaje, {
  type AccionesViaje, type FotoTomada, type FotoVista, type VistaViaje,
} from '../../components/campo/PantallaViaje';
import '../../styles/campo.css';

type Pantalla = 'cargando' | 'vincular' | 'sin_viaje' | 'entrar' | 'viaje' | 'sin_conexion';

const ubicacionDe = (u: Ubicacion | null) => (u ? { lat: u.lat, lng: u.lng, precisionM: u.precisionM } : {});

/** «ABCD-1234»: se escribe en mayúsculas y el guion se pone solo. */
function formatearCodigo(texto: string): string {
  const limpio = texto.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
  return limpio.length > 4 ? `${limpio.slice(0, 4)}-${limpio.slice(4)}` : limpio;
}

/** Manda UN elemento de la cola al servidor y dice qué hacer con el resultado. */
async function enviarUno(p: Pendiente): Promise<ResultadoEnvio> {
  try {
    switch (p.tipo) {
      case 'evento': {
        const resultados = await enviarEventos([p.payload]);
        const mio = resultados.find((r) => r.clientUuid === p.payload.clientUuid) ?? resultados[0];
        if (mio && !mio.ok) return { ok: false, clase: 'rechazado', mensaje: (mio.error || 'El servidor no aceptó este registro.').slice(0, 240) };
        return { ok: true };
      }
      case 'foto':
        await enviarFoto(p.payload.foto, p.payload.miniatura, p.payload.datos);
        return { ok: true };
      case 'firma':
        await enviarFirma(p.payload);
        return { ok: true };
      case 'guia':
        await enviarCambiosGuia(p.payload.cambios);
        return { ok: true };
      default:
        return { ok: true };
    }
  } catch (err) {
    const c = clasificarError(err, 'El servidor no aceptó este registro.');
    return { ok: false, clase: c.clase, mensaje: c.mensaje };
  }
}

function Centro({ titulo, texto, children }: { titulo: string; texto?: string; children?: React.ReactNode }) {
  return (
    <main className="cp-centro">
      <Smartphone size={44} color="#12375f" aria-hidden="true" />
      <h1 className="cp-titulo">{titulo}</h1>
      {texto && <p className="cp-texto">{texto}</p>}
      {children}
    </main>
  );
}

function PantallaVincular({ aviso, onVinculado }: { aviso: string; onVinculado: () => void }) {
  const [codigo, setCodigo] = useState('');
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);

  async function vincular() {
    setError('');
    if (codigo.replace('-', '').length < 8) { setError('El código tiene 8 letras o números. Revísalo.'); return; }
    setEnviando(true);
    try {
      const r = await vincularCelular(codigo);
      guardarTokenCelular(r.token);
      onVinculado();
    } catch (err) {
      const c = clasificarError(err, 'Código incorrecto o vencido. Pide uno nuevo a Operaciones.');
      setError(c.clase === 'sin_red' ? 'Sin señal. Conéctate e inténtalo otra vez.' : c.mensaje);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Centro titulo="Vincular este celular" texto="Lo hace Operaciones una sola vez por celular. Pide el código de vinculación: son 8 letras y números y vale 10 minutos.">
      <p className="cp-texto">No es el PIN. Tu PIN de 4 números se pide después, al entrar al viaje.</p>
      {aviso && <div className="cp-msg cp-msg--aviso">{aviso}</div>}
      {error && <div className="cp-msg cp-msg--error" role="alert">{error}</div>}
      <div className="cp-campo">
        <label htmlFor="codigo">Código de vinculación</label>
        <input id="codigo" className="cp-codigo" value={codigo} onChange={(e) => setCodigo(formatearCodigo(e.target.value))} placeholder="XXXX-XXXX" autoCapitalize="characters" autoComplete="off" autoCorrect="off" spellCheck={false} />
      </div>
      <button type="button" className="cp-btn cp-btn--primario" onClick={vincular} disabled={enviando}>{enviando ? 'Vinculando...' : 'Vincular celular'}</button>
    </Centro>
  );
}

function PantallaEntrar({ estado, aviso, porSubir, onEntrar, onActualizar }: {
  estado: EstadoCelular;
  aviso: string;
  porSubir: number;
  onEntrar: (s: SesionGuardada) => void;
  onActualizar: () => void;
}) {
  const [cedula, setCedula] = useState('');
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);
  const viaje = estado.viaje!;

  async function entrar() {
    setError('');
    if (!cedula.trim() || pin.length < 4) { setError('Escribe tu cédula y tu PIN de 4 números.'); return; }
    setEnviando(true);
    try {
      const r = await abrirSesionCampo(cedula.trim(), pin);
      const s: SesionGuardada = { token: r.sesion, custodiaId: viaje.id, nombre: r.nombre, rol: r.rol };
      guardarSesion(s);
      onEntrar(s);
    } catch (err) {
      const c = clasificarError(err, 'Cédula o PIN incorrectos');
      setError(c.clase === 'sin_red' ? 'Sin señal. Se necesita señal para entrar.' : c.clase === 'reintentar' ? 'No se pudo entrar ahora. Inténtalo en un momento.' : c.mensaje);
      setPin('');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Centro titulo={`Viaje ${viaje.numeroGuia}`} texto={viaje.cliente ? `Cliente: ${viaje.cliente}` : undefined}>
      {aviso && <div className="cp-msg cp-msg--aviso">{aviso}</div>}
      {porSubir > 0 && <div className="cp-msg cp-msg--aviso">Hay {porSubir} por subir. Se enviarán apenas entres con señal.</div>}
      {error && <div className="cp-msg cp-msg--error" role="alert">{error}</div>}
      <div className="cp-campo">
        <label htmlFor="cedula">Cédula</label>
        <input id="cedula" value={cedula} onChange={(e) => setCedula(e.target.value.replace(/\s/g, ''))} inputMode="numeric" autoComplete="off" maxLength={20} />
      </div>
      <div className="cp-campo">
        <label htmlFor="pin">PIN</label>
        <input id="pin" className="cp-pin" type="password" value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))} inputMode="numeric" autoComplete="off" maxLength={4} placeholder="••••" />
      </div>
      <button type="button" className="cp-btn cp-btn--primario" onClick={entrar} disabled={enviando}>{enviando ? 'Entrando...' : 'Entrar'}</button>
      <button type="button" className="cp-btn cp-btn--suave" onClick={onActualizar}><RefreshCw size={20} /> Actualizar</button>
      <p className="cp-texto">Solo entran las personas asignadas a este viaje (chofer y custodios) que tengan PIN. Si no puedes entrar, pide a Operaciones que te agreguen al viaje o te den un PIN.</p>
    </Centro>
  );
}

/**
 * Pantalla de campo (`/campo`, 2026-11-24, Fase 2 de «Custodias en campo»). La usa el custodio en el celular de la
 * empresa: vincular el celular una vez, entrar con cédula y PIN, y registrar salida, puntos, novedades, fotos, firmas
 * y llegada. Es una página pública (sin sesión de la app, sin menú ni chat): todo pasa por el servidor con el token
 * del celular y el de la sesión del custodio.
 *
 * Sin señal, TODO lo que se hace se guarda primero en el celular (`utils/colaCampo.ts`) y se sube después en orden;
 * el estado en pantalla sale del servidor más lo que está en esa cola, así «Salimos» se ve hecho aunque no haya señal.
 */
export default function CampoPage() {
  const [pantalla, setPantalla] = useState<Pantalla>('cargando');
  const [estado, setEstado] = useState<EstadoCelular | null>(null);
  const [viaje, setViaje] = useState<ViajeCampo | null>(null);
  const [sesion, setSesion] = useState<SesionGuardada | null>(() => sesionGuardada());
  const [pendientes, setPendientes] = useState<Pendiente[]>([]);
  const [rechazos, setRechazos] = useState<{ id: number; titulo: string; mensaje: string }[]>([]);
  const [conectado, setConectado] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine));
  const [sinSenalServidor, setSinSenalServidor] = useState(false);
  const [aviso, setAviso] = useState('');
  const [enProceso, setEnProceso] = useState<{ uuid: string; momento: MomentoFoto; etiqueta: string }[]>([]);

  const estadoRef = useRef<EstadoCelular | null>(null);
  const viajeRef = useRef<ViajeCampo | null>(null);
  const custodiaIdRef = useRef<number | null>(null);
  const sesionRef = useRef<SesionGuardada | null>(sesion);
  const vaciandoRef = useRef(false);
  const contadorRef = useRef(0);
  // Miniaturas de las fotos tomadas en este celular (las que ya subieron no se vuelven a bajar).
  const urlsRef = useRef<Map<string, string>>(new Map());

  useEffect(() => { document.title = 'Custodia en campo'; }, []);
  // Para que la pantalla abra aunque no haya señal (solo en la versión publicada; ver `utils/registrarSwCampo.ts`).
  useEffect(() => { registrarSwCampo(); }, []);
  useEffect(() => {
    const urls = urlsRef.current;
    return () => { urls.forEach((u) => URL.revokeObjectURL(u)); urls.clear(); };
  }, []);

  const refrescarPendientes = useCallback(async () => {
    const id = custodiaIdRef.current;
    if (!id) { setPendientes([]); return; }
    const lista = (await listarPendientes()).filter((p) => p.custodiaId === id);
    for (const p of lista) {
      if (p.tipo === 'foto' && !urlsRef.current.has(p.clientUuid)) urlsRef.current.set(p.clientUuid, URL.createObjectURL(p.payload.miniatura));
    }
    setPendientes(lista);
  }, []);

  // El celular se desvinculó (Operaciones lo revocó): se olvida el token y se pide un código nuevo.
  const celularRevocado = useCallback(() => {
    guardarTokenCelular(null);
    guardarSesion(null);
    guardarSnapshot(null);
    sesionRef.current = null;
    setSesion(null);
    setViaje(null);
    setEstado(null);
    setAviso('Este celular ya no está vinculado. Pide un código de vinculación nuevo a Operaciones.');
    setPantalla('vincular');
  }, []);

  const cargarViaje = useCallback(async () => {
    if (!sesionRef.current) return;
    try {
      const v = await getViajeCampo();
      viajeRef.current = v;
      setViaje(v);
      setSinSenalServidor(false);
      if (estadoRef.current) guardarSnapshot({ estado: estadoRef.current, viaje: v, guardadoEn: Date.now() });
    } catch (err) {
      const c = clasificarError(err);
      if (c.clase === 'no_autorizado') await resolverNoAutorizado();
      else setSinSenalServidor(true);
    }
    // `resolverNoAutorizado` solo usa refs y setters estables.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Un 401 puede ser del celular (revocado) o de la sesión del custodio (cerrada): el estado del celular lo aclara.
  const resolverNoAutorizado = useCallback(async () => {
    try {
      const e = await getEstadoCampo();
      if (e.sesion) return; // la sesión sigue buena: fue un tropiezo
      guardarSesion(null);
      sesionRef.current = null;
      setSesion(null);
      estadoRef.current = e;
      setEstado(e);
      setAviso('Tu sesión se cerró. Entra de nuevo; lo que quedó por subir se enviará.');
      setPantalla(e.viaje ? 'entrar' : 'sin_viaje');
    } catch (err) {
      if (clasificarError(err).clase === 'no_autorizado') celularRevocado();
    }
  }, [celularRevocado]);

  const vaciar = useCallback(async (forzar = false) => {
    const id = custodiaIdRef.current;
    if (!id || !sesionRef.current || vaciandoRef.current) return;
    vaciandoRef.current = true;
    try {
      const r = await procesarCola(id, enviarUno, forzar);
      await refrescarPendientes();
      setSinSenalServidor(r.sinSenal);
      if (r.rechazados.length) {
        setRechazos((prev) => [...prev, ...r.rechazados.map((x) => ({ id: ++contadorRef.current, ...x }))]);
      }
      if (r.sesionVencida) await resolverNoAutorizado();
      else if (r.enviados > 0 || r.rechazados.length) await cargarViaje();
    } finally {
      vaciandoRef.current = false;
    }
  }, [cargarViaje, refrescarPendientes, resolverNoAutorizado]);

  const cargarEstado = useCallback(async () => {
    if (!tokenCelular()) { setPantalla('vincular'); return; }
    try {
      const e = await getEstadoCampo();
      setSinSenalServidor(false);
      estadoRef.current = e;
      setEstado(e);
      custodiaIdRef.current = e.viaje?.id ?? null;
      if (!e.viaje) {
        guardarSesion(null);
        sesionRef.current = null;
        setSesion(null);
        viajeRef.current = null;
        setViaje(null);
        guardarSnapshot({ estado: e, viaje: null, guardadoEn: Date.now() });
        setPantalla('sin_viaje');
        return;
      }
      const s = sesionGuardada();
      if (s && e.sesion && s.custodiaId === e.viaje.id) {
        sesionRef.current = s;
        setSesion(s);
        await refrescarPendientes();
        setPantalla('viaje');
        await cargarViaje();
      } else {
        if (s) guardarSesion(null);
        sesionRef.current = null;
        setSesion(null);
        await refrescarPendientes();
        setPantalla('entrar');
      }
    } catch (err) {
      const c = clasificarError(err);
      if (c.clase === 'no_autorizado') { celularRevocado(); return; }
      // Sin señal: se abre con lo último que se vio, si hay una sesión guardada de ese mismo viaje.
      setSinSenalServidor(true);
      const snap = leerSnapshot();
      const s = sesionGuardada();
      if (snap?.estado.viaje && snap.viaje && s && s.custodiaId === snap.estado.viaje.id) {
        estadoRef.current = snap.estado;
        viajeRef.current = snap.viaje;
        custodiaIdRef.current = snap.estado.viaje.id;
        sesionRef.current = s;
        setEstado(snap.estado);
        setViaje(snap.viaje);
        setSesion(s);
        await refrescarPendientes();
        setPantalla('viaje');
      } else {
        setPantalla('sin_conexion');
      }
    }
  }, [cargarViaje, celularRevocado, refrescarPendientes]);

  useEffect(() => { void cargarEstado(); }, [cargarEstado]);

  // Con el viaje abierto: se reenvía lo pendiente cada 20 s, al volver la señal y al volver a la pantalla.
  useEffect(() => {
    if (pantalla !== 'viaje') return;
    void vaciar(false);
    const t1 = window.setInterval(() => { void vaciar(false); }, 20_000);
    const t2 = window.setInterval(() => { if (document.visibilityState === 'visible') void cargarViaje(); }, 30_000);
    const alConectar = () => { setConectado(true); void vaciar(true); void cargarViaje(); };
    const alDesconectar = () => setConectado(false);
    const alVolver = () => { if (document.visibilityState === 'visible') { void vaciar(true); void cargarViaje(); } };
    window.addEventListener('online', alConectar);
    window.addEventListener('offline', alDesconectar);
    document.addEventListener('visibilitychange', alVolver);
    return () => {
      window.clearInterval(t1);
      window.clearInterval(t2);
      window.removeEventListener('online', alConectar);
      window.removeEventListener('offline', alDesconectar);
      document.removeEventListener('visibilitychange', alVolver);
    };
  }, [pantalla, vaciar, cargarViaje]);

  // ---- Lo que se registra: primero a la cola del celular, después se intenta subir ----

  const despues = useCallback(async () => {
    await refrescarPendientes();
    void vaciar(true);
  }, [refrescarPendientes, vaciar]);

  const idViaje = () => custodiaIdRef.current as number;

  const encolarEvento = useCallback(async (tipo: EventoEnvio['tipo'], extra: Partial<EventoEnvio>, titulo: string, ocurridoEn: string, u: Ubicacion | null, uuid?: string) => {
    const clientUuid = uuid ?? nuevoUuid();
    await encolar({ tipo: 'evento', payload: { clientUuid, tipo, ocurridoEn, ...extra, ...ubicacionDe(u) } }, idViaje(), titulo);
    return clientUuid;
  }, []);

  const encolarFoto = useCallback(async (
    f: FotoTomada,
    meta: { uuid?: string; momento: MomentoFoto; etiqueta?: string; puntoId?: number; eventoUuid?: string; comentario?: string },
    u: Ubicacion | null,
  ) => {
    const uuid = meta.uuid ?? nuevoUuid();
    if (!urlsRef.current.has(uuid)) urlsRef.current.set(uuid, URL.createObjectURL(f.miniatura));
    const datos: DatosFoto = {
      clientUuid: uuid, momento: meta.momento, tomadaEn: f.tomadaEn, origen: f.origen,
      ...(meta.etiqueta ? { etiqueta: meta.etiqueta } : {}),
      ...(meta.puntoId !== undefined ? { puntoId: meta.puntoId } : {}),
      ...(meta.eventoUuid ? { eventoUuid: meta.eventoUuid } : {}),
      ...(meta.comentario ? { comentario: meta.comentario } : {}),
      ...ubicacionDe(u),
    };
    await encolar({ tipo: 'foto', payload: { foto: f.foto, miniatura: f.miniatura, datos } }, idViaje(), `Foto${meta.etiqueta ? ` «${meta.etiqueta}»` : ''}`);
    return uuid;
  }, []);

  const acciones: AccionesViaje = useMemo(() => ({
    onFotoSlot: async (momento, etiqueta, fotos) => {
      // Cada foto lleva su propio uuid; la ubicación se toma una sola vez para todas.
      const lista = fotos.map((f) => ({ f, uuid: nuevoUuid() }));
      for (const { f, uuid } of lista) urlsRef.current.set(uuid, URL.createObjectURL(f.miniatura));
      setEnProceso((l) => [...l, ...lista.map(({ uuid }) => ({ uuid, momento, etiqueta }))]);
      try {
        const u = await tomarUbicacion();
        for (const { f, uuid } of lista) await encolarFoto(f, { uuid, momento, etiqueta }, u);
        await despues();
      } finally {
        const usados = new Set(lista.map((x) => x.uuid));
        setEnProceso((l) => l.filter((x) => !usados.has(x.uuid)));
      }
    },
    onSalida: async (texto) => {
      const ocurridoEn = new Date().toISOString();
      const u = await tomarUbicacion();
      await encolarEvento('SALIDA', texto ? { texto: texto.slice(0, 500) } : {}, 'Salimos', ocurridoEn, u);
      await despues();
    },
    onLlegada: async (texto) => {
      const ocurridoEn = new Date().toISOString();
      const u = await tomarUbicacion();
      await encolarEvento('LLEGADA', texto ? { texto: texto.slice(0, 500) } : {}, 'Llegamos', ocurridoEn, u);
      await despues();
    },
    onPunto: async ({ puntoId, texto }, foto) => {
      const ocurridoEn = new Date().toISOString();
      const u = await tomarUbicacion();
      const eventoUuid = await encolarEvento('PUNTO', { ...(puntoId !== undefined ? { puntoId } : {}), ...(texto ? { texto } : {}) }, puntoId !== undefined ? 'Punto de control' : 'Punto no previsto', ocurridoEn, u);
      if (foto) await encolarFoto(foto, { momento: 'PUNTO', puntoId, eventoUuid, comentario: texto }, u);
      await despues();
    },
    onNovedad: async ({ tipo, texto }, foto) => {
      const ocurridoEn = new Date().toISOString();
      const u = await tomarUbicacion();
      const eventoUuid = await encolarEvento('NOVEDAD', { novedadTipo: tipo, ...(texto ? { texto } : {}) }, 'Novedad', ocurridoEn, u);
      if (foto) await encolarFoto(foto, { momento: 'NOVEDAD', eventoUuid, comentario: texto }, u);
      await despues();
    },
    onFotoLibre: async (foto, comentario) => {
      const u = await tomarUbicacion();
      await encolarFoto(foto, { momento: 'LIBRE', comentario }, u);
      await despues();
    },
    onFirma: async (momento, f) => {
      const firmadaEn = new Date().toISOString();
      const u = await tomarUbicacion();
      await encolar({
        tipo: 'firma',
        payload: { clientUuid: nuevoUuid(), momento, nombre: f.nombre, ...(f.cedula ? { cedula: f.cedula } : {}), imagenPng: f.png, firmadaEn, ...(u ? { lat: u.lat, lng: u.lng } : {}) },
      }, idViaje(), momento === 'SALIDA' ? 'Firma de entrega' : 'Firma de recepción');
      await despues();
    },
    onDatos: async (cambios: CambioGuia[]) => {
      await encolar({ tipo: 'guia', payload: { cambios } }, idViaje(), 'Datos de la guía');
      await despues();
    },
    onObservacion: async (texto) => {
      // Sin ubicación: no hace falta y evita esperar al GPS para algo que es solo texto.
      await encolarEvento('OBSERVACION', { texto: texto.slice(0, 500) }, 'Observación', new Date().toISOString(), null);
      await despues();
    },
  }), [despues, encolarEvento, encolarFoto]);

  async function salir() {
    try { await cerrarSesionCampo(); } catch { /* sin señal: la sesión se cierra en el celular igual */ }
    guardarSesion(null);
    sesionRef.current = null;
    setSesion(null);
    setAviso('');
    setPantalla('entrar');
  }

  // ---- Lo que se ve: servidor + cola ----

  const vista: VistaViaje | null = useMemo(() => {
    if (!viaje) return null;
    const eventos = pendientes.flatMap((p) => (p.tipo === 'evento' ? [p.payload] : []));
    const fotosCola = pendientes.flatMap((p) => (p.tipo === 'foto' ? [p.payload.datos] : []));
    const firmasCola = pendientes.flatMap((p) => (p.tipo === 'firma' ? [p.payload] : []));
    const cambios = pendientes.flatMap((p) => (p.tipo === 'guia' ? p.payload.cambios : []));

    let est: EstadoViaje = viaje.estado;
    const salidaCola = eventos.find((e) => e.tipo === 'SALIDA');
    const llegadaCola = eventos.find((e) => e.tipo === 'LLEGADA');
    if (est === 'LISTO_PARA_CUSTODIAR' && salidaCola) est = 'EN_CAMINO';
    if (est === 'EN_CAMINO' && llegadaCola) est = 'LLEGO';

    const guia = aplicarCambios(viaje.guia ?? {}, cambios);

    const puntos = (viaje.ruta?.puntos ?? []).map((p) => {
      const cola = eventos.find((e) => e.tipo === 'PUNTO' && e.puntoId === p.id);
      return { ...p, marcado: p.marcadoEn ?? cola?.ocurridoEn ?? null, pendiente: !p.marcadoEn && !!cola };
    });
    const puntosLibres = eventos
      .filter((e) => e.tipo === 'PUNTO' && e.puntoId === undefined && e.texto)
      .map((e) => ({ texto: e.texto as string, ocurridoEn: e.ocurridoEn }));

    const novedades = [
      ...viaje.novedades.map((n) => ({ ...n, pendiente: false })),
      ...eventos
        .filter((e) => e.tipo === 'NOVEDAD' && !viaje.novedades.some((n) => n.clientUuid === e.clientUuid))
        .map((e) => ({ clientUuid: e.clientUuid, novedadTipo: (e.novedadTipo ?? 'OTRO') as TipoNovedad, texto: e.texto ?? null, ocurridoEn: e.ocurridoEn, pendiente: true })),
    ].sort((a, b) => new Date(a.ocurridoEn).getTime() - new Date(b.ocurridoEn).getTime());

    const observaciones = [
      ...(viaje.observaciones ?? []).map((o) => ({ clientUuid: o.clientUuid, texto: o.texto ?? '', ocurridoEn: o.ocurridoEn, autorNombre: o.autorNombre, pendiente: false })),
      ...eventos
        .filter((e) => e.tipo === 'OBSERVACION' && !(viaje.observaciones ?? []).some((o) => o.clientUuid === e.clientUuid))
        .map((e) => ({ clientUuid: e.clientUuid, texto: e.texto ?? '', ocurridoEn: e.ocurridoEn, autorNombre: null as string | null, pendiente: true })),
    ].sort((a, b) => new Date(a.ocurridoEn).getTime() - new Date(b.ocurridoEn).getTime());

    const fotos = new Map<string, FotoVista>();
    for (const f of viaje.fotos) {
      fotos.set(f.clientUuid, { uuid: f.clientUuid, momento: f.momento, etiqueta: f.etiqueta, puntoId: f.puntoId, url: urlsRef.current.get(f.clientUuid) ?? null, tomadaEn: f.tomadaEn, pendiente: false });
    }
    for (const d of fotosCola) {
      if (fotos.has(d.clientUuid)) continue;
      fotos.set(d.clientUuid, { uuid: d.clientUuid, momento: d.momento as MomentoFoto, etiqueta: d.etiqueta, puntoId: d.puntoId, url: urlsRef.current.get(d.clientUuid) ?? null, tomadaEn: d.tomadaEn, pendiente: true });
    }
    for (const x of enProceso) {
      if (fotos.has(x.uuid)) continue;
      fotos.set(x.uuid, { uuid: x.uuid, momento: x.momento, etiqueta: x.etiqueta, puntoId: null, url: urlsRef.current.get(x.uuid) ?? null, tomadaEn: new Date().toISOString(), pendiente: true });
    }

    const firmas = new Map<'SALIDA' | 'LLEGADA', VistaViaje['firmas'][number]>();
    for (const f of viaje.firmas) firmas.set(f.momento, { ...f, pendiente: false });
    for (const f of firmasCola) firmas.set(f.momento, { momento: f.momento, nombre: f.nombre, firmadaEn: f.firmadaEn, pendiente: true });

    return {
      viaje,
      estado: est,
      guia,
      grupos: gruposDelCustodio(viaje.tipo, viaje.campos ?? [], guia),
      horaSalida: salidaCola?.ocurridoEn ?? viaje.fechaHoraSalida,
      horaLlegada: llegadaCola?.ocurridoEn ?? viaje.fechaHoraLlegada,
      puntos,
      puntosLibres,
      novedades,
      observaciones,
      fotos: Array.from(fotos.values()).sort((a, b) => new Date(a.tomadaEn).getTime() - new Date(b.tomadaEn).getTime()),
      firmas: Array.from(firmas.values()),
    };
  }, [viaje, pendientes, enProceso]);

  const sinRed = !conectado || sinSenalServidor;
  const senal = {
    tipo: (sinRed ? 'sin' : pendientes.length > 0 ? 'pendiente' : 'ok') as 'ok' | 'pendiente' | 'sin',
    pendientes: pendientes.length,
    onReintentar: () => { void vaciar(true); void cargarViaje(); },
  };

  if (pantalla === 'cargando') {
    return <div className="cp-page"><Centro titulo="Cargando..."><Loader2 size={32} className="cp-girar" /></Centro></div>;
  }
  if (pantalla === 'vincular') {
    return <div className="cp-page"><PantallaVincular aviso={aviso} onVinculado={() => { setAviso(''); setPantalla('cargando'); void cargarEstado(); }} /></div>;
  }
  if (pantalla === 'sin_conexion') {
    return (
      <div className="cp-page">
        <Centro titulo="Sin señal" texto="No se pudo conectar. Revisa tu señal e inténtalo otra vez.">
          <button type="button" className="cp-btn cp-btn--primario" onClick={() => { setPantalla('cargando'); void cargarEstado(); }}><RefreshCw size={20} /> Reintentar</button>
        </Centro>
      </div>
    );
  }
  if (pantalla === 'sin_viaje') {
    return (
      <div className="cp-page">
        <Centro titulo="Sin viaje" texto={`Este celular${estado ? ` («${estado.celular.nombre}»)` : ''} ya está vinculado, pero no tiene un viaje asignado.`}>
          <p className="cp-texto">Pide a Operaciones que lo elija en el viaje, en «Celular y custodio a cargo». Luego toca Actualizar.</p>
          <button type="button" className="cp-btn cp-btn--primario" onClick={() => { setPantalla('cargando'); void cargarEstado(); }}><RefreshCw size={20} /> Actualizar</button>
        </Centro>
      </div>
    );
  }
  if (pantalla === 'entrar' && estado?.viaje) {
    return (
      <div className="cp-page">
        <PantallaEntrar
          estado={estado} aviso={aviso} porSubir={pendientes.length}
          onEntrar={(s) => { sesionRef.current = s; setSesion(s); setAviso(''); setPantalla('cargando'); void cargarEstado(); }}
          onActualizar={() => { setPantalla('cargando'); void cargarEstado(); }}
        />
      </div>
    );
  }
  if (pantalla === 'viaje' && vista && sesion) {
    return (
      <div className="cp-page">
        <PantallaViaje
          vista={vista}
          acciones={acciones}
          senal={senal}
          nombreUsuario={sesion.nombre}
          onSalir={() => { void salir(); }}
          onError={() => { /* el aviso ya se ve dentro de la pantalla */ }}
          alertas={rechazos.map((r) => (
            <div key={r.id} className="cp-msg cp-msg--error" role="alert">
              No se pudo enviar «{r.titulo}»: {r.mensaje}
              <div><button type="button" onClick={() => setRechazos((l) => l.filter((x) => x.id !== r.id))}>Entendido</button></div>
            </div>
          ))}
        />
      </div>
    );
  }
  return <div className="cp-page"><Centro titulo="Cargando..."><Loader2 size={32} className="cp-girar" /></Centro></div>;
}

