import { useState, useEffect } from 'react';
import { X, Archive } from 'lucide-react';
import { getMovimiento, toggleMovimientoItem, type MovimientoPersonal, type MovimientoPersonalItem } from '../../services/movimiento-personal.service';
import { archivarCarpetaGuardia } from '../../services/personal.service';

interface Props {
  /** null cierra el modal. */
  movimientoId: number | null;
  onClose: () => void;
  onChanged?: () => void;
}

const TIPO_LABEL: Record<string, string> = { ENTRADA: 'Entrada', SALIDA: 'Salida' };

export default function MovimientoDetalleModal({ movimientoId, onClose, onChanged }: Props) {
  const [movimiento, setMovimiento] = useState<MovimientoPersonal | null>(null);
  const [loading, setLoading] = useState(false);
  const [notasDraft, setNotasDraft] = useState<Record<number, string>>({});
  const [archivando, setArchivando] = useState(false);
  const [archivarMsg, setArchivarMsg] = useState('');

  const load = () => {
    if (!movimientoId) return;
    setLoading(true);
    getMovimiento(movimientoId)
      .then((m) => {
        setMovimiento(m);
        setNotasDraft(Object.fromEntries(m.items.map((i) => [i.id, i.notas || ''])));
      })
      .catch(() => setMovimiento(null))
      .finally(() => setLoading(false));
  };

  useEffect(load, [movimientoId]);

  if (!movimientoId) return null;

  const handleToggle = async (item: MovimientoPersonalItem) => {
    if (!movimiento) return;
    try {
      const updated = await toggleMovimientoItem(movimiento.id, item.id, {
        completado: !item.completado,
        notas: notasDraft[item.id] || undefined,
      });
      setMovimiento(updated);
      onChanged?.();
    } catch (err: any) {
      alert(err.response?.data?.message || 'No se pudo actualizar el ítem');
    }
  };

  const handleArchivarCarpeta = async () => {
    if (!movimiento) return;
    if (!confirm(`¿Mover la carpeta de Drive de ${movimiento.nombreGuardia} a la carpeta de archivo configurada? No se borra ningún documento.`)) return;
    setArchivando(true);
    setArchivarMsg('');
    try {
      await archivarCarpetaGuardia(movimiento.cedula);
      setArchivarMsg('Carpeta archivada correctamente.');
    } catch (err: any) {
      setArchivarMsg(err.response?.data?.message || 'No se pudo archivar la carpeta.');
    } finally {
      setArchivando(false);
    }
  };

  const handleGuardarNotas = async (item: MovimientoPersonalItem) => {
    if (!movimiento) return;
    try {
      const updated = await toggleMovimientoItem(movimiento.id, item.id, {
        completado: item.completado,
        notas: notasDraft[item.id] || undefined,
      });
      setMovimiento(updated);
      onChanged?.();
    } catch (err: any) {
      alert(err.response?.data?.message || 'No se pudo guardar la nota');
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-lg" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <h3>{movimiento ? `${TIPO_LABEL[movimiento.tipo]} — ${movimiento.nombreGuardia}` : 'Detalle del movimiento'}</h3>
            {movimiento && (
              <p style={{ margin: '2px 0 0', color: '#718096', fontSize: '0.85rem' }}>
                Cédula: <strong>{movimiento.cedula}</strong> · Estado:{' '}
                <span className="status-badge" style={{
                  background: movimiento.estado === 'COMPLETADO' ? '#c6f6d5' : '#fefcbf',
                  color: movimiento.estado === 'COMPLETADO' ? '#276749' : '#975a16',
                }}>
                  {movimiento.estado === 'COMPLETADO' ? 'Completado' : 'En proceso'}
                </span>
              </p>
            )}
          </div>
          <button className="modal-close" onClick={onClose}><X size={16} /></button>
        </div>
        <div className="modal-body">
          {loading ? (
            <div className="loading-state">Cargando detalle...</div>
          ) : !movimiento ? (
            <div className="empty-state">No se pudo cargar este movimiento.</div>
          ) : movimiento.items.length === 0 ? (
            <div className="empty-state">No hay sistemas configurados en el catálogo — ve a "Sistemas de Verificación" para agregarlos.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {movimiento.items.map((item) => (
                <div key={item.id} style={{ border: '1px solid #e2e8f0', borderRadius: '10px', padding: '12px 14px', background: item.completado ? '#f0fff4' : '#fff' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', fontWeight: 600, color: 'var(--azul-oscuro)' }}>
                    <input type="checkbox" checked={item.completado} onChange={() => handleToggle(item)} style={{ width: '18px', height: '18px' }} />
                    {item.nombreSistema}
                    {item.completado && item.completadoAt && (
                      <span style={{ fontWeight: 400, fontSize: '0.75rem', color: '#718096' }}>
                        — completado el {new Date(item.completadoAt).toLocaleDateString('es-EC')}
                      </span>
                    )}
                  </label>
                  <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                    <input
                      value={notasDraft[item.id] || ''}
                      onChange={(e) => setNotasDraft((prev) => ({ ...prev, [item.id]: e.target.value }))}
                      onBlur={() => handleGuardarNotas(item)}
                      placeholder="Notas (opcional)"
                      style={{ flex: 1, padding: '6px 10px', borderRadius: '6px', border: '1px solid #cbd5e0', fontSize: '0.82rem' }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        {archivarMsg && (
          <div style={{ margin: '0 24px 8px', fontSize: '0.8rem', color: archivarMsg.startsWith('Carpeta archivada') ? '#276749' : '#c53030' }}>
            {archivarMsg}
          </div>
        )}
        <div className="modal-actions">
          {movimiento?.tipo === 'SALIDA' && movimiento.estado === 'COMPLETADO' && (
            <button className="btn-secondary" onClick={handleArchivarCarpeta} disabled={archivando} style={{ display: 'flex', alignItems: 'center', gap: '6px', marginRight: 'auto' }}>
              <Archive size={15} /> {archivando ? 'Archivando...' : 'Archivar carpeta'}
            </button>
          )}
          <button className="btn-secondary" onClick={onClose}>Cerrar</button>
        </div>
      </div>
    </div>
  );
}
