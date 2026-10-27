import { useState, useEffect } from 'react';
import { Activity, BookOpen, FileText, MessagesSquare, Trash2, Pencil } from 'lucide-react';
import PageHeader from '../../components/common/PageHeader';
import {
  getAgentCatalog,
  getAgentAssignments,
  createAgent,
  updateAgent,
  deleteAgent,
  assignAgent,
  unassignAgent,
  getAgentDocs,
} from '../../services/agent.service';
import type { Agent, AgentAssignment, DocumentacionAgente } from '../../types/agent';
import ConfirmDialog from '../../components/common/ConfirmDialog';
import AgenteDocModal from '../../components/sistemas/AgenteDocModal';
import ActividadAgentes from '../../components/sistemas/ActividadAgentes';
import HistorialPreguntasAgentes from '../../components/sistemas/HistorialPreguntasAgentes';
import PromptRealModal from '../../components/sistemas/PromptRealModal';

const SCOPE_OPTIONS = [
  { value: 'GLOBAL', label: 'Global', desc: 'Accede a toda la informacion del sistema' },
  { value: 'PROJECTS', label: 'Proyectos', desc: 'Enfocado en gestion de proyectos' },
  { value: 'TASKS', label: 'Tareas', desc: 'Enfocado en tareas y Kanban' },
  { value: 'ADMIN', label: 'Administracion', desc: 'Panel de administracion' },
  // Agente especializado (2026-10-07): solo consulta datos de Ventas y no aparece
  // para nadie hasta que se le asigne a una persona (botón de asignar).
  { value: 'VENTAS', label: 'Ventas', desc: 'Investiga clientes y cartera de Ventas; solo lo ve quien lo tenga asignado' },
  // Agente que trabaja solo (2026-10-18): lo siembra el sistema, no conversa ni se asigna.
  { value: 'BITACORAS', label: 'Revisor de bitácoras', desc: 'Lee las fotos de las bitácoras de Contratación Pública; no conversa' },
];

/** Los agentes que trabajan solos no se crean a mano, no se asignan y no cambian de alcance. */
const ES_TRABAJADOR = (scope: string) => scope === 'BITACORAS';

const SCOPE_PREVIEW: Record<string, string[]> = {
  GLOBAL: ['Proyectos activos', 'Tareas asignadas', 'Rol del usuario', 'Informacion del perfil'],
  PROJECTS: ['Proyectos activos', 'Estados de proyectos', 'Miembros por proyecto', 'Estadisticas'],
  TASKS: ['Tareas asignadas', 'Estados Kanban', 'Prioridades', 'Fechas de entrega'],
  ADMIN: ['Todos los usuarios', 'Estadisticas globales', 'Roles y permisos', 'Metricas del sistema'],
  VENTAS: ['Expediente de un cliente', 'Cartera y contratos', 'Motivos de pérdida', 'Embudo de ventas'],
  BITACORAS: ['Foto de la hoja', 'Guardias y sus horas', 'Novedades por tipo', 'Nada del horario ni de los guardias'],
};

