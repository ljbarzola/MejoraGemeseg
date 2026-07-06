import { api } from './auth.service';
import type { Task, ProjectMember } from '../types/task';

export async function getTasksByProject(projectId: number): Promise<Task[]> {
  const res = await api.get(`/projects/${projectId}/tasks`);
  return res.data;
}

export async function getTask(id: number): Promise<Task> {
  const res = await api.get(`/tasks/${id}`);
  return res.data;
}

export async function createTask(
  projectId: number,
  data: {
    title: string;
    description?: string;
    priority?: string;
    dueDate?: string;
    estimatedHours?: number;
  },
): Promise<Task> {
  const res = await api.post(`/projects/${projectId}/tasks`, data);
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
    estimatedHours?: number;
    assigneeId?: number | null;
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

export async function getProject(id: number) {
  const res = await api.get(`/projects/${id}`);
  return res.data;
}
