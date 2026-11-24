import { AlertTriangle, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import type { InventarioDePuesto } from '../../../types/inventario';
import { CATEGORIA_ARMA_LABEL, CLASE_ARMA_LABEL, ESTADO_PERMISO_LABEL } from '../../../types/inventario';
import { formatoFecha, nombreArticulo, pluralUnidad } from './inventarioUi';

/**
 * Armas y equipo de un puesto (se abre desde la columna «Armas y equipo» del contrato en Operaciones).
 * Solo se mira: para cambiar algo se va a Inventario.
 */
export default function InventarioPuestoModal({ puesto, onClose }: { puesto: InventarioDePuesto; onClose: () => void }) {
  const navigate = useNavigate();
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-ventas-md" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Armas y equipo · {puesto.nombre}</h3>
          <button className="modal-close" onClick={onClose} aria-label="Cerrar"><X size={16} /></button>
        </div>
        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <section>
            <h4 style={{ margin: '0 0 6px', color: 'var(--azul-oscuro)' }}>Armas ({puesto.armas.length})</h4>
            {puesto.armas.length === 0 ? (
              <div style={{ fontSize: '0.9rem', color: '#718096' }}>Este puesto no tiene armas asignadas.</div>
            ) : (
              <div className="tasks-table-wrapper">
                <table className="tasks-table">
                  <thead>
                    <tr>
                      <th>Serie</th>
                      <th>Arma</th>
                      <th>Categoría</th>
                      <th>Municiones</th>
                      <th>Permiso</th>
                    </tr>
                  </thead>
                  <tbody>
                    {puesto.armas.map((a) => (
                      <tr key={a.id}>
                        <td style={{ fontFamily: 'monospace', fontWeight: 600 }}>
                          {a.serie}
                          {a.requiereCorreccion && (
                            <div>
                              <span className="status-badge" style={{ background: '#feebc8', color: '#c05621', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                                <AlertTriangle size={12} /> Por corregir
                              </span>
                            </div>
                          )}
                        </td>
                        <td style={{ fontSize: '0.85rem' }}>
                          {[CLASE_ARMA_LABEL[a.clase], a.marca, a.modelo, a.calibre].filter(Boolean).join(' · ')}
                        </td>
                        <td>{a.categoria ? CATEGORIA_ARMA_LABEL[a.categoria] : <span style={{ color: '#a0aec0' }}>—</span>}</td>
                        <td>{a.municiones ?? <span style={{ color: '#a0aec0' }}>—</span>}</td>
                        <td style={{ fontSize: '0.82rem' }}>
                          {a.permisoVence ? `${ESTADO_PERMISO_LABEL[a.permiso]} · ${formatoFecha(a.permisoVence)}` : ESTADO_PERMISO_LABEL[a.permiso]}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section>
            <h4 style={{ margin: '0 0 6px', color: 'var(--azul-oscuro)' }}>Equipo entregado ({puesto.totalEquipo})</h4>
            {puesto.equipo.length === 0 ? (
              <div style={{ fontSize: '0.9rem', color: '#718096' }}>Este puesto no tiene equipo entregado.</div>
            ) : (
              <ul style={{ margin: 0, paddingLeft: 18, fontSize: '0.9rem' }}>
                {puesto.equipo.map((e) => (
                  <li key={e.articuloId}>
                    {nombreArticulo(e.articulo, e.variante)}: <strong>{e.cantidad}</strong> {pluralUnidad(e.unidad, e.cantidad)}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
        <div className="modal-actions">
          <button type="button" className="btn-secondary" onClick={onClose}>Cerrar</button>
          <button type="button" className="auth-btn" onClick={() => navigate('/operaciones/inventario')}>Ir al Inventario</button>
        </div>
      </div>
    </div>
  );
}
