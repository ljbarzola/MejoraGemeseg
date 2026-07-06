import { api } from './auth.service';
import type { PaginatedProjects } from '../types/project';

export async function createProject(data: {
  name: string;
  description?: string;
  startDate?: string;
  endDate?: string;
}) {
  const res = await api.post('/projects', data);
  return res.data;
}

export async function getProjects(params?: {
  status?: string;
  page?: number;
}): Promise<PaginatedProjects> {
  const res = await api.get('/projects', { params });
  return res.data;
}

export async function getProject(id: number) {
  const res = await api.get(`/projects/${id}`);
  return res.data;
}

export async function addMember(projectId: number, userId: number, role: string) {
  const res = await api.post(`/projects/${projectId}/members`, { userId, role });
  return res.data;
}

export async function removeMember(projectId: number, userId: number) {
  const res = await api.delete(`/projects/${projectId}/members/${userId}`);
  return res.data;
}

export async function updateMemberRole(projectId: number, userId: number, role: string) {
  const res = await api.patch(`/projects/${projectId}/members/${userId}/role`, { role });
  return res.data;
}

export async function updateProject(id: number, data: {
  name?: string;
  description?: string;
  startDate?: string;
  endDate?: string;
}) {
  const res = await api.patch(`/projects/${id}`, data);
  return res.data;
}

export async function deleteProject(id: number) {
  const res = await api.delete(`/projects/${id}`);
  return res.data;
}
