import { api } from './auth.service';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

const STORAGE_PREFIX = 'gemeseg_chat_';
const CONV_PREFIX = 'gemeseg_conv_';
const AGENT_STORAGE_KEY = 'gemeseg_active_agent_id';

function getStorageKey(agentId: number | null): string {
  return `${STORAGE_PREFIX}${agentId || 'default'}`;
}

function getConvKey(agentId: number | null): string {
  return `${CONV_PREFIX}${agentId || 'default'}`;
}

export function getChatHistory(agentId: number | null = null): ChatMessage[] {
  const raw = localStorage.getItem(getStorageKey(agentId));
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return parsed.map((m: any) => ({ ...m, timestamp: new Date(m.timestamp) }));
  } catch {
    return [];
  }
}

export function saveChatHistory(messages: ChatMessage[], agentId: number | null = null) {
  localStorage.setItem(getStorageKey(agentId), JSON.stringify(messages));
}

export function clearChatHistory(agentId: number | null = null) {
  localStorage.removeItem(getStorageKey(agentId));
  localStorage.removeItem(getConvKey(agentId));
}

export function getConversationId(agentId: number | null = null): number | null {
  const raw = localStorage.getItem(getConvKey(agentId));
  return raw ? Number(raw) : null;
}

export function setConversationId(id: number, agentId: number | null = null) {
  localStorage.setItem(getConvKey(agentId), String(id));
}

export function getActiveAgentId(): number | null {
  const raw = localStorage.getItem(AGENT_STORAGE_KEY);
  return raw ? Number(raw) : null;
}

export function setActiveAgentId(agentId: number | null) {
  if (agentId !== null) {
    localStorage.setItem(AGENT_STORAGE_KEY, String(agentId));
  } else {
    localStorage.removeItem(AGENT_STORAGE_KEY);
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

export async function sendMessage(
  content: string,
  context: string,
  agentId: number | null = null,
): Promise<{ reply: string; conversationId: number; agentId: number }> {
  const conversationId = getConversationId(agentId);

  const res = await api.post('/chat/message', {
    conversationId,
    agentId: agentId || undefined,
    message: content,
    context,
  });

  if (res.data.conversationId) {
    setConversationId(res.data.conversationId, agentId);
  }

  return res.data;
}

export async function getConversations(agentId?: number) {
  const params: Record<string, string> = {};
  if (agentId) params.agentId = String(agentId);
  const res = await api.get('/chat/conversations', { params });
  return res.data;
}
