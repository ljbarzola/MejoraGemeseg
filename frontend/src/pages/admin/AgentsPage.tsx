import { useState, useEffect } from 'react';
import {
  getAgents,
  createAgent,
  updateAgent,
  deleteAgent,
} from '../../services/agent.service';
import type { UserWithAgent, Agent } from '../../types/agent';

const SCOPE_OPTIONS = [
  { value: 'GLOBAL', label: 'Global', desc: 'Accede a toda la informacion del sistema' },
  { value: 'PROJECTS', label: 'Proyectos', desc: 'Enfocado en gestion de proyectos' },
  { value: 'TASKS', label: 'Tareas', desc: 'Enfocado en tareas y Kanban' },
  { value: 'ADMIN', label: 'Administracion', desc: 'Panel de administracion' },
];

const SCOPE_PREVIEW: Record<string, string[]> = {
  GLOBAL: ['Proyectos activos', 'Tareas asignadas', 'Rol del usuario', 'Informacion del perfil'],
  PROJECTS: ['Proyectos activos', 'Estados de proyectos', 'Miembros por proyecto', 'Estadisticas'],
  TASKS: ['Tareas asignadas', 'Estados Kanban', 'Prioridades', 'Fechas de entrega'],
  ADMIN: ['Todos los usuarios', 'Estadisticas globales', 'Roles y permisos', 'Metricas del sistema'],
};

