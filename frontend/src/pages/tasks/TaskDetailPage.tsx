import { useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getTask } from '../../services/task.service';

/**
 * Las tareas ya no tienen página propia: se abren como ventana (TaskDetailModal) encima del proyecto.
 * Esta ruta se queda porque hay enlaces guardados que apuntan a /tasks/:id (notificaciones, correos de
 * recordatorio): busca el proyecto de la tarea y manda a «su proyecto» con la tarea ya abierta.
 */
export default function TaskDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  useEffect(() => {
    if (!id) return;
    getTask(Number(id))
      .then((t) => navigate(`/projects/${t.projectId}?tarea=${t.id}`, { replace: true }))
      .catch(() => navigate('/projects', { replace: true }));
  }, [id, navigate]);

  return <div className="loading-state">Abriendo tarea...</div>;
}
