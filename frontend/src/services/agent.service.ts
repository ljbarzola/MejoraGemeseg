import { api } from './auth.service';
import type { Agent, UserWithAgent } from '../types/agent';

export async function getAgents(): Promise<UserWithAgent[]> {
  const res = await api.get('/admin/agents');
  return res.data;
}

export async function getAgentByUser(userId: number): Promise<Agent | null> {
  const res = await api.get(`/admin/agents/user/${userId}`);
  return res.data;
}

export async function createAgent(data: {
  userId: number;
  name: string;
  systemMsg: string;
  scope?: string;
}): Promise<Agent> {
  const res = await api.post('/admin/agents', data);
  return res.data;
}

export async function updateAgent(
  id: number,
  data: { name?: string; systemMsg?: string; scope?: string; isActive?: boolean },
): Promise<Agent> {
  const res = await api.patch(`/admin/agents/${id}`, data);
  return res.data;
}

export async function deleteAgent(id: number): Promise<void> {
  await api.delete(`/admin/agents/${id}`);
}

export async function getAvailableAgents(): Promise<{ agents: Agent[]; defaultAgent: Agent | null }> {
  const res = await api.get('/agents/available');
  return res.data;
}

export async function setActiveAgent(agentId: number | null): Promise<{ id: number; activeAgentId: number | null }> {
  const res = await api.patch('/users/me/active-agent', { agentId });
  return res.data;
}