export default function AgentsPage() {
  const [catalog, setCatalog] = useState<(Agent & { _count: { userLinks: number } })[]>([]);
  const [assignments, setAssignments] = useState<AgentAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [agentFilter, setAgentFilter] = useState('');
  const [userFilter, setUserFilter] = useState('');

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [editingAgent, setEditingAgent] = useState<Agent | null>(null);
  const [assigningAgent, setAssigningAgent] = useState<Agent | null>(null);

  const [createForm, setCreateForm] = useState({ name: '', systemMsg: '', scope: 'GLOBAL', userId: '' });
  const [editForm, setEditForm] = useState({ name: '', systemMsg: '', scope: 'GLOBAL' });
  const [assignForm, setAssignForm] = useState({ selectedUsers: [] as number[] });
  const [formError, setFormError] = useState('');
  const [formLoading, setFormLoading] = useState(false);
  const [confirmandoEliminarAgente, setConfirmandoEliminarAgente] = useState<number | null>(null);
  const [confirmandoQuitarAsignacion, setConfirmandoQuitarAsignacion] = useState<number | null>(null);
  const [docs, setDocs] = useState<DocumentacionAgente[]>([]);
  const [verDoc, setVerDoc] = useState<DocumentacionAgente | null>(null);
  const [verActividad, setVerActividad] = useState<Agent | null>(null);
  const [verPreguntas, setVerPreguntas] = useState<Agent | null>(null);
  const [verPromptDe, setVerPromptDe] = useState<number | null>(null);

  const loadData = () => {
    setLoading(true);
    Promise.all([getAgentCatalog(), getAgentAssignments()])
      .then(([c, a]) => { setCatalog(c); setAssignments(a); })
      .finally(() => setLoading(false));
  };

  useEffect(() => { loadData(); }, []);
  useEffect(() => { getAgentDocs().then(setDocs).catch(() => setDocs([])); }, []);

  const filteredAssignments = assignments.filter((a) => {
    if (agentFilter && !a.agent.name.toLowerCase().includes(agentFilter.toLowerCase())) return false;
    if (userFilter && !a.user.fullName.toLowerCase().includes(userFilter.toLowerCase()) && !a.user.email.toLowerCase().includes(userFilter.toLowerCase())) return false;
    return true;
  });

  const allUserOptions = (() => {
    const seen = new Set<number>();
    return assignments
      .filter((a) => { if (seen.has(a.user.id)) return false; seen.add(a.user.id); return true; })
      .map((a) => a.user);
  })();

  function openCreateModal() {
    setCreateForm({ name: '', systemMsg: '', scope: 'GLOBAL', userId: '' });
    setFormError('');
    setShowCreateModal(true);
  }

  function openEditModal(agent: Agent) {
    setEditingAgent(agent);
    setEditForm({ name: agent.name, systemMsg: agent.instructions, scope: agent.scope });
    setFormError('');
    setShowEditModal(true);
  }

  async function handleCreate() {
    if (!createForm.name.trim()) { setFormError('El nombre es requerido'); return; }
    if (!createForm.systemMsg.trim()) { setFormError('El prompt del sistema es requerido'); return; }
    if (!createForm.userId) { setFormError('Selecciona un usuario creador'); return; }
    setFormLoading(true); setFormError('');
    try {
      await createAgent({
        userId: Number(createForm.userId),
        name: createForm.name.trim(),
        systemMsg: createForm.systemMsg.trim(),
        scope: createForm.scope,
      });
      setShowCreateModal(false);
      loadData();
    } catch (err: any) {
      setFormError(err.response?.data?.message || 'Error al crear agente');
    } finally { setFormLoading(false); }
  }

  async function handleEdit() {
    if (!editingAgent || !editForm.name.trim()) return;
    setFormLoading(true); setFormError('');
    try {
      await updateAgent(editingAgent.id, {
        name: editForm.name.trim(),
        systemMsg: editForm.systemMsg.trim(),
        scope: editForm.scope,
      });
      setShowEditModal(false);
      loadData();
    } catch (err: any) {
      setFormError(err.response?.data?.message || 'Error al actualizar');
    } finally { setFormLoading(false); }
  }

  function handleDeleteAgent(id: number) {
    setConfirmandoEliminarAgente(id);
  }

  async function confirmarEliminarAgente() {
    if (confirmandoEliminarAgente === null) return;
    const id = confirmandoEliminarAgente;
    setConfirmandoEliminarAgente(null);
    try { await deleteAgent(id); loadData(); } catch {}
  }

  async function handleAssign() {
    if (!assigningAgent || assignForm.selectedUsers.length === 0) {
      setFormError('Selecciona al menos un usuario');
      return;
    }
    setFormLoading(true); setFormError('');
    let successCount = 0;
    let errorCount = 0;
    for (const userId of assignForm.selectedUsers) {
      try { await assignAgent(assigningAgent.id, userId); successCount++; } catch { errorCount++; }
    }
    setShowAssignModal(false);
    loadData();
    if (errorCount > 0) {
      setFormError(`${successCount} asignada(s), ${errorCount} fallida(s)`);
    }
  }

  function handleUnassign(assignmentId: number) {
    setConfirmandoQuitarAsignacion(assignmentId);
  }

  async function confirmarQuitarAsignacion() {
    if (confirmandoQuitarAsignacion === null) return;
    const assignmentId = confirmandoQuitarAsignacion;
    setConfirmandoQuitarAsignacion(null);
    const a = assignments.find((x) => x.id === assignmentId);
    if (a) { try { await unassignAgent(a.agent.id, a.user.id); loadData(); } catch {} }
  }

  function toggleAssignUser(userId: number) {
    setAssignForm((prev) => ({
      ...prev,
      selectedUsers: prev.selectedUsers.includes(userId)
        ? prev.selectedUsers.filter((id) => id !== userId)
        : [...prev.selectedUsers, userId],
    }));
  }

  const previewItems = SCOPE_PREVIEW[editForm.scope] || SCOPE_PREVIEW.GLOBAL;

  return (
    <div className="page-container">
      <PageHeader
        eyebrow="Sistemas"
        title="Agentes de IA"
        description="Qué agentes hay, a quién está asignado cada uno, qué se les ha preguntado, su prompt real y qué han hecho los que trabajan solos."
        actions={
          <>
            <button className="btn-secondary" onClick={openCreateModal}>
              + Nuevo agente
            </button>
            <button className="auth-btn" onClick={() => { setFormError(''); setShowAssignModal(true); setAssigningAgent(null); setAssignForm({ selectedUsers: [] }); }}>
              + Asignar agente
            </button>
          </>
        }
      />

      <div className="filter-bar">
        <div className="filter-bar-fields">
          <input type="text" placeholder="Buscar por agente..." value={agentFilter} onChange={(e) => setAgentFilter(e.target.value)} className="admin-search" />
          <input type="text" placeholder="Buscar por usuario..." value={userFilter} onChange={(e) => setUserFilter(e.target.value)} className="admin-search" />
        </div>
      </div>

      <div className="admin-section">
        {loading ? (
          <div className="loading-state">Cargando agentes...</div>
        ) : (
          <>
            <div className="tools-section">
              <h2 className="tools-section-title">Agentes ({catalog.length})</h2>
              {catalog.length === 0 ? (
                <div className="empty-state">No hay agentes creados</div>
              ) : (
                <div className="tools-catalog-grid">
                  {catalog.map((agent) => (
                    <div key={agent.id} className="tools-catalog-card">
                      <div className="tools-catalog-header">
                        <div className="tools-catalog-icon">🤖</div>
                        <div className="tools-catalog-info">
                          <div className="tools-catalog-name">{agent.name}</div>
                          <span className="agent-scope-badge">{agent.scope}</span>
                        </div>
                        <div className="tools-actions-cell">
                          <button className="btn-secondary icon-btn" onClick={() => setVerPromptDe(agent.id)} title="Ver el prompt real" aria-label="Ver el prompt real"><FileText size={14} /></button>
                          {!ES_TRABAJADOR(agent.scope) && (
                            <button className="btn-secondary icon-btn" onClick={() => setVerPreguntas(agent)} title="Qué le han preguntado" aria-label="Qué le han preguntado"><MessagesSquare size={14} /></button>
                          )}
                          {docs.some((d) => d.scope === agent.scope) && (
                            <>
                              <button className="btn-secondary icon-btn" onClick={() => setVerDoc(docs.find((d) => d.scope === agent.scope) ?? null)} title="Qué hace este agente" aria-label="Qué hace este agente"><BookOpen size={14} /></button>
                              <button className="btn-secondary icon-btn" onClick={() => setVerActividad(agent)} title="Qué ha hecho este agente" aria-label="Qué ha hecho este agente"><Activity size={14} /></button>
                            </>
                          )}
                          <button className="btn-secondary icon-btn" onClick={() => openEditModal(agent)} title="Editar" aria-label="Editar"><Pencil size={14} /></button>
                          {!ES_TRABAJADOR(agent.scope) && (
                            <button className="btn-secondary icon-btn" style={{ color: '#c53030' }} onClick={() => handleDeleteAgent(agent.id)} title="Eliminar agente" aria-label="Eliminar agente"><Trash2 size={14} /></button>
                          )}
                        </div>
                      </div>
                      <div className="tools-catalog-meta">
                        {ES_TRABAJADOR(agent.scope)
                          ? `Trabaja solo, no conversa — ${agent.isActive ? 'Activo' : 'Inactivo'}`
                          : `${agent._count.userLinks} asignacion(es) — ${agent.isActive ? 'Activo' : 'Inactivo'}`}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="tools-section" style={{ marginTop: '32px' }}>
              <h2 className="tools-section-title">Asignaciones ({filteredAssignments.length})</h2>
              {filteredAssignments.length === 0 ? (
                <div className="empty-state">No hay asignaciones registradas</div>
              ) : (
                <div className="tasks-table-wrapper">
                  <table className="tasks-table">
                    <thead>
                      <tr>
                        <th>Usuario</th>
                        <th>Agente</th>
                        <th>Alcance</th>
                        <th>Estado</th>
                        <th>Fecha</th>
                        <th>Acciones</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredAssignments.map((a) => (
                        <tr key={a.id}>
                          <td>
                            <div className="tasks-table-assignee-item">
                              <span className="kanban-avatar">{a.user.fullName.charAt(0)}</span>
                              {a.user.fullName}
                            </div>
                          </td>
                          <td className="tasks-table-title">{a.agent.name}</td>
                          <td><span className="agent-scope-badge">{a.agent.scope}</span></td>
                          <td>
                            <span className={`status-badge ${a.agent.isActive ? 'agent-active' : 'agent-inactive'}`}>
                              {a.agent.isActive ? 'Activo' : 'Inactivo'}
                            </span>
                          </td>
                          <td className="tasks-table-date">
                            {new Date(a.createdAt).toLocaleDateString('es-EC')}
                          </td>
                          <td>
                            <div className="tools-actions-cell">
                              <button className="btn-secondary icon-btn" style={{ color: '#c53030' }} onClick={() => handleUnassign(a.id)} title="Quitar agente" aria-label="Quitar agente"><Trash2 size={14} /></button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
            <div className="tools-section" style={{ marginTop: '32px' }}>
              <h2 className="tools-section-title">Preguntas a los agentes</h2>
              <HistorialPreguntasAgentes />
            </div>
            <div className="tools-section" style={{ marginTop: '32px' }}>
              <h2 className="tools-section-title">Actividad de los agentes que trabajan solos</h2>
              <ActividadAgentes />
            </div>
          </>
        )}
      </div>

      {showCreateModal && (
        <div className="modal-overlay" onClick={() => setShowCreateModal(false)}>
          <div className="modal modal-lg" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Nuevo agente</h3>
              <button className="modal-close" onClick={() => setShowCreateModal(false)}>✕</button>
            </div>
            <div className="modal-body">
              {formError && <div className="auth-error-banner">{formError}</div>}
              <div className="form-group">
                <label>Nombre del agente *</label>
                <input type="text" value={createForm.name} onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })} placeholder="Ej: Agente de Marketing" maxLength={100} />
              </div>
              <div className="form-group">
                <label>Usuario creador *</label>
                <select value={createForm.userId} onChange={(e) => setCreateForm({ ...createForm, userId: e.target.value })}>
                  <option value="">Seleccionar usuario...</option>
                  {allUserOptions.map((u) => (
                    <option key={u.id} value={u.id}>{u.fullName} ({u.email})</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label>Alcance</label>
                <select value={createForm.scope} onChange={(e) => setCreateForm({ ...createForm, scope: e.target.value })}>
                  {SCOPE_OPTIONS.filter((opt) => !ES_TRABAJADOR(opt.value)).map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label} — {opt.desc}</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label>System Prompt * ({createForm.systemMsg.length}/6000)</label>
                <textarea className="form-textarea" value={createForm.systemMsg} onChange={(e) => setCreateForm({ ...createForm, systemMsg: e.target.value })} placeholder="Instruccion del sistema para el agente de IA..." rows={6} maxLength={6000} />
              </div>
            </div>
            <div className="modal-actions">
              <button className="btn-secondary" onClick={() => setShowCreateModal(false)}>Cancelar</button>
              <button className="auth-btn" onClick={handleCreate} disabled={formLoading}>{formLoading ? 'Creando...' : 'Crear agente'}</button>
            </div>
          </div>
        </div>
      )}

      {showEditModal && editingAgent && (
        <div className="modal-overlay" onClick={() => setShowEditModal(false)}>
          <div className="modal modal-lg" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Editar agente — {editingAgent.name}</h3>
              <button className="modal-close" onClick={() => setShowEditModal(false)}>✕</button>
            </div>
            <div className="modal-body">
              {formError && <div className="auth-error-banner">{formError}</div>}
              <div className="form-group">
                <label>Nombre del agente *</label>
                <input type="text" value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} maxLength={100} />
              </div>
              <div className="form-group">
                <label>Alcance</label>
                <select value={editForm.scope} disabled={ES_TRABAJADOR(editingAgent.scope)} onChange={(e) => setEditForm({ ...editForm, scope: e.target.value })}>
                  {SCOPE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label} — {opt.desc}</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label>{ES_TRABAJADOR(editingAgent.scope) ? 'Instrucciones: cómo es la hoja de tu empresa' : 'System Prompt *'} ({editForm.systemMsg.length}/6000)</label>
                <textarea className="form-textarea" value={editForm.systemMsg} onChange={(e) => setEditForm({ ...editForm, systemMsg: e.target.value })} rows={6} maxLength={6000} />
              </div>
              <div className="agent-preview">
                <h4 className="agent-preview-title">Vista previa — Datos incluidos en el prompt</h4>
                <button type="button" className="btn-secondary" style={{ marginBottom: 8 }} onClick={() => setVerPromptDe(editingAgent.id)}>
                  <FileText size={14} /> Ver el prompt real completo
                </button>
                <div className="agent-preview-items">
                  {previewItems.map((item) => (
                    <span key={item} className="agent-preview-chip">{item}</span>
                  ))}
                </div>
              </div>
              <div className="form-group">
                <label>Estado</label>
                <label className="agent-toggle-label">
                  <input type="checkbox" checked={editingAgent.isActive} onChange={async (e) => {
                    try { await updateAgent(editingAgent.id, { isActive: e.target.checked }); setEditingAgent({ ...editingAgent, isActive: e.target.checked }); loadData(); } catch {}
                  }} />
                  <span>{editingAgent.isActive ? 'Activo' : 'Inactivo'}</span>
                </label>
              </div>
            </div>
            <div className="modal-actions">
              <button className="btn-secondary" onClick={() => setShowEditModal(false)}>Cancelar</button>
              <button className="auth-btn" onClick={handleEdit} disabled={formLoading}>{formLoading ? 'Guardando...' : 'Guardar'}</button>
            </div>
          </div>
        </div>
      )}

      {verDoc && <AgenteDocModal doc={verDoc} modelo={verDoc.modelo} onClose={() => setVerDoc(null)} />}

      {verActividad && (
        <div className="modal-overlay" onClick={() => setVerActividad(null)}>
          <div className="modal modal-lg" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Qué ha hecho — {verActividad.name}</h3>
              <button className="modal-close" onClick={() => setVerActividad(null)}>✕</button>
            </div>
            <div className="modal-body" style={{ maxHeight: '70vh', overflowY: 'auto' }}>
              <ActividadAgentes agentId={verActividad.id} />
            </div>
            <div className="modal-actions">
              <button className="btn-secondary" onClick={() => setVerActividad(null)}>Cerrar</button>
            </div>
          </div>
        </div>
      )}

      {verPromptDe !== null && <PromptRealModal agentId={verPromptDe} onClose={() => setVerPromptDe(null)} />}

      {verPreguntas && (
        <div className="modal-overlay" onClick={() => setVerPreguntas(null)}>
          <div className="modal modal-xl" style={{ maxWidth: 1040 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Qué le han preguntado — {verPreguntas.name}</h3>
              <button className="modal-close" onClick={() => setVerPreguntas(null)}>✕</button>
            </div>
            <div className="modal-body" style={{ maxHeight: '70vh', overflowY: 'auto' }}>
              <HistorialPreguntasAgentes agentId={verPreguntas.id} />
            </div>
            <div className="modal-actions">
              <button className="btn-secondary" onClick={() => setVerPreguntas(null)}>Cerrar</button>
            </div>
          </div>
        </div>
      )}

      {showAssignModal && (
        <div className="modal-overlay" onClick={() => setShowAssignModal(false)}>
          <div className="modal modal-lg" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{assigningAgent ? `Asignar agente — ${assigningAgent.name}` : 'Asignar agente'}</h3>
              <button className="modal-close" onClick={() => setShowAssignModal(false)}>✕</button>
            </div>
            <div className="modal-body">
              {formError && <div className="auth-error-banner">{formError}</div>}
              {!assigningAgent && (
                <div className="form-group">
                  <label>Agente *</label>
                  <select value="" onChange={(e) => { const ag = catalog.find((a) => a.id === Number(e.target.value)); if (ag) { setAssigningAgent(ag); setAssignForm({ selectedUsers: [] }); } }}>
                    <option value="">Seleccionar agente...</option>
                    {catalog.filter((a) => a.isActive && !ES_TRABAJADOR(a.scope)).map((a) => (
                      <option key={a.id} value={a.id}>{a.name} ({a.scope})</option>
                    ))}
                  </select>
                </div>
              )}
              {assigningAgent && (
                <>
                  <div className="form-group">
                    <label>Seleccionar usuarios *</label>
                    <div className="tools-user-select-grid">
                      {allUserOptions.map((u) => (
                        <button key={u.id} type="button" className={`tools-user-select-chip ${assignForm.selectedUsers.includes(u.id) ? 'active' : ''}`} onClick={() => toggleAssignUser(u.id)}>
                          <span className="assignee-chip-avatar">{u.fullName.charAt(0)}</span>
                          <span className="tools-user-select-name">{u.fullName}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>
            <div className="modal-actions">
              <button className="btn-secondary" onClick={() => setShowAssignModal(false)}>Cancelar</button>
              <button className="auth-btn" onClick={handleAssign} disabled={formLoading || !assigningAgent || assignForm.selectedUsers.length === 0}>
                {formLoading ? 'Asignando...' : `Asignar a ${assignForm.selectedUsers.length} usuario(s)`}
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmandoEliminarAgente !== null && (
        <ConfirmDialog
          title="Eliminar agente"
          message="¿Eliminar este agente y todas sus asignaciones?"
          confirmLabel="Eliminar"
          danger
          onConfirm={confirmarEliminarAgente}
          onCancel={() => setConfirmandoEliminarAgente(null)}
        />
      )}

      {confirmandoQuitarAsignacion !== null && (
        <ConfirmDialog
          title="Quitar agente"
          message="¿Quitar este agente del usuario?"
          confirmLabel="Quitar"
          danger
          onConfirm={confirmarQuitarAsignacion}
          onCancel={() => setConfirmandoQuitarAsignacion(null)}
        />
      )}
    </div>
  );
}