export default function AgentsPage() {
  const [users, setUsers] = useState<UserWithAgent[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingAgent, setEditingAgent] = useState<Agent | null>(null);
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);

  const [form, setForm] = useState({ name: '', systemMsg: '', scope: 'GLOBAL' });
  const [formError, setFormError] = useState('');
  const [formLoading, setFormLoading] = useState(false);

  const loadUsers = () => {
    setLoading(true);
    getAgents().then(setUsers).finally(() => setLoading(false));
  };

  useEffect(() => { loadUsers(); }, []);

  function openCreateModal(userId: number) {
    setSelectedUserId(userId);
    setEditingAgent(null);
    setForm({ name: '', systemMsg: '', scope: 'GLOBAL' });
    setFormError('');
    setShowModal(true);
  }

  function openEditModal(agent: Agent) {
    setSelectedUserId(agent.createdBy);
    setEditingAgent(agent);
    setForm({
      name: agent.name,
      systemMsg: agent.instructions,
      scope: agent.scope,
    });
    setFormError('');
    setShowModal(true);
  }

  async function handleSave() {
    if (!form.name.trim()) { setFormError('El nombre es requerido'); return; }
    if (!form.systemMsg.trim()) { setFormError('El prompt del sistema es requerido'); return; }
    if (form.systemMsg.length > 2000) { setFormError('Maximo 2000 caracteres en el prompt'); return; }
    if (!selectedUserId) return;

    setFormLoading(true);
    setFormError('');
    try {
      if (editingAgent) {
        await updateAgent(editingAgent.id, {
          name: form.name.trim(),
          systemMsg: form.systemMsg.trim(),
          scope: form.scope,
        });
      } else {
        await createAgent({
          userId: selectedUserId,
          name: form.name.trim(),
          systemMsg: form.systemMsg.trim(),
          scope: form.scope,
        });
      }
      setShowModal(false);
      loadUsers();
    } catch (err: any) {
      setFormError(err.response?.data?.message || 'Error al guardar agente');
    } finally {
      setFormLoading(false);
    }
  }

  async function handleDelete(agentId: number) {
    if (!confirm('¿Eliminar este agente? El usuario volvera al prompt base.')) return;
    try {
      await deleteAgent(agentId);
      loadUsers();
    } catch (err: any) {
      alert(err.response?.data?.message || 'Error al eliminar');
    }
  }

  const previewItems = SCOPE_PREVIEW[form.scope] || SCOPE_PREVIEW.GLOBAL;

  return (
    <div className="page-container">
      <div className="page-header-row">
        <div>
          <p className="page-eyebrow">GEMESEG</p>
          <h1>Agentes de IA</h1>
        </div>
      </div>

      <div className="admin-section">
        {loading ? (
          <div className="loading-state">Cargando agentes...</div>
        ) : (
          <div className="tasks-table-wrapper">
            <table className="tasks-table">
              <thead>
                <tr>
                  <th>Usuario</th>
                  <th>Email</th>
                  <th>Rol</th>
                  <th>Agente</th>
                  <th>Alcance</th>
                  <th>Estado</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) =>
                  u.agents.length > 0 ? (
                    u.agents.map((agent, idx) => (
                      <tr key={`${u.id}-${agent.id}`}>
                        {idx === 0 && (
                          <>
                            <td className="tasks-table-title" rowSpan={u.agents.length}>
                              <div className="tasks-table-assignee-item">
                                <span className="kanban-avatar">{u.fullName.charAt(0)}</span>
                                {u.fullName}
                              </div>
                            </td>
                            <td rowSpan={u.agents.length}>{u.email}</td>
                            <td rowSpan={u.agents.length}>{u.role}</td>
                          </>
                        )}
                        <td><span className="tools-name">{agent.name}</span></td>
                        <td><span className="agent-scope-badge">{agent.scope}</span></td>
                        <td>
                          <span className={`status-badge ${agent.isActive ? 'agent-active' : 'agent-inactive'}`}>
                            {agent.isActive ? 'Activo' : 'Inactivo'}
                          </span>
                        </td>
                        <td>
                          <div className="tools-actions-cell">
                            <button className="btn-sm-edit" onClick={() => openEditModal(agent)} title="Editar agente">✎</button>
                            <button className="btn-danger-sm" onClick={() => handleDelete(agent.id)} title="Eliminar agente">✕</button>
                          </div>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr key={u.id}>
                      <td className="tasks-table-title">
                        <div className="tasks-table-assignee-item">
                          <span className="kanban-avatar">{u.fullName.charAt(0)}</span>
                          {u.fullName}
                        </div>
                      </td>
                      <td>{u.email}</td>
                      <td>{u.role}</td>
                      <td><span className="agent-empty-badge">Sin agente</span></td>
                      <td></td>
                      <td></td>
                      <td>
                        <div className="tools-actions-cell">
                          <button className="btn-sm-edit" onClick={() => openCreateModal(u.id)} title="Crear agente">+</button>
                        </div>
                      </td>
                    </tr>
                  )
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal modal-lg" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{editingAgent ? `Editar agente — ${editingAgent.name}` : 'Crear agente'}</h3>
              <button className="modal-close" onClick={() => setShowModal(false)}>✕</button>
            </div>
            <div className="modal-body">
              {formError && <div className="auth-error-banner">{formError}</div>}

              <div className="form-group">
                <label>Nombre del agente *</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="Ej: Agente de Proyectos"
                  maxLength={100}
                />
              </div>

              <div className="form-group">
                <label>Alcance</label>
                <select value={form.scope} onChange={(e) => setForm({ ...form, scope: e.target.value })}>
                  {SCOPE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label} — {opt.desc}</option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label>System Prompt * ({form.systemMsg.length}/2000)</label>
                <textarea
                  className="form-textarea"
                  value={form.systemMsg}
                  onChange={(e) => setForm({ ...form, systemMsg: e.target.value })}
                  placeholder="Instruccion del sistema para el agente de IA..."
                  rows={8}
                  maxLength={2000}
                />
              </div>

              <div className="agent-preview">
                <h4 className="agent-preview-title">Vista previa — Datos incluidos en el prompt</h4>
                <div className="agent-preview-items">
                  {previewItems.map((item) => (
                    <span key={item} className="agent-preview-chip">{item}</span>
                  ))}
                </div>
              </div>

              {editingAgent && (
                <div className="form-group">
                  <label>Estado</label>
                  <div className="agent-toggle-row">
                    <button
                      type="button"
                      className={`filter-btn ${form.scope ? '' : ''}`}
                      onClick={() => setForm({ ...form })}
                    >
                    </button>
                    <label className="agent-toggle-label">
                      <input
                        type="checkbox"
                        checked={editingAgent.isActive}
                        onChange={async (e) => {
                          try {
                            await updateAgent(editingAgent.id, { isActive: e.target.checked });
                            setEditingAgent({ ...editingAgent, isActive: e.target.checked });
                            loadUsers();
                          } catch {}
                        }}
                      />
                      <span>{editingAgent.isActive ? 'Activo' : 'Inactivo'}</span>
                    </label>
                  </div>
                </div>
              )}
            </div>
            <div className="modal-actions">
              <button className="btn-secondary" onClick={() => setShowModal(false)}>Cancelar</button>
              <button className="auth-btn" onClick={handleSave} disabled={formLoading}>
                {formLoading ? 'Guardando...' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
