import { api } from './auth.service';
import type { Task, TaskGrouped } from '../types/task';

export async function createTask(
  projectId: number,
  data: { title: string; description?: string; priority?: string; dueDate?: string; estimatedHours?: number },
): Promise<Task> {
  const res = await api.post(`/projects/${projectId}/tasks`, data);
  return res.data;
}

export async function getProjectTasks(
  projectId: number,
): Promise<{ tasks: Task[]; grouped: TaskGrouped }> {
  const res = await api.get(`/projects/${projectId}/tasks`);
  return res.data;
}

export async function getTask(id: number): Promise<Task & { project: any }> {
  const res = await api.get(`/tasks/${id}`);
  return res.data;
}

export async function updateTask(
  id: number,
  data: { status?: string; assigneeId?: number; title?: string; description?: string; priority?: string; dueDate?: string; estimatedHours?: number },
): Promise<Task> {
  const res = await api.patch(`/tasks/${id}`, data);
  return res.data;
}

export async function getProject(id: number) {
  const res = await api.get(`/projects/${id}`);
  return res.data;
}
