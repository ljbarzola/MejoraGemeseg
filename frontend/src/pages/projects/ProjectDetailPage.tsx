import { useEffect, useState, useRef, type ReactNode } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { getProject, addMember, removeMember, updateMemberRole, updateProject, deleteProject } from '../../services/project.service';
import { getTasksByProject, updateTask } from '../../services/task.service';
import TaskDetailModal from '../../components/tasks/TaskDetailModal';
import CreateTaskModal from '../../components/tasks/CreateTaskModal';
import TaskStatusMenu from '../../components/tasks/TaskStatusMenu';
import { getUsers } from '../../services/user.service';
import { getUser } from '../../services/auth.service';
import type { Task } from '../../types/task';
import type { AdminUser } from '../../services/user.service';
import { STATUS_LABELS, PRIORITY_LABELS, PRIORITY_COLORS, STATUS_COLORS, STATUS_ORDER, PRIORITY_ORDER } from '../../types/task';
import ConfirmDialog from '../../components/common/ConfirmDialog';
import DateInput from '../../components/common/DateInput';
import ColumnPickerMenu from '../../components/common/ColumnPickerMenu';
import { useResizableColumns } from '../../hooks/useResizableColumns';
import { useColumnPreferences } from '../../hooks/useColumnPreferences';
import { useSortableTable } from '../../hooks/useSortableTable';
import { useToast } from '../../contexts/ToastContext';
import { Trash2 } from 'lucide-react';

// Columnas elegibles de la tabla de tareas (además de «#» y «Título», que van siempre).
const COLUMNAS_TAREAS = [
  { key: 'status', label: 'Estado' },
  { key: 'priority', label: 'Prioridad' },
  { key: 'assignee', label: 'Asignado' },
  { key: 'startDate', label: 'Fecha inicio' },
  { key: 'endDate', label: 'Fecha fin' },
];
const COLUMNAS_TAREAS_POR_DEFECTO = ['status', 'priority', 'assignee', 'startDate', 'endDate'];

const PROJECT_STATUS_COLORS: Record<string, string> = {
  ACTIVE: '#22c55e',
  ON_HOLD: '#f59e0b',
  COMPLETED: '#3b82f6',
  CANCELLED: '#ef4444',
};

const PROJECT_STATUS_LABELS: Record<string, string> = {
  ACTIVE: 'Activo',
  ON_HOLD: 'En pausa',
  COMPLETED: 'Completado',
  CANCELLED: 'Cancelado',
};

const MEMBER_ROLE_LABELS: Record<string, string> = {
  OWNER: 'Propietario',
  MEMBER: 'Miembro',
  VIEWER: 'Observador',
};

const MEMBER_ROLE_OPTIONS = ['OWNER', 'MEMBER', 'VIEWER'];

