import { api } from './auth.service';
import type { Task, ProjectMember } from '../types/task';
import { getUsers } from './user.service';

export async function getMyTasks(filters?: {
  status?: string;
  assignedToMe?: boolean;
  /** Un proyecto, o 'none' para las tareas «Sin proyecto». */
  projectId?: number | 'none';
}): Promise<Task[]> {
  const params: Record<string, string> = {};
  if (filters?.status) params.status = filters.status;
  if (filters?.assignedToMe) params.assignedToMe = 'true';
  if (filters?.projectId) params.projectId = String(filters.projectId);
  const res = await api.get('/tasks/my-tasks', { params });
  return res.data;
}

export async function getTasksByProject(projectId: number): Promise<Task[]> {
  const res = await api.get(`/projects/${projectId}/tasks`);
  return res.data;
}

export async function getTask(id: number): Promise<Task> {
  const res = await api.get(`/tasks/${id}`);
  return res.data;
}

/** `projectId` nulo = tarea «Sin proyecto» (tarea puntual). */
export async function createTask(
  projectId: number | null,
  data: {
    title: string;
    description?: string;
    priority?: string;
    dueDate?: string;
    startDate?: string;
    endDate?: string;
    estimatedHours?: number;
    assigneeIds?: number[];
    reminderDays?: number[];
  },
): Promise<Task> {
  const res =
    projectId === null
      ? await api.post('/tasks', data)
      : await api.post(`/projects/${projectId}/tasks`, data);
  return res.data;
}

export async function updateTask(
  id: number,
  data: {
    title?: string;
    description?: string;
    status?: string;
    priority?: string;
    dueDate?: string;
    startDate?: string;
    endDate?: string;
    estimatedHours?: number;
    assigneeIds?: number[];
    reminderDays?: number[];
  },
): Promise<Task> {
  const res = await api.patch(`/tasks/${id}`, data);
  return res.data;
}

export async function deleteTask(id: number): Promise<void> {
  await api.delete(`/tasks/${id}`);
}

export async function getProjectMembers(projectId: number): Promise<ProjectMember[]> {
  const res = await api.get(`/projects/${projectId}/members`);
  return res.data;
}

/** Personas a las que se puede asignar una tarea «Sin proyecto»: las activas de la empresa. */
export async function getAssignableUsers(): Promise<ProjectMember[]> {
  const usuarios = await getUsers({ isActive: 'true' });
  return usuarios.map((u) => ({
    id: u.id,
    role: 'MEMBER',
    user: { id: u.id, fullName: u.fullName, email: u.email },
  }));
}

export async function getProject(id: number) {
  const res = await api.get(`/projects/${id}`);
  return res.data;
}
