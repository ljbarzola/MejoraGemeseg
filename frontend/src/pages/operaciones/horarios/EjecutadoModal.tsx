import { useEffect, useRef, useState } from 'react';
import { Download, X } from 'lucide-react';
import { getHorarioEjecutado, getHorarioEjecutadoExcelBlob } from '../../../services/contratacion-publica.service';
import type { CPHorarioEjecutado } from '../../../types/contratacion-publica';

interface Props {
  horarioId: number;
  onClose: () => void;
}

const fechaCorta = (iso: string) => {
  const [, m, d] = iso.split('-');
  return `${d}/${m}`;
};

export default function EjecutadoModal({ horarioId, onClose }: Props) {
  const errorRef = useRef<HTMLDivElement>(null);
  const [datos, setDatos] = useState<CPHorarioEjecutado | null>(null);
  const [error, setError] = useState('');
  const [bajando, setBajando] = useState(false);

  useEffect(() => {
    getHorarioEjecutado(horarioId)
      .then(setDatos)
      .catch((err) => setError(err.response?.data?.message || 'No se pudo armar el horario ejecutado.'));
  }, [horarioId]);

  useEffect(() => {
    if (error) errorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [error]);

  const descargar = async () => {
    setBajando(true);
    setError('');
    try {
      const blob = await getHorarioEjecutadoExcelBlob(horarioId);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `ejecutado_${datos?.rango.inicio ?? ''}_${datos?.rango.fin ?? ''}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setError('No se pudo generar el Excel del ejecutado.');
    } finally {
      setBajando(false);
    }
  };

  const puesto = (id: number) => datos?.puestos.find((p) => p.id === id)?.nombre ?? '';
  const cambios = datos?.celdas.filter((c) => c.estado !== 'IGUAL') ?? [];

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-ventas-lg" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Horario ejecutado: lo que realmente pasó</h3>
          <button className="modal-close" onClick={onClose} aria-label="Cerrar"><X size={18} /></button>
        </div>
        <div className="modal-body">
          <p style={{ fontSize: '0.85rem', color: '#4a5568', marginTop: 0 }}>
            Es el horario programado más las faltas registradas con «No llegó» y quién las cubrió. También cruza los días de custodia con el módulo Custodias.
            No cambia el horario: solo muestra qué se movió y qué conviene revisar.
          </p>
          {error && <div ref={errorRef} className="form-error" style={{ marginBottom: 12 }}>{error}</div>}
          {!datos && !error && <div className="loading-state">Armando el ejecutado...</div>}
          {datos && (
            <>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 14, fontSize: '0.85rem' }}>
                <span className="status-badge" style={{ background: '#fed7d7', color: '#c53030' }}>{datos.resumen.faltas} falta(s)</span>
                <span className="status-badge" style={{ background: '#c6f6d5', color: '#276749' }}>{datos.resumen.cubiertas} cubierta(s)</span>
                <span className="status-badge" style={{ background: '#feebc8', color: '#9c4221' }}>{datos.resumen.sinCubrir} sin cubrir</span>
                <span className="status-badge" style={{ background: '#bee3f8', color: '#2c5282' }}>{datos.resumen.avisosCustodia} aviso(s) de custodia</span>
              </div>

              <h4 style={{ margin: '0 0 6px' }}>Cambios respecto al programado</h4>
              {cambios.length === 0 ? (
                <p style={{ color: '#718096', fontSize: '0.85rem', margin: '0 0 16px' }}>No hay faltas ni reemplazos registrados en este periodo: lo ejecutado es igual a lo programado.</p>
              ) : (
                <div className="tasks-table-wrapper" style={{ maxHeight: 260, overflow: 'auto', marginBottom: 14 }}>
                  <table className="tasks-table">
                    <thead><tr><th>Día</th><th>Puesto</th><th>Guardia</th><th>Programado</th><th>Ejecutado</th><th>Detalle</th></tr></thead>
                    <tbody>
                      {cambios.map((c) => (
                        <tr key={`${c.puestoId}|${c.cedula}|${c.fecha}`}>
                          <td>{fechaCorta(c.fecha)}</td>
                          <td>{puesto(c.puestoId)}</td>
                          <td>{c.nombre}</td>
                          <td>{c.programado ?? '—'}</td>
                          <td>{c.estado === 'FALTO' ? 'Faltó' : c.ejecutado ?? '—'}</td>
                          <td style={{ fontSize: '0.8rem' }}>{c.detalle}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <h4 style={{ margin: '0 0 6px' }}>Para revisar con Custodias</h4>
              {datos.avisos.length === 0 ? (
                <p style={{ color: '#718096', fontSize: '0.85rem', margin: 0 }}>Los días de custodia del horario coinciden con las custodias registradas.</p>
              ) : (
                <div className="tasks-table-wrapper" style={{ maxHeight: 220, overflow: 'auto' }}>
                  <table className="tasks-table">
                    <thead><tr><th>Día</th><th>Puesto</th><th>Guardia</th><th>Qué pasa</th></tr></thead>
                    <tbody>
                      {datos.avisos.map((a) => (
                        <tr key={`${a.tipo}|${a.puestoId}|${a.cedula}|${a.fecha}`}>
                          <td>{fechaCorta(a.fecha)}</td>
                          <td>{puesto(a.puestoId)}</td>
                          <td>{a.nombre}</td>
                          <td style={{ fontSize: '0.8rem' }}>{a.texto}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </div>
        <div className="modal-actions">
          <button className="btn-secondary" onClick={onClose}>Cerrar</button>
          <button className="auth-btn" onClick={descargar} disabled={!datos || bajando}>
            <Download size={16} /> {bajando ? 'Generando...' : 'Descargar Excel del ejecutado'}
          </button>
        </div>
      </div>
    </div>
  );
}
