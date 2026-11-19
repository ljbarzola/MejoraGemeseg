import { useState, useEffect, useRef } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { X } from 'lucide-react';
import { createTask, getProjectMembers, getAssignableUsers } from '../../services/task.service';
import { getAllProjects, createProject, addMember } from '../../services/project.service';
import { STATUS_LABELS, STATUS_COLORS } from '../../types/task';
import type { ProjectMember } from '../../types/task';
import DateInput from '../common/DateInput';
import ReminderPicker, { RECORDATORIOS_POR_DEFECTO } from './ReminderPicker';
import { errorFechasTarea } from '../../utils/fechasTarea';
import {
  leerBorrador,
  guardarBorrador,
  borrarBorrador,
  marcarFormularioAbierto,
} from '../../utils/borradorTarea';

const taskSchema = z.object({
  title: z.string().min(1, 'El título es requerido'),
  description: z.string().optional(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  estimatedHours: z.coerce.number().min(0),
  status: z.enum(['TODO', 'IN_PROGRESS', 'IN_REVIEW', 'DONE']),
});

type TaskForm = {
  title: string;
  description?: string;
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
  startDate?: string;
  endDate?: string;
  estimatedHours: number;
  status: 'TODO' | 'IN_PROGRESS' | 'IN_REVIEW' | 'DONE';
};

interface Props {
  /** Preselecciona el proyecto y oculta el selector (ej. abierto desde un proyecto ya abierto). */
  projectId?: number;
  onClose: () => void;
  /** Se llama tras crear la tarea, antes de cerrar — para que el padre recargue su lista. */
  onCreated?: () => void;
}

/**
 * Mismo formulario que antes vivía en CreateTaskPage.tsx (página completa),
 * ahora como modal — se abre desde Inicio sin sacar al usuario de su lista de
 * tareas. KanbanPage.tsx y ProjectDetailPage.tsx siguen usando la página
 * completa por ahora (no se tocaron, fuera del pedido original).
 */
export default function CreateTaskModal({ projectId, onClose, onCreated }: Props) {
  // Borrador: solo en el formulario general de Inicio (sin proyecto fijo).
  const [borrador] = useState(() => (projectId ? null : leerBorrador()));
  const [recuperado, setRecuperado] = useState(
    () =>
      !!borrador &&
      !!(
        borrador.form.title?.trim() ||
        borrador.form.description?.trim() ||
        borrador.nuevo.nombre.trim() ||
        borrador.assignees.length > 0 ||
        borrador.proyecto !== 'none'
      ),
  );
  const [serverError, setServerError] = useState('');
  const [loading, setLoading] = useState(false);
  const [members, setMembers] = useState<ProjectMember[]>([]);
  const [selectedAssignees, setSelectedAssignees] = useState<number[]>(borrador?.assignees ?? []);
  const [reminderDays, setReminderDays] = useState<number[]>(borrador?.reminderDays ?? RECORDATORIOS_POR_DEFECTO);
  const [hoursFocused, setHoursFocused] = useState(false);
  const [projects, setProjects] = useState<{ id: number; name: string }[]>([]);
  // 'none' = «Sin proyecto» (tarea puntual): es la opción de partida desde Inicio.
  const [selectedProjectId, setSelectedProjectId] = useState<string>(projectId ? String(projectId) : borrador?.proyecto ?? 'none');
  const errorRef = useRef<HTMLDivElement>(null);

  // Datos del proyecto nuevo (opción «Crear proyecto nuevo» del selector): solo el nombre es obligatorio.
  const [nuevoNombre, setNuevoNombre] = useState(borrador?.nuevo.nombre ?? '');
  const [nuevoDescripcion, setNuevoDescripcion] = useState(borrador?.nuevo.descripcion ?? '');
  const [nuevoInicio, setNuevoInicio] = useState(borrador?.nuevo.inicio ?? '');
  const [nuevoFin, setNuevoFin] = useState(borrador?.nuevo.fin ?? '');
  const [nuevoError, setNuevoError] = useState('');

  const effectiveProjectId = projectId ? String(projectId) : selectedProjectId;
  const sinProyecto = effectiveProjectId === 'none';
  const proyectoNuevo = effectiveProjectId === 'new';

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { errors },
  } = useForm<TaskForm>({
    resolver: zodResolver(taskSchema) as any,
    defaultValues: (borrador?.form as TaskForm | undefined) ?? { priority: 'MEDIUM', estimatedHours: 0, status: 'TODO' },
  });

  useEffect(() => {
    if (!projectId) {
      getAllProjects()
        .then((lista) => {
          setProjects(lista);
          // Si el proyecto del borrador ya no existe (o la persona salió de él), se vuelve a «Sin proyecto».
          setSelectedProjectId((actual) =>
            actual !== 'none' && actual !== 'new' && !lista.some((p) => String(p.id) === actual) ? 'none' : actual,
          );
        })
        .catch(() => {});
    }
  }, [projectId]);

  // Mientras el formulario está abierto se marca, para que Inicio lo reabra si la persona sale y vuelve.
  useEffect(() => {
    if (!projectId) marcarFormularioAbierto(true);
  }, [projectId]);

  // Se guarda el borrador a cada cambio (barato: sessionStorage).
  const valoresForm = watch();
  const firmaBorrador = JSON.stringify([
    valoresForm, reminderDays, selectedAssignees, selectedProjectId, nuevoNombre, nuevoDescripcion, nuevoInicio, nuevoFin,
  ]);
  useEffect(() => {
    if (projectId) return;
    guardarBorrador({
      form: valoresForm as any,
      reminderDays,
      assignees: selectedAssignees,
      proyecto: selectedProjectId,
      nuevo: { nombre: nuevoNombre, descripcion: nuevoDescripcion, inicio: nuevoInicio, fin: nuevoFin },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firmaBorrador]);

  // ✕ o clic fuera: se cierra pero el borrador se conserva. «Cancelar»: se descarta.
  const cerrar = () => {
    marcarFormularioAbierto(false);
    onClose();
  };
  const cancelar = () => {
    borrarBorrador();
    cerrar();
  };
  const descartarBorrador = () => {
    borrarBorrador();
    reset({ priority: 'MEDIUM', estimatedHours: 0, status: 'TODO', title: '', description: '', startDate: '', endDate: '' });
    setSelectedAssignees([]);
    setReminderDays(RECORDATORIOS_POR_DEFECTO);
    setSelectedProjectId(projectId ? String(projectId) : 'none');
    setNuevoNombre('');
    setNuevoDescripcion('');
    setNuevoInicio('');
    setNuevoFin('');
    setNuevoError('');
    setRecuperado(false);
  };

  // Cada proyecto tiene su equipo; sin proyecto se puede asignar a cualquier persona activa de la empresa.
  const proyectoAnterior = useRef(effectiveProjectId);
  useEffect(() => {
    setMembers([]);
    // Al cambiar de proyecto cambia el equipo: se limpia la selección (no al abrir con un borrador).
    if (proyectoAnterior.current !== effectiveProjectId) setSelectedAssignees([]);
    proyectoAnterior.current = effectiveProjectId;
    // Sin proyecto o con proyecto nuevo aún no hay equipo: se puede elegir a cualquier persona activa
    // de la empresa (en el proyecto nuevo, quien se asigne pasa a ser miembro al crearlo).
    const carga = sinProyecto || proyectoNuevo ? getAssignableUsers() : getProjectMembers(Number(effectiveProjectId));
    carga.then(setMembers).catch(() => {});
  }, [effectiveProjectId, sinProyecto, proyectoNuevo]);

  // Un error pintado arriba pasa desapercibido si la persona ya bajó hasta los botones.
  useEffect(() => {
    if (serverError) errorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [serverError]);

  // Al dejar la opción «Crear proyecto nuevo» lo escrito se descarta.
  const elegirProyecto = (valor: string) => {
    setSelectedProjectId(valor);
    if (valor !== 'new') {
      setNuevoNombre('');
      setNuevoDescripcion('');
      setNuevoInicio('');
      setNuevoFin('');
      setNuevoError('');
    }
  };

  const toggleAssignee = (userId: number) => {
    setSelectedAssignees((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId],
    );
  };

  const onSubmit = async (data: TaskForm) => {
    setServerError('');
    const errorFechas = errorFechasTarea(data.startDate, data.endDate);
    if (errorFechas) {
      setServerError(errorFechas);
      return;
    }
    if (proyectoNuevo) {
      if (!nuevoNombre.trim()) {
        setNuevoError('Escribe el nombre del proyecto nuevo');
        setServerError('Escribe el nombre del proyecto nuevo.');
        return;
      }
      if (nuevoInicio && nuevoFin && nuevoFin < nuevoInicio) {
        setNuevoError('El fin del proyecto no puede ser anterior a su inicio');
        setServerError('El fin del proyecto no puede ser anterior a su inicio.');
        return;
      }
    }
    setNuevoError('');
    setLoading(true);
    let proyectoCreadoId: number | null = null;
    try {
      let destino: number | null = sinProyecto ? null : Number(effectiveProjectId);
      if (proyectoNuevo) {
        // El proyecto se crea junto con la tarea: un solo botón, sin pasos intermedios.
        const datosProyecto: any = { name: nuevoNombre.trim() };
        if (nuevoDescripcion.trim()) datosProyecto.description = nuevoDescripcion.trim();
        if (nuevoInicio) datosProyecto.startDate = nuevoInicio;
        if (nuevoFin) datosProyecto.endDate = nuevoFin;
        const creado = await createProject(datosProyecto);
        proyectoCreadoId = creado.id;
        destino = creado.id;
        // Quien recibe la tarea tiene que ser parte del proyecto para verla.
        await Promise.all(
          selectedAssignees.map((uid) => addMember(creado.id, uid, 'MEMBER').catch(() => null)),
        );
      }
      const payload: any = { ...data, assigneeIds: selectedAssignees };
      if (!payload.startDate) delete payload.startDate;
      if (!payload.endDate) delete payload.endDate;
      else payload.reminderDays = reminderDays;
      await createTask(destino, payload);
      borrarBorrador();
      marcarFormularioAbierto(false);
      onCreated?.();
      onClose();
    } catch (err: any) {
      const msg =
        err.response?.data?.message ||
        (err.response
          ? 'No se pudo crear la tarea. Inténtalo de nuevo.'
          : 'No se pudo conectar con el servidor. Espera unos segundos e inténtalo de nuevo; lo que escribiste no se pierde.');
      setServerError(Array.isArray(msg) ? msg[0] : msg);
      if (proyectoCreadoId !== null) {
        // El proyecto ya existe: se deja seleccionado para no duplicarlo al reintentar.
        const id = proyectoCreadoId;
        setProjects((prev) => [...prev, { id, name: nuevoNombre.trim() }]);
        elegirProyecto(String(id));
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={cerrar}>
      <div className="modal modal-ventas-lg" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <h3 style={{ margin: 0 }}>Tarea nueva</h3>
            {recuperado && (
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  fontSize: 12,
                  padding: '2px 4px 2px 10px',
                  borderRadius: 999,
                  background: '#eef5ff',
                  color: 'var(--azul-claro)',
                }}
              >
                Borrador recuperado
                <button
                  type="button"
                  onClick={descartarBorrador}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', fontSize: 12, fontWeight: 700, textDecoration: 'underline', padding: '2px 6px' }}
                >
                  Descartar
                </button>
              </span>
            )}
          </div>
          <button className="modal-close" onClick={cerrar}>
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="auth-form">
          <div className="modal-body">
            {serverError && (
              <div className="auth-error-banner" ref={errorRef}>{serverError}</div>
            )}

            {!projectId && (
              <div className="form-group">
                <label htmlFor="project">Proyecto</label>
                <select
                  id="project"
                  value={selectedProjectId}
                  onChange={(e) => elegirProyecto(e.target.value)}
                >
                  <option value="none">Sin proyecto (tarea puntual)</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                  <option value="new">+ Crear proyecto nuevo…</option>
                </select>
                {proyectoNuevo && (
                  <div
                    style={{
                      marginTop: 10,
                      padding: 14,
                      border: '2px solid var(--azul-claro)',
                      borderRadius: 12,
                      background: '#f8fafc',
                    }}
                  >
                    <div style={{ fontWeight: 700 }}>Datos del proyecto nuevo</div>
                    <div style={{ fontSize: 13, opacity: 0.75, marginBottom: 10 }}>
                      Se crea junto con la tarea. Si cambias de opinión, elige otro proyecto arriba y esto se descarta.
                    </div>
                    <div className="form-row">
                      <div className="form-group">
                        <label htmlFor="nuevoProyectoNombre">Nombre del proyecto nuevo *</label>
                        <input
                          id="nuevoProyectoNombre"
                          type="text"
                          value={nuevoNombre}
                          onChange={(e) => setNuevoNombre(e.target.value)}
                          placeholder="Ej.: Renovación de contratos 2027"
                          autoFocus
                        />
                      </div>
                      <div className="form-group">
                        <label htmlFor="nuevoProyectoDescripcion">Descripción del proyecto</label>
                        <input
                          id="nuevoProyectoDescripcion"
                          type="text"
                          value={nuevoDescripcion}
                          onChange={(e) => setNuevoDescripcion(e.target.value)}
                          placeholder="Opcional"
                        />
                      </div>
                    </div>
                    <div className="form-row">
                      <div className="form-group">
                        <label htmlFor="nuevoProyectoInicio">Inicio del proyecto (opcional)</label>
                        <DateInput id="nuevoProyectoInicio" value={nuevoInicio} onChange={setNuevoInicio} />
                      </div>
                      <div className="form-group">
                        <label htmlFor="nuevoProyectoFin">Fin del proyecto (opcional)</label>
                        <DateInput id="nuevoProyectoFin" value={nuevoFin} onChange={setNuevoFin} />
                      </div>
                    </div>
                    {nuevoError && <span className="field-error">{nuevoError}</span>}
                  </div>
                )}
              </div>
            )}

            <div className="form-group">
              <label htmlFor="title">Título *</label>
              <input
                id="title"
                type="text"
                placeholder="Nombre de la tarea"
                {...register('title')}
                className={errors.title ? 'input-error' : ''}
                autoFocus
              />
              {errors.title && (
                <span className="field-error">{errors.title.message}</span>
              )}
            </div>

            <div className="form-group">
              <label htmlFor="description">Descripción</label>
              <textarea
                id="description"
                placeholder="Detalles de la tarea (opcional)"
                {...register('description')}
                className="form-textarea"
                rows={3}
              />
            </div>

            <div className="form-row">
              <div className="form-group">
                <label htmlFor="priority">Prioridad</label>
                <select id="priority" {...register('priority')}>
                  <option value="LOW">Baja</option>
                  <option value="MEDIUM">Media</option>
                  <option value="HIGH">Alta</option>
                  <option value="URGENT">Urgente</option>
                </select>
              </div>

              <div className="form-group">
                <label htmlFor="estimatedHours">Horas estimadas</label>
                <input
                  id="estimatedHours"
                  type="number"
                  min="0"
                  step="0.5"
                  value={hoursFocused && watch('estimatedHours') === 0 ? '' : watch('estimatedHours')}
                  onFocus={() => setHoursFocused(true)}
                  onBlur={() => setHoursFocused(false)}
                  onChange={(e) => {
                    const val = e.target.value === '' ? 0 : Number(e.target.value);
                    setValue('estimatedHours', val);
                  }}
                />
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label htmlFor="startDate">Fecha inicio</label>
                <DateInput id="startDate" value={watch('startDate') || ''} onChange={(v) => setValue('startDate', v)} />
              </div>

              <div className="form-group">
                <label htmlFor="endDate">Fecha fin</label>
                <DateInput id="endDate" value={watch('endDate') || ''} onChange={(v) => setValue('endDate', v)} />
                {errorFechasTarea(watch('startDate'), watch('endDate')) && (
                  <span className="field-error">{errorFechasTarea(watch('startDate'), watch('endDate'))}</span>
                )}
              </div>
            </div>

            <ReminderPicker value={reminderDays} onChange={setReminderDays} hasDate={!!watch('endDate')} mismaPestana={!projectId} />

            <div className="form-group">
              <label>Asignar a</label>
              <div className="assignee-chips">
                {members.length === 0 ? (
                  <span className="assignee-empty">
                    {sinProyecto ? 'No hay personas disponibles' : 'No hay miembros en el proyecto'}
                  </span>
                ) : (
                  members.map((m) => (
                    <button
                      key={m.user.id}
                      type="button"
                      className={`assignee-chip ${selectedAssignees.includes(m.user.id) ? 'assignee-chip-active' : ''}`}
                      onClick={() => toggleAssignee(m.user.id)}
                    >
                      <span className="assignee-chip-avatar">{m.user.fullName.charAt(0)}</span>
                      {m.user.fullName}
                    </button>
                  ))
                )}
              </div>
            </div>

            <div className="form-group">
              <label>Estado</label>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                {(['TODO', 'IN_PROGRESS', 'IN_REVIEW', 'DONE'] as const).map((s) => (
                  <button
                    key={s}
                    type="button"
                    className="filter-btn"
                    style={{
                      borderColor: STATUS_COLORS[s],
                      color: watch('status') === s ? 'white' : STATUS_COLORS[s],
                      backgroundColor: watch('status') === s ? STATUS_COLORS[s] : 'white',
                      cursor: 'pointer',
                    }}
                    onClick={() => setValue('status', s)}
                  >
                    {STATUS_LABELS[s]}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="modal-actions">
            <button type="button" className="btn-secondary" onClick={cancelar}>
              Cancelar
            </button>
            <button type="submit" className="auth-btn" disabled={loading}>
              {loading ? 'Creando...' : proyectoNuevo ? 'Crear proyecto y tarea' : 'Crear tarea'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
