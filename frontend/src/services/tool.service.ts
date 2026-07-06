import { api } from './auth.service';
import type { Tool, ToolAssignment, UserWithTools, ToolAuditLog } from '../types/tool';

export async function getTools(): Promise<Tool[]> {
  const res = await api.get('/tools');
  return res.data;
}

export async function createTool(data: { name: string; category?: string }): Promise<Tool> {
  const res = await api.post('/tools', data);
  return res.data;
}

export async function deleteTool(id: number): Promise<void> {
  await api.delete(`/tools/${id}`);
}

export async function getAssignments(toolFilter?: string, userFilter?: string): Promise<ToolAssignment[]> {
  const params: any = {};
  if (toolFilter) params.tool = toolFilter;
  if (userFilter) params.user = userFilter;
  const res = await api.get('/tools/assignments', { params });
  return res.data;
}

export async function getUsersWithTools(): Promise<UserWithTools[]> {
  const res = await api.get('/tools/users');
  return res.data;
}

export async function assignTool(data: {
  toolId: number;
  userId: number;
  version?: string;
  licenseKey?: string;
}): Promise<ToolAssignment> {
  const res = await api.post('/tools/assign', data);
  return res.data;
}

export async function updateAssignment(
  id: number,
  data: { version?: string; licenseKey?: string },
): Promise<ToolAssignment> {
  const res = await api.patch(`/tools/assign/${id}`, data);
  return res.data;
}

export async function deleteAssignment(id: number): Promise<void> {
  await api.delete(`/tools/assign/${id}`);
}

export async function getAuditLog(assignmentId: number): Promise<ToolAuditLog[]> {
  const res = await api.get(`/tools/assign/${assignmentId}/audit`);
  return res.data;
}
