import { useState } from 'react';
import { Sparkles } from 'lucide-react';
import ErrorBanner from '../common/ErrorBanner';
import { generarResumenDia, mensajeErrorBitacora, type ResumenDia } from '../../services/bitacora.service';
import { instanteLegible } from '../../utils/bitacoraFechas';
import '../../styles/bitacora.css';

interface Props {
  fecha: string;
  resumen: ResumenDia | null;
  /** Para generar el resumen de otra persona (quien ve el equipo); sin esto es el propio. */
  userId?: number;
  onResumen: (r: ResumenDia) => void;
}

/**
 * «Resumen del día»: un párrafo corto y unas viñetas de lo que quedó registrado ese día y de lo que la
 * persona anotó. Las cifras las calcula el servidor; la IA solo las redacta. Lo ven la persona y quien
 * puede ver el equipo, y se puede regenerar cuando hay datos nuevos.
 */
export default function ResumenDelDia({ fecha, resumen, userId, onResumen }: Props) {
  const [generando, setGenerando] = useState(false);
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState('');

  const generar = async () => {
    setGenerando(true);
    setError('');
    setAviso('');
    try {
      const r = await generarResumenDia(fecha, userId);
      onResumen(r);
      if (r.reutilizado) setAviso('No hay datos nuevos desde el último resumen, así que se muestra el mismo.');
    } catch (err) {
      setError(mensajeErrorBitacora(err));
    } finally {
      setGenerando(false);
    }
  };

  return (
    <div className="bit-resumen">
      <div className="bit-resumen-cabecera">
        <h3 className="bit-horas-titulo" style={{ margin: 0 }}>
          Resumen del día
        </h3>
        <button type="button" className={resumen ? 'btn-secondary' : 'auth-btn'} disabled={generando} onClick={generar}>
          <Sparkles size={15} style={{ marginRight: 6, verticalAlign: '-2px' }} />
          {generando ? 'Generando...' : resumen ? 'Regenerar resumen' : 'Generar resumen'}
        </button>
      </div>

      <ErrorBanner mensaje={error} />
      {aviso && <div className="bit-aviso">{aviso}</div>}

      {!resumen ? (
        <p className="bit-nota" style={{ marginTop: 8 }}>
          Todavía no se generó el resumen de este día. Al generarlo se arma con lo registrado y con lo que la persona
          anotó a mano.
        </p>
      ) : (
        <>
          {resumen.desactualizado && (
            <div className="bit-aviso">
              Hay actividad o anotaciones nuevas desde que se generó este resumen. Regéneralo para incluirlas.
            </div>
          )}
          <p className="bit-resumen-texto">{resumen.texto}</p>
          {resumen.puntos.length > 0 && (
            <ul className="bit-resumen-puntos">
              {resumen.puntos.map((p, i) => (
                <li key={i}>{p}</li>
              ))}
            </ul>
          )}
          <p className="bit-nota" style={{ marginBottom: 0 }}>
            Generado {resumen.generadoPor ? `por ${resumen.generadoPor} ` : ''}
            {instanteLegible(resumen.generadoEn).toLowerCase()} ·{' '}
            {resumen.conIA
              ? 'redactado con IA a partir de las cifras del día'
              : 'resumen calculado con las cifras del día (sin IA)'}
            . Solo resume lo que la bitácora ve: poca actividad registrada no significa poco trabajo.
          </p>
        </>
      )}
    </div>
  );
}
