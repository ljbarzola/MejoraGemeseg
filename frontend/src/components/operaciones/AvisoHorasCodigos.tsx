import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Clock } from 'lucide-react';
import { getCodigosTurno } from '../../services/contratacion-publica.service';

/**
 * Aviso para el equipo de Operaciones (2026-11-16): los códigos de turno que trabajan en el puesto (D, N, D/8…)
 * todavía no tienen hora de entrada y salida. Sin ellas el sistema solo revisa si un día hubo suficientes
 * guardias en total (no si la noche quedó sin nadie) y el revisor de bitácoras no compara horas.
 * Desaparece solo cuando todos tienen sus horas. `enConfiguracion` quita el enlace (ya se está ahí).
 */
export default function AvisoHorasCodigos({ enConfiguracion = false }: { enConfiguracion?: boolean }) {
  const navigate = useNavigate();
  const [faltan, setFaltan] = useState<string[]>([]);

  useEffect(() => {
    getCodigosTurno()
      .then((cs) => setFaltan(cs.filter((c) => c.activo !== false && !c.esDescanso && !c.esCustodia && (!c.horaInicio || !c.horaFin)).map((c) => c.codigo)))
      .catch(() => setFaltan([]));
  }, []);

  if (faltan.length === 0) return null;
  return (
    <div
      role="note"
      style={{
        display: 'flex', alignItems: 'flex-start', gap: 10, background: '#fffaf0', border: '1px solid #fbd38d',
        color: '#7b341e', borderRadius: 10, padding: '10px 14px', margin: '12px 0', fontSize: '0.85rem', lineHeight: 1.5,
      }}
    >
      <Clock size={16} aria-hidden="true" style={{ flex: 'none', marginTop: 2 }} />
      <div>
        <strong>Faltan las horas de {faltan.length} código{faltan.length === 1 ? '' : 's'} de turno</strong> ({faltan.join(', ')}).
        {' '}Indica a qué hora empieza y termina cada uno. Mientras falten, el sistema solo revisa si cada día hubo
        suficientes guardias en total, no si estuvieron en el turno correcto (por ejemplo, si la noche quedó sin nadie),
        y la revisión de bitácoras no compara las horas que anota el guardia.
        {!enConfiguracion && (
          <>
            {' '}
            <button
              type="button"
              onClick={() => navigate('/operaciones/configuracion?pestana=horas')}
              style={{ background: 'none', border: 'none', padding: 0, color: '#9c4221', fontWeight: 700, cursor: 'pointer', textDecoration: 'underline', fontSize: 'inherit' }}
            >
              Completar las horas →
            </button>
          </>
        )}
      </div>
    </div>
  );
}
