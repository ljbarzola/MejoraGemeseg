import { useState, useEffect } from 'react';
import { Activity, BookOpen, FileText, MessagesSquare, Trash2, Pencil, Bot } from 'lucide-react';
import PageHeader from '../../components/common/PageHeader';
import PageTabs from '../../components/common/PageTabs';
import {
  getAgentCatalog,
  createAgent,
  updateAgent,
  deleteAgent,
  getAgentDocs,
} from '../../services/agent.service';
import { getUser } from '../../services/auth.service';
import type { Agent, DocumentacionAgente } from '../../types/agent';
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
  // para quien no tenga la sección Ventas.
  { value: 'VENTAS', label: 'Ventas', desc: 'Investiga clientes y cartera de Ventas; lo ve quien tenga Ventas' },
  // Agente de Cacao (2026-11-11): lo siembra el sistema y lo ve quien tenga acceso a Cacao.
  { value: 'CACAO', label: 'Cacao', desc: 'Explica el flujo de Cacao y consulta datos reales de la empresa; lo ve quien tenga acceso a Cacao' },
  // Agente especializado (2026-11-16, reemplaza a GEME-BOT): solo consulta viajes de custodia, sin dinero. Desde
  // 2026-11-18 lo ve cualquiera con Operaciones (Custodias dejó de ser una sección; el valor interno sigue igual).
  { value: 'CUSTODIAS', label: 'Operaciones (viajes)', desc: 'Consulta viajes de custodia, personal y placas (sin dinero); lo ve quien tenga Operaciones' },
  // Agente especializado (2026-11-19): solo LEE cómo está Operaciones (puestos, faltas, bitácoras, inventario,
  // contratos), sin dinero, y lo ve cualquiera que tenga la sección Operaciones (no hace falta asignarlo).
  { value: 'OPERACIONES', label: 'Operaciones (puestos y pendientes)', desc: 'Consulta puestos, faltas, bitácoras, inventario y contratos (solo lectura); lo ve quien tenga Operaciones' },
  // Agente que trabaja solo (2026-10-18): lo siembra el sistema, no conversa ni se asigna.
  { value: 'BITACORAS', label: 'Revisor de bitácoras', desc: 'Lee las fotos de las bitácoras de Contratación Pública; no conversa' },
  { value: 'ENTREGAS', label: 'Revisor de entregas', desc: 'Mira los documentos que otras áreas entregan a Contratación Pública; no conversa' },
];

/** Los agentes que trabajan solos no se crean a mano, no se asignan y no cambian de alcance. */
const ES_TRABAJADOR = (scope: string) => scope === 'BITACORAS' || scope === 'ENTREGAS';

const SCOPE_PREVIEW: Record<string, string[]> = {
  GLOBAL: ['Proyectos activos', 'Tareas asignadas', 'Rol del usuario', 'Informacion del perfil'],
  PROJECTS: ['Proyectos activos', 'Estados de proyectos', 'Miembros por proyecto', 'Estadisticas'],
  TASKS: ['Tareas asignadas', 'Estados Kanban', 'Prioridades', 'Fechas de entrega'],
  ADMIN: ['Todos los usuarios', 'Estadisticas globales', 'Roles y permisos', 'Metricas del sistema'],
  VENTAS: ['Expediente de un cliente', 'Cartera y contratos', 'Motivos de pérdida', 'Embudo de ventas'],
  CACAO: ['Cuentas por pagar y vencidas', 'Liquidaciones por aprobar', 'Anticipos y saldos de proveedores', 'Precios e inventario'],
  CUSTODIAS: ['Viajes por estado y tipo', 'Viajes de un guardia', 'Antigüedad de un custodio', 'Placas más usadas en puerto'],
  OPERACIONES: ['Quién está hoy en cada puesto', 'Faltas sin cubrir y bitácoras sin subir', 'Armas por vencer e inventario bajo el mínimo', 'Contratos por vencer'],
  BITACORAS: ['Foto de la hoja', 'Guardias y sus horas', 'Novedades por tipo', 'Nada del horario ni de los guardias'],
};

/** Quién ve el agente en el chat: sale del módulo, ya no se asigna persona por persona. */
function quienLoVe(agent: Agent): string {
  const modulo: Record<string, string> = { VENTAS: 'Ventas', CACAO: 'Cacao', CUSTODIAS: 'Operaciones', OPERACIONES: 'Operaciones' };
  if (modulo[agent.scope]) return `todas las personas con acceso al módulo ${modulo[agent.scope]}`;
  if (agent.createdBy !== null) return 'quien lo creó y a quien se le asignó antes';
  return 'todas las personas de la empresa';
}

