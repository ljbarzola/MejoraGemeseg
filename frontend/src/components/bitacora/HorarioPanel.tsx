import { useEffect, useState } from 'react';
import ErrorBanner from '../common/ErrorBanner';
import {
  getHorarioBitacora,
  guardarHorarioBitacora,
  mensajeErrorBitacora,
} from '../../services/bitacora.service';
import '../../styles/bitacora.css';

// 1 = lunes ... 7 = domingo, igual que en el servidor.
const DIAS = [
  { n: 1, etiqueta: 'Lunes' },
  { n: 2, etiqueta: 'Martes' },
  { n: 3, etiqueta: 'Miércoles' },
  { n: 4, etiqueta: 'Jueves' },
  { n: 5, etiqueta: 'Viernes' },
  { n: 6, etiqueta: 'Sábado' },
  { n: 7, etiqueta: 'Domingo' },
];

/**
 * Pestaña «Horario» de Configuración: los días y horas dentro de los cuales la extensión del
 * navegador registra (hora de Ecuador). Sin horario guardado la extensión no registra nada.
 */
export default function HorarioPanel() {
  const [dias, setDias] = useState<number[]>([1, 2, 3, 4, 5]);
  const [inicio, setInicio] = useState('08:00');
  const [fin, setFin] = useState('17:00');
  const [configurado, setConfigurado] = useState(false);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState('');

  useEffect(() => {
    let vigente = true;
    getHorarioBitacora()
      .then((h) => {
        if (!vigente) return;
        setDias(h.dias);
        setInicio(h.inicio);
        setFin(h.fin);
        setConfigurado(h.configurado);
      })
      .catch((err) => vigente && setError(mensajeErrorBitacora(err)))
      .finally(() => vigente && setCargando(false));
    return () => {
      vigente = false;
    };
  }, []);

  const alternarDia = (n: number) => {
    setAviso('');
    setDias((actuales) => (actuales.includes(n) ? actuales.filter((d) => d !== n) : [...actuales, n]));
  };

  const guardar = async () => {
    setGuardando(true);
    setError('');
    setAviso('');
    try {
      const h = await guardarHorarioBitacora({ dias, inicio, fin });
      setDias(h.dias);
      setInicio(h.inicio);
      setFin(h.fin);
      setConfigurado(h.configurado);
      setAviso('Horario guardado. Las extensiones lo toman en unos minutos.');
    } catch (err) {
      setError(mensajeErrorBitacora(err));
    } finally {
      setGuardando(false);
    }
  };

  if (cargando) return <p className="bit-vacio">Cargando...</p>;

  return (
    <>
      <ErrorBanner mensaje={error} />

      {!configurado && (
        <div className="bit-aviso">
          Todavía no hay un horario guardado, así que la extensión del navegador no registra nada. Guárdalo para que
          empiece a registrar, solo dentro de estos días y horas.
        </div>
      )}

      <div className="bit-horario">
        <fieldset className="bit-horario-dias">
          <legend>Días</legend>
          {DIAS.map((d) => (
            <label key={d.n} className="bit-horario-dia">
              <input type="checkbox" checked={dias.includes(d.n)} onChange={() => alternarDia(d.n)} />
              {d.etiqueta}
            </label>
          ))}
        </fieldset>

        <div className="bit-horario-horas">
          <label>
            Desde
            <input
              type="time"
              value={inicio}
              onChange={(e) => {
                setInicio(e.target.value);
                setAviso('');
              }}
            />
          </label>
          <label>
            Hasta
            <input
              type="time"
              value={fin}
              onChange={(e) => {
                setFin(e.target.value);
                setAviso('');
              }}
            />
          </label>
          <button type="button" className="auth-btn" disabled={guardando} onClick={guardar}>
            {guardando ? 'Guardando...' : 'Guardar horario'}
          </button>
        </div>
      </div>
      {aviso && <div className="bit-aviso">{aviso}</div>}

      <p className="bit-nota">Cómo se usa este horario:</p>
      <ul className="bit-nota" style={{ marginTop: 4, paddingLeft: 20 }}>
        <li>La hora es la de Ecuador y vale para toda la empresa.</li>
        <li>
          La extensión del navegador registra solo dentro de estos días y horas, y solo de las personas con la hoja
          activada que la hayan vinculado. Fuera del horario no envía nada.
        </li>
        <li>El servidor vuelve a comprobarlo: lo que llegue fuera del horario se descarta sin guardarse.</li>
        <li>Si cambias el horario, la extensión lo toma sola; no hay que reinstalar nada.</li>
      </ul>
    </>
  );
}
