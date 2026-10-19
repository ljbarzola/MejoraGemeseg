import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { X } from 'lucide-react';
import { getCodigosTurnoBitacoras, guardarHorasTurno } from '../../../services/bitacoras.service';
import type { CPCodigoTurno } from '../../../types/contratacion-publica';
import { mensajeError } from '../../../utils/entregasCp';

interface Fila {
  codigo: CPCodigoTurno;
  inicio: string;
  fin: string;
}

/**
 * Horario de cada turno ("D" = 07:00 a 19:00). Con él el revisor de bitácoras
 * compara también las horas que el guardia anotó; sin él solo compara quién.
 * Un turno cuyo fin es menor que su inicio cruza la medianoche (noche: 19:00 a 07:00).
 */
export default function HorasTurnoModal({
  puedeEditar,
  onClose,
}: {
  puedeEditar: boolean;
  onClose: () => void;
}) {
  const [filas, setFilas] = useState<Fila[] | null>(null);
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [guardado, setGuardado] = useState(false);

  useEffect(() => {
    getCodigosTurnoBitacoras()
      .then((cs) =>
        setFilas(
          cs
            .filter((c) => c.activo && !c.esDescanso)
            .map((c) => ({ codigo: c, inicio: c.horaInicio ?? '', fin: c.horaFin ?? '' })),
        ),
      )
      .catch((err) => {
        setFilas([]);
        setError(mensajeError(err, 'No se pudieron cargar los códigos de turno.'));
      });
  }, []);

  const cambiar = (id: number, campo: 'inicio' | 'fin', valor: string) => {
    setGuardado(false);
    setFilas((fs) => fs?.map((f) => (f.codigo.id === id ? { ...f, [campo]: valor } : f)) ?? null);
  };

  const incompleta = (f: Fila) => (!!f.inicio !== !!f.fin);
  const cambio = (f: Fila) => (f.inicio || null) !== (f.codigo.horaInicio ?? null) || (f.fin || null) !== (f.codigo.horaFin ?? null);

  const guardar = async () => {
    if (!filas) return;
    const mal = filas.find(incompleta);
    if (mal) {
      setError(`El turno ${mal.codigo.codigo} (${mal.codigo.nombre}) tiene solo una hora: completa la de inicio y la de fin, o deja las dos vacías.`);
      return;
    }
    setGuardando(true);
    setError('');
    try {
      for (const f of filas.filter(cambio)) {
        const g = await guardarHorasTurno(f.codigo.id, f.inicio || null, f.fin || null);
        setFilas((fs) => fs?.map((x) => (x.codigo.id === f.codigo.id ? { ...x, codigo: g } : x)) ?? null);
      }
      setGuardado(true);
    } catch (err) {
      setError(mensajeError(err, 'No se pudieron guardar los horarios.'));
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 600 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Horario de los turnos</h3>
          <button className="modal-close" onClick={onClose} aria-label="Cerrar"><X size={16} /></button>
        </div>
        <div className="modal-body">
          <p style={{ margin: '0 0 14px', fontSize: '0.88rem', color: '#4a5568' }}>
            Con el horario de cada turno, el revisor de bitácoras también compara las horas que el guardia anotó (se toleran 30 minutos).
            Si lo dejas vacío, solo se compara quién estuvo. Un turno de noche que termina de madrugada se escribe, por ejemplo, de 19:00 a 07:00.
          </p>
          {error && <div className="form-error">{error}</div>}
          {!puedeEditar && (
            <div className="form-error" style={{ background: '#fffaf0', borderColor: '#fbd38d', color: '#7b341e' }}>
              Tu usuario solo puede ver estos horarios. Pide a alguien de Contratación Pública con permiso de escribir que los cambie.
            </div>
          )}

          {filas === null ? (
            <div className="loading-state">Cargando turnos…</div>
          ) : filas.length === 0 ? (
            <div className="empty-state">
              Todavía no hay códigos de turno de trabajo. Créalos primero en{' '}
              <Link to="/contratacion-publica/config/codigos-turno" onClick={onClose} className="enlace-tabla">Códigos de turno</Link>.
            </div>
          ) : (
            <div className="tasks-table-wrapper">
              <table className="tasks-table">
                <thead>
                  <tr>
                    <th>Turno</th>
                    <th style={{ width: 130 }}>Inicia</th>
                    <th style={{ width: 130 }}>Termina</th>
                  </tr>
                </thead>
                <tbody>
                  {filas.map((f) => (
                    <tr key={f.codigo.id}>
                      <td>
                        <span className="status-badge" style={{ background: f.codigo.color || '#e2e8f0', color: '#1a202c' }}>{f.codigo.codigo}</span>{' '}
                        <span style={{ marginLeft: 6 }}>{f.codigo.nombre}</span>
                      </td>
                      <td><input type="time" value={f.inicio} disabled={!puedeEditar || guardando} onChange={(e) => cambiar(f.codigo.id, 'inicio', e.target.value)} style={{ padding: '6px 8px', border: '2px solid var(--borde-input)', borderRadius: 8, width: '100%' }} /></td>
                      <td><input type="time" value={f.fin} disabled={!puedeEditar || guardando} onChange={(e) => cambiar(f.codigo.id, 'fin', e.target.value)} style={{ padding: '6px 8px', border: '2px solid var(--borde-input)', borderRadius: 8, width: '100%' }} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {guardado && <p style={{ color: '#276749', fontWeight: 600, fontSize: '0.88rem', marginTop: 12 }}>Horarios guardados. Las próximas revisiones los usan; para las bitácoras ya subidas, guarda su lectura de nuevo.</p>}
        </div>
        <div className="modal-footer" style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, padding: '0 24px 20px' }}>
          <button type="button" className="btn-secondary" onClick={onClose}>Cerrar</button>
          {puedeEditar && filas && filas.length > 0 && (
            <button type="button" className="auth-btn" disabled={guardando || !filas.some(cambio)} onClick={() => void guardar()}>
              {guardando ? 'Guardando…' : 'Guardar horarios'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
