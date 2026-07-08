import { api } from './auth.service';
import { getUser } from './auth.service';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

export interface Conversation {
  id: number;
  context: string;
  agentId: number;
  agent: { id: number; name: string } | null;
  _count: { messages: number };
  updatedAt: string;
  createdAt: string;
}

const ACTIVE_AGENT_PREFIX = 'gemeseg_active_agent_';

function getActiveAgentKey(): string {
  const user = getUser();
  return `${ACTIVE_AGENT_PREFIX}${user?.id || 'default'}`;
}

export function getActiveAgentId(): number | null {
  const raw = localStorage.getItem(getActiveAgentKey());
  return raw ? Number(raw) : null;
}

export function setActiveAgentId(agentId: number | null) {
  if (agentId !== null) {
    localStorage.setItem(getActiveAgentKey(), String(agentId));
  } else {
    localStorage.removeItem(getActiveAgentKey());
  }
}

export function detectContext(pathname: string): string {
  if (pathname === '/dashboard') return 'dashboard';
  if (pathname === '/projects') return 'proyectos';
  if (pathname === '/projects/new') return 'crear proyecto';
  if (pathname.match(/\/projects\/\d+\/tasks\/new/)) return 'crear tarea';
  if (pathname.match(/\/projects\/\d+\/tasks/)) return 'tablero kanban';
  if (pathname.match(/\/projects\/\d+/)) return 'detalle de proyecto';
  if (pathname.match(/\/tasks\/\d+/)) return 'detalle de tarea';
  if (pathname === '/admin') return 'administracion';
  return 'general';
}

export async function getConversations(agentId?: number): Promise<Conversation[]> {
  const params: Record<string, string> = {};
  if (agentId) params.agentId = String(agentId);
  const res = await api.get('/chat/conversations', { params });
  return res.data;
}

export async function getConversationMessages(conversationId: number): Promise<ChatMessage[]> {
  const res = await api.get(`/chat/conversations/${conversationId}/messages`);
  return res.data.map((m: any) => ({
    ...m,
    timestamp: new Date(m.timestamp),
  }));
}

export async function sendMessage(
  content: string,
  context: string,
  agentId: number | null = null,
  conversationId: number | null = null,
): Promise<{ reply: string; conversationId: number; agentId: number }> {
  const res = await api.post('/chat/message', {
    conversationId,
    agentId: agentId || undefined,
    message: content,
    context,
  });

  return res.data;
}
