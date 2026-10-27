import { useEffect, useState } from 'react';
import ErrorBanner from '../common/ErrorBanner';
import Kpi from './Kpi';
import {
  getEstadoGoogle,
  mensajeErrorBitacora,
  sincronizarGoogleAhora,
  type EstadoGoogle,
} from '../../services/bitacora.service';
import { instanteLegible } from '../../utils/bitacoraFechas';
import '../../styles/bitacora.css';

const QUE_FALTA: Record<'administrador' | 'credenciales', string> = {
  administrador: 'Falta indicar en el servidor la cuenta de administrador de Google Workspace.',
  credenciales: 'Falta en el servidor la credencial de la cuenta de servicio de correo.',
};

/**
 * Pestaña «Google» de Configuración: si la conexión está lista, a cuántas personas se
 * les lee Google y el botón para leerlo ahora. Aquí vive el botón (una sola vez), no en
 * el Dashboard.
 */
export default function GoogleConexionPanel() {
  const [estado, setEstado] = useState<EstadoGoogle | null>(null);
  const [error, setError] = useState('');
  const [cargando, setCargando] = useState(true);
  const [leyendo, setLeyendo] = useState(false);
  const [aviso, setAviso] = useState('');

  const cargar = () =>
    getEstadoGoogle()
      .then(setEstado)
      .catch((err) => setError(mensajeErrorBitacora(err)))
      .finally(() => setCargando(false));

  useEffect(() => {
    void cargar();
  }, []);

  const leerAhora = async () => {
    setLeyendo(true);
    setAviso('');
    setError('');
    try {
      const r = await sincronizarGoogleAhora();
      setAviso(r.mensaje);
      await cargar();
    } catch (err) {
      setError(mensajeErrorBitacora(err));
    } finally {
      setLeyendo(false);
    }
  };

  if (cargando) return <p className="bit-vacio">Cargando...</p>;

  return (
    <>
      <ErrorBanner mensaje={error} />

      {estado && (
        <div className="bit-kpis">
          <Kpi
            etiqueta="Conexión con Google"
            valor={estado.configurado ? 'Lista' : 'Falta configurar'}
            detalle={estado.falta ? QUE_FALTA[estado.falta] : 'Solo lectura de informes de Workspace'}
          />
          <Kpi
            etiqueta="Personas que se leen"
            valor={estado.personasActivas}
            detalle="Las que tienen la hoja activada"
          />
          <Kpi
            etiqueta="Último evento guardado"
            valor={estado.ultimoEvento ? instanteLegible(estado.ultimoEvento) : 'Ninguno todavía'}
            detalle="Hora del evento en Google, no de la lectura"
          />
        </div>
      )}

      <div style={{ marginBottom: 14 }}>
        <button
          type="button"
          className="auth-btn"
          disabled={leyendo || !estado?.configurado}
          title={estado && !estado.configurado ? 'Primero hay que terminar la configuración en el servidor' : undefined}
          onClick={leerAhora}
        >
          {leyendo ? 'Leyendo Google...' : 'Leer Google ahora'}
        </button>
      </div>
      {aviso && <div className="bit-aviso">{aviso}</div>}

      <p className="bit-nota">Qué se lee de Google:</p>
      <ul className="bit-nota" style={{ marginTop: 4, paddingLeft: 20 }}>
        <li>Inicios de sesión y actividad en Drive (crear, editar, subir, abrir, renombrar, mover, eliminar y descargar archivos).</li>
        <li>Solo de las personas con la hoja activada y solo desde el momento en que se les activó. Se pide persona por persona, nunca «todos».</li>
        <li>Es solo lectura: no se envía ni se modifica nada en Google.</li>
        <li>Google puede tardar desde minutos hasta horas en publicar un evento; por eso cada lectura repasa las últimas 48 horas y no duplica lo ya guardado.</li>
        <li>Además de este botón, Google se lee solo una vez por hora (a los 30 minutos).</li>
      </ul>
    </>
  );
}
