import { useEffect, useRef, useState } from 'react';
import { X, BellRing, Send } from 'lucide-react';
import {
  getVigilanteConfig,
  saveVigilanteConfig,
  probarVigilante,
  type VigilantePrueba,
} from '../../services/entidades.service';
import { usePerm } from '../../contexts/PermissionsContext';
import PanelConfig, { SinGuardar } from './PanelConfig';

const MAX_PLAZOS = 8;
const MAX_DIAS = 365;
const MAX_REPETIR = 60;

const mensajeError = (err: any, fallback: string): string => err?.response?.data?.message || fallback;

const etiquetaPlazo = (n: number) => (n === 0 ? 'El día que vence' : n === 1 ? '1 día antes' : `${n} días antes`);

/** Una fila de la configuración: la etiqueta a la izquierda y el control a la derecha (en celular, una debajo de otra). */
function Fila({ etiqueta, ayuda, children }: { etiqueta: string; ayuda?: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(170px, 230px) 1fr', gap: '6px 18px', alignItems: 'start', padding: '12px 0', borderTop: '1px solid #edf2f7' }}>
      <div>
        <div style={{ fontWeight: 600, fontSize: '0.88rem', color: 'var(--azul-oscuro)' }}>{etiqueta}</div>
        {ayuda && <div style={{ fontSize: '0.76rem', color: '#718096', marginTop: 2 }}>{ayuda}</div>}
      </div>
      <div>{children}</div>
    </div>
  );
}

/**
 * Avisos de vencimientos (pestaña de la Configuración de RRHH). Cada día el sistema revisa los documentos
 * de los guardias y, si alguno cruza uno de estos plazos, deja UN aviso al personal de RRHH
 * con permiso de escribir. El correo al guardia no sale solo: lo sigue mandando RRHH con «Enviar recordatorio».
 */
