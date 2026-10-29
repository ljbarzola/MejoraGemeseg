import { useEffect, useState } from 'react';
import ConfirmDialog from '../common/ConfirmDialog';
import ErrorBanner from '../common/ErrorBanner';
import {
  crearCodigoExtension,
  desvincularExtensiones,
  getEstadoExtension,
  mensajeErrorBitacora,
  type EstadoExtension,
} from '../../services/bitacora.service';
import { instanteLegible } from '../../utils/bitacoraFechas';
import '../../styles/bitacora.css';

/** Enlace de instalación en la tienda; mientras no se publique, la persona lo recibe de su administrador. */
const URL_EXTENSION = (import.meta.env.VITE_BITACORA_EXTENSION_URL as string | undefined) ?? '';

/**
 * En «Mi hoja del día»: vincular la extensión del navegador con un código de un solo uso, ver qué equipos
 * la tienen y desvincularla. Solo se muestra a quien hoy tiene la hoja activa.
 */
export default function ExtensionPanel() {
  const [estado, setEstado] = useState<EstadoExtension | null>(null);
  const [codigo, setCodigo] = useState<{ codigo: string; expiraEn: string } | null>(null);
  const [error, setError] = useState('');
  const [generando, setGenerando] = useState(false);
  const [confirmando, setConfirmando] = useState(false);

  const cargar = () =>
    getEstadoExtension()
      .then(setEstado)
      .catch((err) => setError(mensajeErrorBitacora(err)));

  useEffect(() => {
    void cargar();
  }, []);

  const vincular = async () => {
    setGenerando(true);
    setError('');
    try {
      setCodigo(await crearCodigoExtension());
    } catch (err) {
      setError(mensajeErrorBitacora(err));
    } finally {
      setGenerando(false);
    }
  };

  const cerrarCodigo = () => {
    setCodigo(null);
    void cargar();
  };

  const desvincular = async () => {
    setConfirmando(false);
    setError('');
    try {
      setEstado(await desvincularExtensiones());
    } catch (err) {
      setError(mensajeErrorBitacora(err));
    }
  };

  return (
    <div className="bit-extension">
      <h2 className="bit-detalle-titulo">
        Extensión del navegador
        <small>Completa tu hoja con los sitios web (solo el dominio) y el tiempo, dentro del horario.</small>
      </h2>

      <ErrorBanner mensaje={error} />

      {estado?.vinculada ? (
        <>
          <div className="bit-aviso">Tu extensión está vinculada. Se registra solo dentro del horario de la empresa.</div>
          <ul className="bit-extension-equipos">
            {estado.dispositivos.map((d) => (
              <li key={d.id}>
                <strong>{d.nombreEquipo ?? 'Navegador'}</strong>
                <span>
                  Vinculada {instanteLegible(d.creadoEn)}
                  {d.ultimoUso ? ` · último envío ${instanteLegible(d.ultimoUso)}` : ' · todavía sin enviar'}
                </span>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p className="bit-nota" style={{ marginTop: 0 }}>
          Todavía no tienes la extensión vinculada, así que el navegador no aparece en tu hoja. Solo se vincula si tú
          lo haces con un código.
        </p>
      )}

      <div className="bit-extension-botones">
        <button type="button" className="auth-btn" disabled={generando} onClick={vincular}>
          {generando ? 'Generando código...' : estado?.vinculada ? 'Vincular otro navegador' : 'Vincular extensión'}
        </button>
        {estado?.vinculada && (
          <button type="button" className="btn-secondary" onClick={() => setConfirmando(true)}>
            Desvincular
          </button>
        )}
      </div>

      <p className="bit-nota">Qué registra la extensión:</p>
      <ul className="bit-nota" style={{ marginTop: 4, paddingLeft: 20 }}>
        <li>Solo el dominio del sitio (por ejemplo «ejemplo.com»), nunca la dirección completa, el título ni el contenido.</li>
        <li>Solo mientras la ventana del navegador está al frente y estás activo, y solo dentro del horario.</li>
        <li>No registra las ventanas privadas ni lo que escribes, ni toma capturas.</li>
        <li>Fuera del horario no envía nada. Puedes desvincularla aquí o desde la propia extensión cuando quieras.</li>
      </ul>

      {codigo && (
        <div className="modal-overlay" onClick={cerrarCodigo}>
          <div className="modal modal-ventas-sm" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Vincular la extensión</h3>
            </div>
            <div className="modal-body">
              <ol className="bit-extension-pasos">
                <li>
                  Instala la extensión en tu navegador (Chrome o Edge)
                  {URL_EXTENSION ? (
                    <>
                      {': '}
                      <a href={URL_EXTENSION} target="_blank" rel="noopener noreferrer">
                        abrir la tienda
                      </a>
                      .
                    </>
                  ) : (
                    '. Tu administrador te dará el enlace.'
                  )}
                </li>
                <li>Abre la extensión (icono de la barra) y escribe este código:</li>
              </ol>
              <div className="bit-extension-codigo" aria-label="Código de vinculación">
                {codigo.codigo}
              </div>
              <p className="bit-nota" style={{ marginTop: 8 }}>
                Sirve una sola vez y vence {instanteLegible(codigo.expiraEn)} (10 minutos).
              </p>
            </div>
            <div className="modal-actions">
              <button type="button" className="auth-btn" onClick={cerrarCodigo}>
                Listo
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmando && (
        <ConfirmDialog
          title="Desvincular la extensión"
          message="Tus navegadores dejan de enviar sitios web al instante. Lo ya registrado sigue en tu hoja. Puedes vincularla de nuevo cuando quieras."
          confirmLabel="Desvincular"
          danger
          onConfirm={desvincular}
          onCancel={() => setConfirmando(false)}
        />
      )}
    </div>
  );
}
