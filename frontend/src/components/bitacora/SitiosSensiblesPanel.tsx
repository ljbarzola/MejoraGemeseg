import { useEffect, useState } from 'react';
import ErrorBanner from '../common/ErrorBanner';
import {
  getSitiosSensibles,
  guardarSitiosSensibles,
  mensajeErrorBitacora,
  type SitiosSensibles,
} from '../../services/bitacora.service';
import '../../styles/bitacora.css';

/**
 * «Sitios sensibles» (Configuración → Horario): dominios donde la extensión guarda SOLO el dominio, sin la
 * ruta ni el título de la pestaña. Vienen unos por defecto (correo web, bancos, salud, redes) y cada empresa
 * puede agregar los suyos.
 */
export default function SitiosSensiblesPanel() {
  const [datos, setDatos] = useState<SitiosSensibles | null>(null);
  const [texto, setTexto] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState('');

  useEffect(() => {
    let vigente = true;
    getSitiosSensibles()
      .then((d) => {
        if (!vigente) return;
        setDatos(d);
        setTexto(d.propios.join('\n'));
      })
      .catch((err) => vigente && setError(mensajeErrorBitacora(err)));
    return () => {
      vigente = false;
    };
  }, []);

  const guardar = async () => {
    setGuardando(true);
    setError('');
    setAviso('');
    try {
      const lista = texto
        .split(/[\n,;]+/)
        .map((s) => s.trim())
        .filter(Boolean);
      const d = await guardarSitiosSensibles(lista);
      setDatos(d);
      setTexto(d.propios.join('\n'));
      setAviso('Lista guardada. Las extensiones la toman en unos minutos.');
    } catch (err) {
      setError(mensajeErrorBitacora(err));
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="bit-extension">
      <h3 className="bit-horas-titulo">Sitios sensibles</h3>
      <p className="bit-nota" style={{ marginTop: 0 }}>
        La extensión guarda, de cada página, su dominio, la ruta limpia (sin lo que va después del «?» ni códigos
        largos) y el título de la pestaña. En estos sitios guarda <strong>solo el dominio</strong>: nunca la ruta ni el
        título.
      </p>
      <ErrorBanner mensaje={error} />
      {datos && (
        <>
          <p className="bit-nota">Vienen por defecto (y cualquier dominio que contenga «banco» o «bank»):</p>
          <div className="bit-sitios">
            {datos.porDefecto.map((d) => (
              <span key={d} className="bit-fuente bit-fuente-inactiva">
                {d}
              </span>
            ))}
          </div>
          <div className="form-group" style={{ maxWidth: 520, marginTop: 14 }}>
            <label>Los de tu empresa (uno por línea)</label>
            <textarea
              className="form-textarea"
              rows={5}
              value={texto}
              onChange={(e) => {
                setTexto(e.target.value);
                setAviso('');
              }}
              placeholder={'intranet.miempresa.com\nbancoejemplo.com'}
            />
          </div>
          <button type="button" className="auth-btn" disabled={guardando} onClick={guardar}>
            {guardando ? 'Guardando...' : 'Guardar sitios'}
          </button>
          {aviso && <div className="bit-aviso" style={{ marginTop: 10 }}>{aviso}</div>}
        </>
      )}
    </div>
  );
}