export default function VigilanteAvisosPanel({ onSucio }: { onSucio?: (sucio: boolean) => void }) {
  const { canWrite } = usePerm();
  const puedeEditar = canWrite('RRHH');

  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [probando, setProbando] = useState(false);
  const [error, setError] = useState('');
  const [guardado, setGuardado] = useState(false);
  const [sucio, setSucio] = useState(false);
  const [prueba, setPrueba] = useState<VigilantePrueba | null>(null);

  const [activo, setActivo] = useState(true);
  const [plazos, setPlazos] = useState<number[]>([]);
  const [nuevoPlazo, setNuevoPlazo] = useState('');
  const [repetir, setRepetir] = useState('7');
  const [resumenLunes, setResumenLunes] = useState(true);

  const errorRef = useRef<HTMLDivElement>(null);
  // El aviso puede quedar fuera de vista si la persona ya bajó en la pantalla.
  useEffect(() => {
    if (error) errorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [error]);

  // La pantalla avisa antes de cambiar de pestaña si hay algo sin guardar.
  useEffect(() => {
    onSucio?.(sucio);
    return () => onSucio?.(false);
  }, [sucio, onSucio]);

  useEffect(() => {
    getVigilanteConfig()
      .then((c) => {
        setActivo(c.activo);
        setPlazos(c.avisarDias);
        setRepetir(String(c.repetirVencidoDias));
        setResumenLunes(c.resumenLunes);
      })
      .catch((err) => setError(mensajeError(err, 'No se pudo cargar la configuración de avisos.')))
      .finally(() => setCargando(false));
  }, []);

  const cambio = () => { setSucio(true); setGuardado(false); setPrueba(null); };

  const agregarPlazo = () => {
    const n = Number(nuevoPlazo);
    if (nuevoPlazo.trim() === '' || !Number.isInteger(n) || n < 0 || n > MAX_DIAS) {
      setError(`El plazo debe ser un número entero de 0 a ${MAX_DIAS} días.`);
      return;
    }
    if (plazos.includes(n)) {
      setError('Ese plazo ya está en la lista.');
      return;
    }
    if (plazos.length >= MAX_PLAZOS) {
      setError(`Puedes tener hasta ${MAX_PLAZOS} plazos.`);
      return;
    }
    setError('');
    cambio();
    setPlazos([...plazos, n].sort((a, b) => b - a));
    setNuevoPlazo('');
  };

  const quitarPlazo = (n: number) => {
    cambio();
    setPlazos(plazos.filter((p) => p !== n));
  };

  const guardar = async () => {
    const r = Number(repetir);
    if (repetir.trim() === '' || !Number.isInteger(r) || r < 0 || r > MAX_REPETIR) {
      setError(`«Repetir cada» debe ser un número entero de 0 a ${MAX_REPETIR} (0 = no repetir).`);
      return;
    }
    setGuardando(true);
    setError('');
    setGuardado(false);
    try {
      const c = await saveVigilanteConfig({ activo, avisarDias: plazos, repetirVencidoDias: r, resumenLunes });
      setPlazos(c.avisarDias);
      setRepetir(String(c.repetirVencidoDias));
      setSucio(false);
      setGuardado(true);
      setPrueba(null);
    } catch (err) {
      setError(mensajeError(err, 'No se pudo guardar la configuración de avisos.'));
    } finally {
      setGuardando(false);
    }
  };

  const probar = async () => {
    setProbando(true);
    setError('');
    try {
      setPrueba(await probarVigilante());
    } catch (err) {
      setError(mensajeError(err, 'No se pudo enviar el aviso de prueba.'));
    } finally {
      setProbando(false);
    }
  };

  if (cargando) return <div className="admin-section"><div className="loading-state">Cargando configuración...</div></div>;

  return (
    <PanelConfig
      descripcion={<>
        Cada día, a primera hora, el sistema revisa los documentos de los guardias y le deja <strong>una sola notificación en la app</strong> a
        todo el personal de RRHH con permiso de escribir. No manda correos a los guardias: ese envío lo sigues haciendo tú,
        guardia por guardia, con «Enviar recordatorio».
      </>}
      acciones={<>
        <SinGuardar visible={sucio} />
        <button type="button" className="btn-secondary" onClick={() => void probar()} disabled={probando || sucio}
          title={sucio ? 'Guarda los cambios para probar con ellos' : 'Te manda ahora una notificación de prueba en la app, solo a ti'}>
          <Send size={16} /> {probando ? 'Enviando…' : 'Probar ahora'}
        </button>
        {puedeEditar && (
          <button type="button" className="auth-btn" onClick={() => void guardar()} disabled={guardando || !sucio}>
            <BellRing size={16} /> {guardando ? 'Guardando…' : 'Guardar'}
          </button>
        )}
      </>}
      estado={<>
        <div ref={errorRef}>{error && <div className="form-error">{error}</div>}</div>
        {!puedeEditar && (
          <div className="form-error" style={{ background: '#fffaf0', borderColor: '#fbd38d', color: '#7b341e' }}>
            Tu usuario solo puede ver esta configuración. Pide a alguien de RRHH con permiso de escribir que la cambie.
          </div>
        )}
        {guardado && (
          <div style={{ background: '#f0fff4', border: '1px solid #9ae6b4', color: '#276749', borderRadius: 8, padding: '8px 12px', marginBottom: 12, fontSize: '0.84rem', fontWeight: 600 }}>
            Configuración guardada. Se aplica desde el próximo aviso diario.
          </div>
        )}
        {prueba && (
          <div style={{ border: '1px solid #bee3f8', background: '#ebf8ff', borderRadius: 10, padding: '10px 14px', marginBottom: 12, fontSize: '0.85rem', color: '#2a4365', whiteSpace: 'pre-line' }}>
            <strong>Te llegó una notificación de prueba en la app</strong> (solo a ti):{'\n'}{prueba.mensaje}
          </div>
        )}
      </>}
    >

      <Fila etiqueta="Notificación diaria" ayuda="Si la apagas, no llega ninguna.">
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, margin: 0 }}>
          <input type="checkbox" checked={activo} disabled={!puedeEditar} style={{ width: 'auto' }}
            onChange={(e) => { setActivo(e.target.checked); cambio(); }} />
          Enviar la notificación diaria en la app
        </label>
      </Fila>

      <div style={{ opacity: activo ? 1 : 0.55 }}>
        <Fila etiqueta="Avisar cuando falten" ayuda="Días antes de vencer en que llega la notificación (0 = el día que vence).">
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
            {plazos.length === 0 && <span style={{ fontSize: '0.82rem', color: '#718096' }}>Sin plazos: solo se avisará de lo que ya venció.</span>}
            {plazos.map((n) => (
              <span key={n} className="status-badge" style={{ background: '#ebf8ff', color: '#2b6cb0', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                {etiquetaPlazo(n)}
                {puedeEditar && (
                  <button type="button" onClick={() => quitarPlazo(n)} aria-label={`Quitar el plazo ${etiquetaPlazo(n)}`}
                    style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'inherit', display: 'inline-flex' }}>
                    <X size={13} />
                  </button>
                )}
              </span>
            ))}
            {puedeEditar && (
              <span className="form-group" style={{ display: 'inline-flex', flexDirection: 'row', flex: 'none', gap: 6, alignItems: 'center' }}>
                <input type="number" min={0} max={MAX_DIAS} value={nuevoPlazo} placeholder="Días" aria-label="Días antes de vencer"
                  onChange={(e) => setNuevoPlazo(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); agregarPlazo(); } }}
                  style={{ width: 96, padding: '8px 12px' }} />
                <button type="button" className="btn-secondary" onClick={agregarPlazo}>Agregar</button>
              </span>
            )}
          </div>
          <p style={{ fontSize: '0.78rem', color: '#718096', margin: '8px 0 0' }}>
            El plazo más lejano es también desde cuándo un documento sale en amarillo («por vencer») en Cumplimiento: se define aquí,
            una sola vez para todos los requisitos.
          </p>
        </Fila>

        <Fila etiqueta="Si ya venció, repetir cada" ayuda="Avisa el primer día vencido y luego cada ese número de días. 0 = no repetir.">
          <span className="form-group" style={{ display: 'inline-flex', flexDirection: 'row', flex: 'none', alignItems: 'center', gap: 8 }}>
            <input type="number" min={0} max={MAX_REPETIR} value={repetir} disabled={!puedeEditar} aria-label="Repetir cada (días)"
              style={{ width: 96, padding: '8px 12px' }}
              onChange={(e) => { setRepetir(e.target.value); cambio(); }} />
            días
          </span>
        </Fila>

        <Fila etiqueta="Resumen de los lunes" ayuda="Lo que sigue vencido, los documentos sin fecha y los que faltan.">
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, margin: 0 }}>
            <input type="checkbox" checked={resumenLunes} disabled={!puedeEditar} style={{ width: 'auto' }}
              onChange={(e) => { setResumenLunes(e.target.checked); cambio(); }} />
            Cada lunes, un resumen de todo lo pendiente
          </label>
        </Fila>
      </div>

    </PanelConfig>
  );
}