export default function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [project, setProject] = useState<any>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [allUsers, setAllUsers] = useState<AdminUser[]>([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
  const [selectedRole, setSelectedRole] = useState('MEMBER');
  const [addLoading, setAddLoading] = useState(false);
  const [addError, setAddError] = useState('');
  const [showEditModal, setShowEditModal] = useState(false);
  const [editForm, setEditForm] = useState({ name: '', description: '', startDate: '', endDate: '', status: 'ACTIVE' });
  const [editLoading, setEditLoading] = useState(false);
  const [editError, setEditError] = useState('');
  const [openRoleMenu, setOpenRoleMenu] = useState<number | null>(null);
  const [confirmandoEliminarMiembro, setConfirmandoEliminarMiembro] = useState<number | null>(null);
  const [confirmandoEliminarProyecto, setConfirmandoEliminarProyecto] = useState(false);
  const [actionError, setActionError] = useState('');
  const actionErrorRef = useRef<HTMLDivElement>(null);
  const currentUser = getUser();
  // La tarea abierta vive en la URL (?tarea=ID): así un enlace de notificación o de correo
  // (/tasks/ID → aquí) abre la ventana de esa tarea, y «atrás» la cierra.
  const [searchParams, setSearchParams] = useSearchParams();
  const tareaAbierta = searchParams.get('tarea') ? Number(searchParams.get('tarea')) : null;
  const [creandoTarea, setCreandoTarea] = useState(false);
  const abrirTarea = (taskId: number | null) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (taskId === null) next.delete('tarea');
      else next.set('tarea', String(taskId));
      return next;
    }, { replace: true });
  };

  // Mueve la tarea de estado desde la lista, sin abrirla. Se pinta al instante; si falla, se revierte.
  async function cambiarEstado(task: Task, nuevo: string) {
    const anterior = task.status;
    setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, status: nuevo as Task['status'] } : t)));
    try {
      await updateTask(task.id, { status: nuevo });
    } catch {
      setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, status: anterior } : t)));
      showToast('No se pudo cambiar el estado de la tarea. Inténtalo de nuevo.', 'error');
    }
  }

  // Estas tres acciones (quitar miembro, cambiar rol, eliminar proyecto)
  // pueden dispararse desde distintas partes de la página (lista de
  // miembros o encabezado); un solo banner arriba del detalle evita que el
  // error quede fuera de vista si la acción se hizo más abajo en la página.
  useEffect(() => {
    if (actionError) {
      actionErrorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [actionError]);

  const userMembership = project?.members?.find(
    (m: any) => m.user.email === currentUser?.email,
  );
  const isViewer = userMembership?.role === 'VIEWER';
  const isOwner = userMembership?.role === 'OWNER' || currentUser?.role === 'ADMIN';
  const canEditStatus = isOwner || userMembership?.role === 'MEMBER';

  // Tabla de tareas: orden por columna, ancho ajustable y columnas elegibles.
  // Van aquí arriba porque los hooks no pueden quedar detrás de los `return`
  // tempranos de más abajo.
  const { showToast } = useToast();
  const columnPrefs = useColumnPreferences('proyecto-tareas', COLUMNAS_TAREAS_POR_DEFECTO, { columnasBase: 2 });
  const columnasVisibles = columnPrefs.visible.filter((k) => COLUMNAS_TAREAS.some((c) => c.key === k));
  const tablaRef = useResizableColumns('proyecto-tareas', ['id', 'title', ...columnasVisibles]);
  const { filas: tareasOrdenadas, thProps, SortIcon } = useSortableTable(
    tasks,
    {
      id: (t) => t.id,
      title: (t) => t.title,
      status: (t) => STATUS_ORDER[t.status] ?? 99,
      priority: (t) => PRIORITY_ORDER[t.priority] ?? 99,
      assignee: (t) => t.assignees.map((a) => a.user.fullName).sort((a, b) => a.localeCompare(b, 'es'))[0],
      startDate: (t) => (t.startDate ? new Date(t.startDate).getTime() : null),
      endDate: (t) => (t.endDate ? new Date(t.endDate).getTime() : null),
    },
    'id',
    'desc',
  );

  const loadData = () => {
    if (!id) return;
    Promise.all([
      getProject(Number(id)),
      getTasksByProject(Number(id)),
    ])
      .then(([p, t]) => {
        setProject(p);
        setTasks(t);
      })
      .catch(() => navigate('/projects'))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadData();
  }, [id, navigate]);

  useEffect(() => {
    if (showAddModal && allUsers.length === 0) {
      getUsers().then(setAllUsers).catch(() => {});
    }
  }, [showAddModal]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      const target = e.target as HTMLElement;
      if (target.closest?.('.role-dropdown-container')) return;
      setOpenRoleMenu(null);
    }
    if (openRoleMenu !== null) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [openRoleMenu]);

  const currentMemberIds = project?.members?.map((m: any) => m.user.id) || [];
  const availableUsers = allUsers.filter(
    (u) => !currentMemberIds.includes(u.id) && u.isActive !== false,
  );

  async function handleAddMember() {
    if (!selectedUserId || !id) return;
    setAddLoading(true);
    setAddError('');
    try {
      await addMember(Number(id), selectedUserId, selectedRole);
      const p = await getProject(Number(id));
      setProject(p);
      setShowAddModal(false);
      setSelectedUserId(null);
      setSelectedRole('MEMBER');
    } catch (err: any) {
      setAddError(err.response?.data?.message || 'Error al agregar miembro');
    } finally {
      setAddLoading(false);
    }
  }

  function handleRemoveMember(targetUserId: number) {
    if (!id) return;
    setActionError('');
    setConfirmandoEliminarMiembro(targetUserId);
  }

  async function confirmarEliminarMiembro() {
    if (!id || confirmandoEliminarMiembro === null) return;
    const targetUserId = confirmandoEliminarMiembro;
    setConfirmandoEliminarMiembro(null);
    try {
      await removeMember(Number(id), targetUserId);
      const p = await getProject(Number(id));
      setProject(p);
    } catch (err: any) {
      setActionError(err.response?.data?.message || 'Error al eliminar miembro');
    }
  }

  async function handleChangeRole(targetUserId: number, newRole: string) {
    if (!id) return;
    try {
      await updateMemberRole(Number(id), targetUserId, newRole);
      const p = await getProject(Number(id));
      setProject(p);
    } catch (err: any) {
      setActionError(err.response?.data?.message || 'Error al cambiar rol');
    }
  }

  function openEditModal() {
    setEditForm({
      name: project.name || '',
      description: project.description || '',
      startDate: project.startDate ? project.startDate.split('T')[0] : '',
      endDate: project.endDate ? project.endDate.split('T')[0] : '',
      status: project.status || 'ACTIVE',
    });
    setEditError('');
    setShowEditModal(true);
  }

  async function handleUpdateProject() {
    if (!id || !editForm.name.trim()) return;
    setEditLoading(true);
    setEditError('');
    try {
      await updateProject(Number(id), {
        name: editForm.name.trim(),
        description: editForm.description.trim() || undefined,
        startDate: editForm.startDate || null,
        endDate: editForm.endDate || null,
        status: editForm.status,
      });
      const p = await getProject(Number(id));
      setProject(p);
      setShowEditModal(false);
    } catch (err: any) {
      setEditError(err.response?.data?.message || 'Error al actualizar proyecto');
    } finally {
      setEditLoading(false);
    }
  }

  function handleDeleteProject() {
    if (!id) return;
    setActionError('');
    setConfirmandoEliminarProyecto(true);
  }

  async function confirmarEliminarProyecto() {
    if (!id) return;
    setConfirmandoEliminarProyecto(false);
    try {
      await deleteProject(Number(id));
      navigate('/projects');
    } catch (err: any) {
      setActionError(err.response?.data?.message || 'Error al eliminar proyecto');
    }
  }

  const celdaTarea = (key: string, task: Task): ReactNode => {
    switch (key) {
      case 'status':
        return task.status === 'CANCELLED' || isViewer ? (
          <span
            className="status-badge"
            style={{
              backgroundColor: STATUS_COLORS[task.status] + '20',
              color: STATUS_COLORS[task.status],
            }}
          >
            {STATUS_LABELS[task.status]}
          </span>
        ) : (
          <TaskStatusMenu status={task.status} onChange={(nuevo) => cambiarEstado(task, nuevo)} />
        );
      case 'priority':
        return (
          <span
            className="kanban-priority"
            style={{ backgroundColor: PRIORITY_COLORS[task.priority] }}
          >
            {PRIORITY_LABELS[task.priority]}
          </span>
        );
      case 'assignee':
        return task.assignees.length > 0 ? (
          <div className="tasks-table-assignees">
            {task.assignees.map((a) => (
              <span key={a.user.id} className="tasks-table-assignee-item">
                <span className="kanban-avatar">{a.user.fullName.charAt(0)}</span>
                {a.user.fullName}
              </span>
            ))}
          </div>
        ) : (
          <span className="kanban-unassigned">Sin asignar</span>
        );
      case 'startDate':
        return task.startDate ? new Date(task.startDate).toLocaleDateString('es-EC') : '—';
      case 'endDate':
        return task.endDate ? new Date(task.endDate).toLocaleDateString('es-EC') : '—';
      default:
        return null;
    }
  };

  if (loading) return <div className="loading-state">Cargando proyecto...</div>;
  if (!project) return null;

  const visibleMembers = project.members.filter((m: any) => {
    if (currentUser?.role === 'ADMIN') return true;
    return m.user.email !== 'admin@gemeseg.com';
  });

  return (
    <div className="page-container">
      <button className="btn-back" onClick={() => navigate('/projects')}>
        &larr; Volver a proyectos
      </button>

      <div className="project-detail">
        <div className="project-detail-header">
          <h1>{project.name}</h1>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <span
              className="status-badge status-badge-lg"
              style={{
                backgroundColor: PROJECT_STATUS_COLORS[project.status] + '20',
                color: PROJECT_STATUS_COLORS[project.status],
              }}
            >
              {PROJECT_STATUS_LABELS[project.status]}
            </span>
            {canEditStatus && (
              <button className="btn-secondary" onClick={openEditModal}>
                Editar
              </button>
            )}
            {isOwner && (
              <button className="btn-delete-project" onClick={handleDeleteProject} title="Eliminar proyecto">
                Eliminar proyecto
              </button>
            )}
          </div>
        </div>

        {actionError && (
          <div ref={actionErrorRef} style={{ background: '#fff5f5', border: '1px solid #feb2b2', color: '#c53030', borderRadius: '8px', padding: '10px 14px', marginBottom: '16px', fontSize: '0.85rem' }}>{actionError}</div>
        )}

        {project.description && (
          <p className="project-detail-desc">{project.description}</p>
        )}

        <div className="project-detail-meta">
          <div className="meta-item">
            <span className="meta-label">Creado por</span>
            <span className="meta-value">{project.createdBy.fullName}</span>
          </div>
          <div className="meta-item">
            <span className="meta-label">Fecha de inicio</span>
            <span className="meta-value">
              {project.startDate
                ? new Date(project.startDate).toLocaleDateString('es-EC')
                : 'No definida'}
            </span>
          </div>
          <div className="meta-item">
            <span className="meta-label">Fecha de fin</span>
            <span className="meta-value">
              {project.endDate
                ? new Date(project.endDate).toLocaleDateString('es-EC')
                : 'No definida'}
            </span>
          </div>
          <div className="meta-item">
            <span className="meta-label">Tareas</span>
            <span className="meta-value">{tasks.length}</span>
          </div>
        </div>

        <div className="project-members">
          <div className="tasks-section-header">
            <h2>Miembros ({visibleMembers.length})</h2>
            {isOwner && (
              <button className="auth-btn" onClick={() => setShowAddModal(true)}>
                + Agregar miembro
              </button>
            )}
          </div>
          <div className="members-list">
            {visibleMembers.map((m: any) => {
              const isCurrentUser = m.user.email === currentUser?.email;
              const canManage = isOwner && !isCurrentUser;
              const canChangeRole = currentUser?.role === 'ADMIN' && !isCurrentUser;
              return (
                <div key={m.id} className="member-item">
                  <div className="member-avatar">
                    {m.user.fullName.charAt(0)}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div className="member-name">
                      {m.user.fullName}
                      {isCurrentUser && (
                        <span className="member-you-badge">(Tú)</span>
                      )}
                    </div>
                    <div className="member-role">
                      {canChangeRole ? (
                        <div className="role-dropdown-container">
                          <span
                            className={`role-badge role-dropdown-trigger role-badge-${m.role.toLowerCase()}`}
                            onClick={() => setOpenRoleMenu(openRoleMenu === m.user.id ? null : m.user.id)}
                          >
                            {MEMBER_ROLE_LABELS[m.role]} ▾
                          </span>
                          {openRoleMenu === m.user.id && (
                            <div className="role-dropdown-menu">
                              {MEMBER_ROLE_OPTIONS.map((r) => (
                                <button
                                  key={r}
                                  className={`role-dropdown-option role-dropdown-option-${r.toLowerCase()} ${r === m.role ? 'active' : ''}`}
                                  onClick={() => { handleChangeRole(m.user.id, r); setOpenRoleMenu(null); }}
                                >
                                  {r === m.role && <span className="role-dropdown-check">✓</span>}
                                  {MEMBER_ROLE_LABELS[r]}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      ) : (
                        <span className={`role-badge role-badge-${m.role.toLowerCase()}`}>
                          {MEMBER_ROLE_LABELS[m.role] || m.role}
                        </span>
                      )}
                    </div>
                  </div>
                  {canManage && (
                    <button
                      className="btn-secondary icon-btn"
                      style={{ color: '#c53030' }}
                      onClick={() => handleRemoveMember(m.user.id)}
                      title="Quitar miembro"
                      aria-label="Quitar miembro"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <div className="tasks-section">
          <div className="tasks-section-header">
            <h2>Tareas ({tasks.length})</h2>
            <div className="tasks-section-actions">
              <ColumnPickerMenu
                columns={COLUMNAS_TAREAS}
                visible={columnPrefs.visible}
                pinned={columnPrefs.pinned}
                maxPinned={columnPrefs.maxPinned}
                fixedLabel="Título"
                onApply={async (keys, fijas) => {
                  const guardado = await columnPrefs.set(keys, fijas);
                  if (!guardado) showToast('Se aplicó en este navegador, pero no se pudo guardar en tu cuenta.', 'error');
                }}
              />
              <button
                className="btn-secondary"
                onClick={() => navigate(`/projects/${project.id}/tasks`)}
              >
                Ver tablero Kanban
              </button>
              <button
                className={`auth-btn ${isViewer ? 'btn-disabled' : ''}`}
                onClick={() => {
                  if (!isViewer) setCreandoTarea(true);
                }}
                disabled={isViewer}
                title={isViewer ? 'Los observadores no pueden crear tareas' : ''}
              >
                + Nueva tarea
              </button>
            </div>
          </div>

          {tasks.length === 0 ? (
            <div className="empty-state" style={{ padding: '32px' }}>
              <p>No hay tareas en este proyecto</p>
            </div>
          ) : (
            <div className="tasks-table-wrapper">
              <table className="tasks-table resizable-table" ref={tablaRef} data-fijas={columnPrefs.fijas}>
                <thead>
                  <tr>
                    <th {...thProps('id')} className="sortable-th tasks-table-id">
                      # <SortIcon campo="id" />
                    </th>
                    <th {...thProps('title')}>
                      Título <SortIcon campo="title" />
                    </th>
                    {columnasVisibles.map((k) => {
                      const col = COLUMNAS_TAREAS.find((c) => c.key === k)!;
                      return (
                        <th key={k} {...thProps(k)}>
                          {col.label} <SortIcon campo={k} />
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {tareasOrdenadas.map((task) => (
                    <tr
                      key={task.id}
                      className="tasks-table-row"
                      onClick={() => abrirTarea(task.id)}
                    >
                      <td className="tasks-table-id">{task.id}</td>
                      <td className="tasks-table-title">{task.title}</td>
                      {columnasVisibles.map((k) => (
                        <td
                          key={k}
                          className={
                            k === 'assignee'
                              ? 'tasks-table-assignee'
                              : k === 'startDate' || k === 'endDate'
                                ? 'tasks-table-date'
                                : undefined
                          }
                        >
                          {celdaTarea(k, task)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {tareaAbierta !== null && !Number.isNaN(tareaAbierta) && (
        <TaskDetailModal taskId={tareaAbierta} onClose={() => abrirTarea(null)} onChanged={loadData} />
      )}

      {creandoTarea && (
        <CreateTaskModal projectId={project.id} onClose={() => setCreandoTarea(false)} onCreated={loadData} />
      )}

      {showAddModal && (
        <div className="modal-overlay" onClick={() => setShowAddModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Agregar miembro al proyecto</h3>
              <button className="modal-close" onClick={() => setShowAddModal(false)}>✕</button>
            </div>
            <div className="modal-body">
              {addError && <div className="form-error">{addError}</div>}
              <div className="form-group">
                <label>Usuario</label>
                <select
                  value={selectedUserId || ''}
                  onChange={(e) => setSelectedUserId(Number(e.target.value))}
                >
                  <option value="">Seleccionar usuario...</option>
                  {availableUsers.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.fullName} ({u.email})
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label>Rol en el proyecto</label>
                <select
                  value={selectedRole}
                  onChange={(e) => setSelectedRole(e.target.value)}
                >
                  {MEMBER_ROLE_OPTIONS.map((r) => (
                    <option key={r} value={r}>{MEMBER_ROLE_LABELS[r]}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="modal-actions">
              <button className="btn-secondary" onClick={() => setShowAddModal(false)}>
                Cancelar
              </button>
              <button
                className="auth-btn"
                onClick={handleAddMember}
                disabled={!selectedUserId || addLoading}
              >
                {addLoading ? 'Agregando...' : 'Agregar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showEditModal && (
        <div className="modal-overlay" onClick={() => setShowEditModal(false)}>
          <div className="modal modal-lg" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Editar proyecto</h3>
              <button className="modal-close" onClick={() => setShowEditModal(false)}>✕</button>
            </div>
            <div className="modal-body">
              {editError && <div className="form-error">{editError}</div>}
              <div className="form-group">
                <label>Nombre del proyecto</label>
                <input
                  type="text"
                  value={editForm.name}
                  onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                  placeholder="Ej: Landings Q3"
                />
              </div>
              <div className="form-group">
                <label>Descripción</label>
                <textarea
                  className="form-textarea"
                  value={editForm.description}
                  onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                  rows={3}
                  placeholder="Describe el objetivo del proyecto..."
                />
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Fecha de inicio</label>
                  <DateInput
                    value={editForm.startDate}
                    onChange={(v) => setEditForm({ ...editForm, startDate: v })}
                  />
                </div>
                <div className="form-group">
                  <label>Fecha de fin</label>
                  <DateInput
                    value={editForm.endDate}
                    onChange={(v) => setEditForm({ ...editForm, endDate: v })}
                  />
                </div>
              </div>
              <div className="form-group">
                <label>Estado</label>
                <select
                  value={editForm.status}
                  onChange={(e) => setEditForm({ ...editForm, status: e.target.value })}
                >
                  <option value="ACTIVE">Activo</option>
                  <option value="ON_HOLD">En pausa</option>
                  <option value="COMPLETED">Completado</option>
                  <option value="CANCELLED">Cancelado</option>
                </select>
              </div>
            </div>
            <div className="modal-actions">
              <button className="btn-secondary" onClick={() => setShowEditModal(false)}>
                Cancelar
              </button>
              <button
                className="auth-btn"
                onClick={handleUpdateProject}
                disabled={!editForm.name.trim() || editLoading}
              >
                {editLoading ? 'Guardando...' : 'Guardar cambios'}
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmandoEliminarMiembro !== null && (
        <ConfirmDialog
          title="Eliminar miembro"
          message="¿Estás seguro de eliminar este miembro del proyecto?"
          confirmLabel="Eliminar"
          danger
          onConfirm={confirmarEliminarMiembro}
          onCancel={() => setConfirmandoEliminarMiembro(null)}
        />
      )}

      {confirmandoEliminarProyecto && (
        <ConfirmDialog
          title="Eliminar proyecto"
          message="¿Estás seguro de eliminar este proyecto? Esta acción no se puede deshacer."
          confirmLabel="Eliminar proyecto"
          danger
          onConfirm={confirmarEliminarProyecto}
          onCancel={() => setConfirmandoEliminarProyecto(false)}
        />
      )}
    </div>
  );
}
