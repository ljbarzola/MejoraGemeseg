import { useEffect, useState } from 'react';
import { Pencil, Trash2, Check, X as XIcon } from 'lucide-react';
import ConfirmDialog from '../common/ConfirmDialog';
import ErrorBanner from '../common/ErrorBanner';
import {
  getServicios,
  createServicio,
  updateServicio,
  deleteServicio,
  type SalesServicio,
} from '../../services/ventas.service';

interface Props {
  onClose: () => void;
  // Avisa a la pantalla que el catálogo cambió, para recargar sus listas.
  onChanged: () => void;
}

const inputStyle = { padding: '8px 10px', borderRadius: 4, border: '1px solid #ddd', fontSize: 13 };

// Catálogo de servicios de la empresa: lo que se puede asignar a un contrato.
export default function ServiciosModal({ onClose, onChanged }: Props) {
  const [servicios, setServicios] = useState<SalesServicio[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [nuevo, setNuevo] = useState('');
  const [nuevaDesc, setNuevaDesc] = useState('');
  const [editId, setEditId] = useState<number | null>(null);
  const [editNombre, setEditNombre] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [aBorrar, setABorrar] = useState<SalesServicio | null>(null);

  const cargar = async () => {
    try {
      setServicios(await getServicios(true));
    } catch (err: any) {
      setError(err?.response?.data?.message || 'No se pudo cargar la lista de servicios.');
    } finally {
      setCargando(false);
    }
  };
  useEffect(() => { cargar(); }, []);

  const correr = async (fn: () => Promise<unknown>, falla: string) => {
    setError('');
    try {
      await fn();
      await cargar();
      onChanged();
    } catch (err: any) {
      setError(err?.response?.data?.message || falla);
    }
  };

  const agregar = () => {
    if (!nuevo.trim()) return setError('Escribe el nombre del servicio.');
    correr(async () => {
      await createServicio({ name: nuevo.trim(), description: nuevaDesc.trim() || undefined });
      setNuevo('');
      setNuevaDesc('');
    }, 'No se pudo crear el servicio.');
  };

  const guardarEdicion = () => {
    if (editId == null) return;
    if (!editNombre.trim()) return setError('El nombre no puede quedar vacío.');
    correr(async () => {
      await updateServicio(editId, { name: editNombre.trim(), description: editDesc.trim() });
      setEditId(null);
    }, 'No se pudo guardar el servicio.');
  };

  const confirmarBorrado = () => {
    const s = aBorrar;
    setABorrar(null);
    if (!s) return;
    correr(() => deleteServicio(s.id), 'No se pudo eliminar el servicio.');
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-lg" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Servicios</h3>
          <button className="modal-close" onClick={onClose} aria-label="Cerrar">✕</button>
        </div>
        <div className="modal-body">
          <p style={{ fontSize: 13, color: '#666', marginTop: 0 }}>
            Lo que ofrece la empresa. Un contrato puede incluir varios. Si un servicio ya no se vende, desactívalo: deja de ofrecerse en los contratos nuevos pero no se pierde de los que ya lo tienen.
          </p>
          <ErrorBanner mensaje={error} />

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
            <input
              type="text" value={nuevo} maxLength={100} placeholder="Nuevo servicio"
              onChange={(e) => setNuevo(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') agregar(); }}
              style={{ ...inputStyle, flex: '1 1 180px' }}
            />
            <input
              type="text" value={nuevaDesc} placeholder="Descripción o categoría (opcional)"
              onChange={(e) => setNuevaDesc(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') agregar(); }}
              style={{ ...inputStyle, flex: '1 1 220px' }}
            />
            <button className="auth-btn" onClick={agregar}>Agregar</button>
          </div>

          {cargando ? (
            <p style={{ color: '#888', fontSize: 13 }}>Cargando...</p>
          ) : servicios.length === 0 ? (
            <p style={{ color: '#888', fontSize: 13 }}>Todavía no hay servicios.</p>
          ) : (
            <div className="tasks-table-wrapper">
              <table className="tasks-table">
                <thead>
                  <tr>
                    <th>Servicio</th>
                    <th>Contratos</th>
                    <th>Activo</th>
                    <th className="col-acciones"><span className="visually-hidden">Acciones</span></th>
                  </tr>
                </thead>
                <tbody>
                  {servicios.map((s) => (
                    <tr key={s.id} style={s.isActive ? undefined : { opacity: 0.6 }}>
                      <td>
                        {editId === s.id ? (
                          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                            <input value={editNombre} maxLength={100} onChange={(e) => setEditNombre(e.target.value)}
                              style={{ ...inputStyle, flex: '1 1 140px', padding: '5px 8px' }} />
                            <input value={editDesc} placeholder="Descripción" onChange={(e) => setEditDesc(e.target.value)}
                              style={{ ...inputStyle, flex: '1 1 140px', padding: '5px 8px' }} />
                          </div>
                        ) : (
                          <>
                            <div style={{ fontWeight: 600 }}>{s.name}</div>
                            {s.description && <div style={{ fontSize: 11, color: '#888' }}>{s.description}</div>}
                          </>
                        )}
                      </td>
                      <td>{s.contratos ?? 0}</td>
                      <td>
                        <input
                          type="checkbox" checked={s.isActive}
                          aria-label={`Servicio ${s.name} activo`}
                          onChange={(e) => correr(() => updateServicio(s.id, { isActive: e.target.checked }), 'No se pudo cambiar el servicio.')}
                        />
                      </td>
                      <td className="col-acciones col-acciones--ancha">
                        <div className="acciones-iconos">
                          {editId === s.id ? (
                            <>
                              <button className="icon-btn" title="Guardar" aria-label="Guardar" onClick={guardarEdicion}><Check size={15} /></button>
                              <button className="icon-btn" title="Cancelar" aria-label="Cancelar" onClick={() => setEditId(null)}><XIcon size={15} /></button>
                            </>
                          ) : (
                            <>
                              <button className="icon-btn" title="Editar" aria-label={`Editar ${s.name}`}
                                onClick={() => { setEditId(s.id); setEditNombre(s.name); setEditDesc(s.description || ''); }}>
                                <Pencil size={15} />
                              </button>
                              <button className="icon-btn" title="Eliminar" aria-label={`Eliminar ${s.name}`} onClick={() => setABorrar(s)}>
                                <Trash2 size={15} />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
        <div className="modal-actions">
          <button className="btn-secondary" onClick={onClose}>Cerrar</button>
        </div>
      </div>

      {aBorrar && (
        <ConfirmDialog
          title="Eliminar servicio"
          message={`¿Eliminar «${aBorrar.name}»? Si ya está en algún contrato, no se podrá borrar y tendrás que desactivarlo.`}
          confirmLabel="Eliminar"
          danger
          onConfirm={confirmarBorrado}
          onCancel={() => setABorrar(null)}
        />
      )}
    </div>
  );
}
