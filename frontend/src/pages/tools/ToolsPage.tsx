import { useState, useEffect } from 'react';
import {
  getTools,
  createTool,
  deleteTool,
  getUsersWithTools,
  getAssignments,
  assignTool,
  updateAssignment,
  deleteAssignment,
  getAuditLog,
} from '../../services/tool.service';
import type { Tool, UserWithTools, ToolAssignment, ToolAuditLog } from '../../types/tool';

export default function ToolsPage() {
  const [users, setUsers] = useState<UserWithTools[]>([]);
  const [tools, setTools] = useState<Tool[]>([]);
  const [assignments, setAssignments] = useState<ToolAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [userFilter, setUserFilter] = useState('');
  const [toolFilter, setToolFilter] = useState('');
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [showToolModal, setShowToolModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showAuditModal, setShowAuditModal] = useState(false);
  const [auditLogs, setAuditLogs] = useState<ToolAuditLog[]>([]);
  const [editingAssignment, setEditingAssignment] = useState<ToolAssignment | null>(null);

  const [assignForm, setAssignForm] = useState({ toolId: '', selectedUsers: [] as number[], version: '', licenseKey: '' });
  const [toolForm, setToolForm] = useState({ name: '', category: '' });
  const [editForm, setEditForm] = useState({ version: '', licenseKey: '' });
  const [formError, setFormError] = useState('');
  const [formLoading, setFormLoading] = useState(false);

  const loadData = () => {
    setLoading(true);
    Promise.all([getUsersWithTools(), getTools(), getAssignments(toolFilter || undefined, userFilter || undefined)])
      .then(([u, t, a]) => { setUsers(u); setTools(t); setAssignments(a); })
      .finally(() => setLoading(false));
  };

  useEffect(() => { loadData(); }, []);

  useEffect(() => {
    getAssignments(toolFilter || undefined, userFilter || undefined).then(setAssignments).catch(() => {});
  }, [toolFilter, userFilter]);

  function toggleUser(userId: number) {
    setAssignForm((prev) => {
      const exists = prev.selectedUsers.includes(userId);
      return {
        ...prev,
        selectedUsers: exists
          ? prev.selectedUsers.filter((id) => id !== userId)
          : [...prev.selectedUsers, userId],
      };
    });
  }

  function selectAllUsers() {
    setAssignForm((prev) => ({
      ...prev,
      selectedUsers: users.map((u) => u.id),
    }));
  }

  function clearUsers() {
    setAssignForm((prev) => ({ ...prev, selectedUsers: [] }));
  }

  async function handleAssign() {
    if (!assignForm.toolId || assignForm.selectedUsers.length === 0) {
      setFormError('Selecciona herramienta y al menos un usuario');
      return;
    }
    setFormLoading(true);
    setFormError('');
    let successCount = 0;
    let errorCount = 0;
    try {
      for (const userId of assignForm.selectedUsers) {
        try {
          await assignTool({
            toolId: Number(assignForm.toolId),
            userId,
            version: assignForm.version || undefined,
            licenseKey: assignForm.licenseKey || undefined,
          });
          successCount++;
        } catch {
          errorCount++;
        }
      }
      setShowAssignModal(false);
      setAssignForm({ toolId: '', selectedUsers: [], version: '', licenseKey: '' });
      loadData();
      if (errorCount > 0) {
        setFormError(`${successCount} asignada(s), ${errorCount} fallida(s) (duplicados u otros errores)`);
      }
    } catch (err: any) {
      setFormError(err.response?.data?.message || 'Error al asignar');
    } finally {
      setFormLoading(false);
    }
  }

  async function handleCreateTool() {
    if (!toolForm.name.trim()) { setFormError('El nombre es requerido'); return; }
    setFormLoading(true); setFormError('');
    try {
      await createTool({ name: toolForm.name.trim(), category: toolForm.category.trim() || undefined });
      setShowToolModal(false);
      setToolForm({ name: '', category: '' });
      loadData();
    } catch (err: any) {
      setFormError(err.response?.data?.message || 'Error al crear herramienta');
    } finally { setFormLoading(false); }
  }

  async function handleDeleteTool(id: number) {
    if (!confirm('¿Eliminar esta herramienta y todas sus asignaciones?')) return;
    try { await deleteTool(id); loadData(); } catch {}
  }

  function openEditModal(a: ToolAssignment) {
    setEditingAssignment(a);
    setEditForm({ version: a.version || '', licenseKey: a.licenseKey || '' });
    setShowEditModal(true);
  }

  async function handleUpdateAssignment() {
    if (!editingAssignment) return;
    setFormLoading(true);
    try {
      await updateAssignment(editingAssignment.id, {
        version: editForm.version || undefined,
        licenseKey: editForm.licenseKey || undefined,
      });
      setShowEditModal(false);
      setEditingAssignment(null);
      loadData();
    } catch (err: any) {
      setFormError(err.response?.data?.message || 'Error al actualizar');
    } finally { setFormLoading(false); }
  }

  async function handleDeleteAssignment(id: number) {
    if (!confirm('¿Eliminar esta asignación?')) return;
    try { await deleteAssignment(id); loadData(); } catch {}
  }

  async function openAuditModal(assignmentId: number) {
    try {
      const logs = await getAuditLog(assignmentId);
      setAuditLogs(logs);
      setShowAuditModal(true);
    } catch {}
  }

  return (
    <div className="page-container">
      <div className="page-header-row">
        <div>
          <p className="page-eyebrow">GEMESEG</p>
          <h1>Herramientas</h1>
        </div>
        <div className="tools-actions">
          <button className="auth-btn" onClick={() => { setFormError(''); setAssignForm({ toolId: '', selectedUsers: [], version: '', licenseKey: '' }); setShowAssignModal(true); }}>
            + Asignar herramienta
          </button>
          <button className="btn-secondary" onClick={() => { setFormError(''); setShowToolModal(true); }}>
            + Nueva herramienta
          </button>
        </div>
      </div>

      <div className="admin-section">
        <div className="admin-toolbar">
          <input
            type="text"
            placeholder="Buscar por nombre de usuario..."
            value={userFilter}
            onChange={(e) => setUserFilter(e.target.value)}
            className="admin-search"
          />
          <input
            type="text"
            placeholder="Buscar por herramienta..."
            value={toolFilter}
            onChange={(e) => setToolFilter(e.target.value)}
            className="admin-search"
          />
        </div>

        {loading ? (
          <div className="loading-state">Cargando herramientas...</div>
        ) : (
          <>
            <div className="tools-section">
              <h2 className="tools-section-title">Usuarios ({users.length})</h2>
              {users.length === 0 ? (
                <div className="empty-state">No hay usuarios registrados</div>
              ) : (
                <div className="tools-users-grid">
                  {users.map((u) => (
                    <div key={u.id} className="tools-user-card">
                      <div className="tools-user-header">
                        <div className="member-avatar">{u.fullName.charAt(0)}</div>
                        <div>
                          <div className="member-name">{u.fullName}</div>
                          <div className="tools-user-email">{u.email}</div>
                        </div>
                      </div>
                      {u.toolAssignments.length === 0 ? (
                        <div className="tools-empty">Sin herramientas asignadas</div>
                      ) : (
                        <div className="tools-list">
                          {u.toolAssignments.map((ta) => (
                            <div key={ta.id} className="tools-list-item">
                              <div className="tools-list-info">
                                <span className="tools-name">{ta.tool.name}</span>
                                {ta.tool.category && <span className="tools-category">{ta.tool.category}</span>}
                                {ta.version && <span className="tools-version">v{ta.version}</span>}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="tools-section" style={{ marginTop: '32px' }}>
              <h2 className="tools-section-title">Catálogo de herramientas ({tools.length})</h2>
              {tools.length === 0 ? (
                <div className="empty-state">No hay herramientas registradas</div>
              ) : (
                <div className="tools-catalog-grid">
                  {tools.map((t) => (
                    <div key={t.id} className="tools-catalog-card">
                      <div className="tools-catalog-header">
                        <div className="tools-catalog-icon">🛠</div>
                        <div className="tools-catalog-info">
                          <div className="tools-catalog-name">{t.name}</div>
                          {t.category && <span className="tools-category">{t.category}</span>}
                        </div>
                        <button className="btn-danger-sm" onClick={() => handleDeleteTool(t.id)} title="Eliminar">✕</button>
                      </div>
                      <div className="tools-catalog-meta">
                        {t._count?.assignments ?? 0} asignación(es)
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="tools-section" style={{ marginTop: '32px' }}>
              <h2 className="tools-section-title">Asignaciones ({assignments.length})</h2>
              {assignments.length === 0 ? (
                <div className="empty-state">No hay asignaciones registradas</div>
              ) : (
                <div className="tasks-table-wrapper">
                  <table className="tasks-table">
                    <thead>
                      <tr>
                        <th>Usuario</th>
                        <th>Herramienta</th>
                        <th>Categoría</th>
                        <th>Versión</th>
                        <th>Licencia</th>
                        <th>Fecha</th>
                        <th>Acciones</th>
                      </tr>
                    </thead>
                    <tbody>
                      {assignments.map((a) => (
                        <tr key={a.id}>
                          <td>
                            <div className="tasks-table-assignee-item">
                              <span className="kanban-avatar">{a.user.fullName.charAt(0)}</span>
                              {a.user.fullName}
                            </div>
                          </td>
                          <td className="tasks-table-title">{a.tool.name}</td>
                          <td>{a.tool.category || '—'}</td>
                          <td>{a.version || '—'}</td>
                          <td>{a.licenseKey || '—'}</td>
                          <td className="tasks-table-date">
                            {new Date(a.createdAt).toLocaleDateString('es-EC')}
                          </td>
                          <td>
                            <div className="tools-actions-cell">
                              <button className="btn-sm-edit" onClick={() => openEditModal(a)} title="Editar">✎</button>
                              <button className="btn-sm-audit" onClick={() => openAuditModal(a.id)} title="Auditoría">📋</button>
                              <button className="btn-danger-sm" onClick={() => handleDeleteAssignment(a.id)} title="Eliminar">✕</button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {showAssignModal && (
        <div className="modal-overlay" onClick={() => setShowAssignModal(false)}>
          <div className="modal modal-lg" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Asignar herramienta</h3>
              <button className="modal-close" onClick={() => setShowAssignModal(false)}>✕</button>
            </div>
            <div className="modal-body">
              {formError && <div className="auth-error-banner">{formError}</div>}
              <div className="form-group">
                <label>Herramienta *</label>
                <select value={assignForm.toolId} onChange={(e) => setAssignForm({ ...assignForm, toolId: e.target.value })}>
                  <option value="">Seleccionar...</option>
                  {tools.map((t) => (
                    <option key={t.id} value={t.id}>{t.name}{t.category ? ` (${t.category})` : ''}</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label>Usuarios * ({assignForm.selectedUsers.length} seleccionados)</label>
                <div className="tools-user-select-toolbar">
                  <button type="button" className="btn-sm-tool" onClick={selectAllUsers}>Todos</button>
                  <button type="button" className="btn-sm-tool" onClick={clearUsers}>Ninguno</button>
                </div>
                <div className="tools-user-select-grid">
                  {users.map((u) => (
                    <button
                      key={u.id}
                      type="button"
                      className={`tools-user-select-chip ${assignForm.selectedUsers.includes(u.id) ? 'active' : ''}`}
                      onClick={() => toggleUser(u.id)}
                    >
                      <span className="assignee-chip-avatar">{u.fullName.charAt(0)}</span>
                      <span className="tools-user-select-name">{u.fullName}</span>
                    </button>
                  ))}
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Versión</label>
                  <input type="text" value={assignForm.version} onChange={(e) => setAssignForm({ ...assignForm, version: e.target.value })} placeholder="Opcional" />
                </div>
                <div className="form-group">
                  <label>Licencia</label>
                  <input type="text" value={assignForm.licenseKey} onChange={(e) => setAssignForm({ ...assignForm, licenseKey: e.target.value })} placeholder="Opcional" />
                </div>
              </div>
            </div>
            <div className="modal-actions">
              <button className="btn-secondary" onClick={() => setShowAssignModal(false)}>Cancelar</button>
              <button className="auth-btn" onClick={handleAssign} disabled={formLoading || assignForm.selectedUsers.length === 0}>
                {formLoading ? 'Asignando...' : `Asignar a ${assignForm.selectedUsers.length} usuario(s)`}
              </button>
            </div>
          </div>
        </div>
      )}

      {showToolModal && (
        <div className="modal-overlay" onClick={() => setShowToolModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Nueva herramienta</h3>
              <button className="modal-close" onClick={() => setShowToolModal(false)}>✕</button>
            </div>
            <div className="modal-body">
              {formError && <div className="auth-error-banner">{formError}</div>}
              <div className="form-group">
                <label>Nombre *</label>
                <input type="text" value={toolForm.name} onChange={(e) => setToolForm({ ...toolForm, name: e.target.value })} placeholder="Ej: VS Code" />
              </div>
              <div className="form-group">
                <label>Categoría</label>
                <input type="text" value={toolForm.category} onChange={(e) => setToolForm({ ...toolForm, category: e.target.value })} placeholder="Ej: IDE, Navegador, Diseño..." />
              </div>
            </div>
            <div className="modal-actions">
              <button className="btn-secondary" onClick={() => setShowToolModal(false)}>Cancelar</button>
              <button className="auth-btn" onClick={handleCreateTool} disabled={formLoading}>
                {formLoading ? 'Creando...' : 'Crear'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showEditModal && editingAssignment && (
        <div className="modal-overlay" onClick={() => setShowEditModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Editar asignación — {editingAssignment.tool.name}</h3>
              <button className="modal-close" onClick={() => setShowEditModal(false)}>✕</button>
            </div>
            <div className="modal-body">
              {formError && <div className="auth-error-banner">{formError}</div>}
              <div className="form-group">
                <label>Usuario</label>
                <input type="text" value={editingAssignment.user.fullName} disabled />
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Versión</label>
                  <input type="text" value={editForm.version} onChange={(e) => setEditForm({ ...editForm, version: e.target.value })} placeholder="Opcional" />
                </div>
                <div className="form-group">
                  <label>Licencia</label>
                  <input type="text" value={editForm.licenseKey} onChange={(e) => setEditForm({ ...editForm, licenseKey: e.target.value })} placeholder="Opcional" />
                </div>
              </div>
            </div>
            <div className="modal-actions">
              <button className="btn-secondary" onClick={() => setShowEditModal(false)}>Cancelar</button>
              <button className="auth-btn" onClick={handleUpdateAssignment} disabled={formLoading}>
                {formLoading ? 'Guardando...' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showAuditModal && (
        <div className="modal-overlay" onClick={() => setShowAuditModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Registro de auditoría</h3>
              <button className="modal-close" onClick={() => setShowAuditModal(false)}>✕</button>
            </div>
            <div className="modal-body">
              {auditLogs.length === 0 ? (
                <div className="empty-state">Sin registros de auditoría</div>
              ) : (
                <div className="audit-list">
                  {auditLogs.map((log) => (
                    <div key={log.id} className="audit-item">
                      <div className="audit-action">{log.action}</div>
                      <div className="audit-details">{log.details}</div>
                      <div className="audit-meta">
                        {log.performer.fullName} — {new Date(log.createdAt).toLocaleDateString('es-EC')} {new Date(log.createdAt).toLocaleTimeString('es-EC')}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="modal-actions">
              <button className="btn-secondary" onClick={() => setShowAuditModal(false)}>Cerrar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