export default function AgentsPage() {
  const [catalog, setCatalog] = useState<(Agent & { _count: { userLinks: number } })[]>([]);
  const [loading, setLoading] = useState(true);
  const [pestana, setPestana] = useState<'agentes' | 'preguntas' | 'actividad'>('agentes');

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingAgent, setEditingAgent] = useState<Agent | null>(null);

  const [createForm, setCreateForm] = useState({ name: '', systemMsg: '', scope: 'GLOBAL' });
  const [editForm, setEditForm] = useState({ name: '', systemMsg: '', scope: 'GLOBAL' });
  const [formError, setFormError] = useState('');
  const [formLoading, setFormLoading] = useState(false);
  const [confirmandoEliminarAgente, setConfirmandoEliminarAgente] = useState<number | null>(null);
  const [docs, setDocs] = useState<DocumentacionAgente[]>([]);
  const [verDoc, setVerDoc] = useState<DocumentacionAgente | null>(null);
  const [verActividad, setVerActividad] = useState<Agent | null>(null);
  const [verPreguntas, setVerPreguntas] = useState<Agent | null>(null);
  const [verPromptDe, setVerPromptDe] = useState<number | null>(null);

  const loadData = () => {
    setLoading(true);
    getAgentCatalog()
      .then(setCatalog)
      .catch(() => setCatalog([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => { loadData(); }, []);
  useEffect(() => { getAgentDocs().then(setDocs).catch(() => setDocs([])); }, []);

  function openCreateModal() {
    setCreateForm({ name: '', systemMsg: '', scope: 'GLOBAL' });
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
    const yo = getUser();
    if (!yo) { setFormError('Tu sesión expiró, vuelve a entrar.'); return; }
    setFormLoading(true); setFormError('');
    try {
      await createAgent({
        userId: yo.id,
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

  const previewItems = SCOPE_PREVIEW[editForm.scope] || SCOPE_PREVIEW.GLOBAL;

  return (
    <div className="page-container">
      <PageHeader
        eyebrow="Sistemas"
        title="Agentes de IA"
        description="Qué agentes hay, quién los ve (quien tiene el módulo ve sus agentes), qué se les ha preguntado, su prompt real y qué han hecho los que trabajan solos."
        actions={
          <button className="auth-btn" onClick={openCreateModal}>+ Nuevo agente</button>
        }
      />

      <PageTabs
        label="Secciones de Agentes de IA"
        value={pestana}
        onChange={setPestana}
        tabs={[
          { key: 'agentes', label: `Agentes (${catalog.length})`, icon: Bot },
          { key: 'preguntas', label: 'Historial de preguntas', icon: MessagesSquare },
          { key: 'actividad', label: 'Actividad automática', icon: Activity, title: 'Lo que han hecho los agentes que trabajan solos' },
        ]}
      />

      <div className="admin-section">
        {loading ? (
          <div className="loading-state">Cargando agentes...</div>
        ) : pestana === 'preguntas' ? (
          <HistorialPreguntasAgentes />
        ) : pestana === 'actividad' ? (
          <ActividadAgentes />
        ) : catalog.length === 0 ? (
          <div className="empty-state">No hay agentes creados</div>
        ) : (
          <div className="agentes-grid">
            {catalog.map((agent) => {
              const opcion = SCOPE_OPTIONS.find((o) => o.value === agent.scope);
              const trabajador = ES_TRABAJADOR(agent.scope);
              const doc = docs.find((d) => d.scope === agent.scope) ?? null;
              return (
                <div key={agent.id} className={`agente-card ${agent.isActive ? '' : 'inactivo'}`}>
                  <div className="agente-card-top">
                    <div className="agente-card-icono">🤖</div>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div className="agente-card-nombre">{agent.name}</div>
                      <div className="agente-card-chips">
                        <span className="agent-scope-badge">{opcion?.label ?? agent.scope}</span>
                        <span className={`agente-estado ${agent.isActive ? 'on' : 'off'}`}>{agent.isActive ? 'Activo' : 'Inactivo'}</span>
                      </div>
                    </div>
                  </div>
                  <p className="agente-card-desc">{opcion?.desc ?? 'Agente creado a mano.'}</p>
                  <p className="agente-card-quien">
                    <strong>Quién lo ve: </strong>
                    {trabajador ? 'nadie lo usa en el chat: trabaja solo' : quienLoVe(agent)}
                  </p>
                  <div className="agente-card-ver">
                    {!trabajador
                      ? <button className="btn-secondary" onClick={() => setVerPreguntas(agent)} title="Qué le han preguntado"><MessagesSquare size={14} /> Preguntas</button>
                      : <span />}
                    {doc
                      ? <button className="btn-secondary" onClick={() => setVerDoc(doc)} title="Qué hace este agente"><BookOpen size={14} /> Qué hace</button>
                      : <span />}
                    {doc
                      ? <button className="btn-secondary" onClick={() => setVerActividad(agent)} title="Qué ha hecho este agente"><Activity size={14} /> Actividad</button>
                      : <span />}
                  </div>
                  <div className="agente-card-gestion">
                    <button type="button" className="agente-icono" onClick={() => setVerPromptDe(agent.id)} title="Ver el prompt real" aria-label="Ver el prompt real"><FileText size={16} /></button>
                    <button type="button" className="agente-icono" onClick={() => openEditModal(agent)} title="Editar" aria-label="Editar"><Pencil size={16} /></button>
                    {!trabajador && (
                      <button type="button" className="agente-icono peligro" onClick={() => handleDeleteAgent(agent.id)} title="Eliminar agente" aria-label="Eliminar agente"><Trash2 size={16} /></button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
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

    </div>
  );
}
