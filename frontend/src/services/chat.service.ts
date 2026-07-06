import { api } from './auth.service';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

const STORAGE_KEY = 'gemeseg_chat_history';
const CONV_KEY = 'gemeseg_conversation_id';

export function getChatHistory(): ChatMessage[] {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return parsed.map((m: any) => ({ ...m, timestamp: new Date(m.timestamp) }));
  } catch {
    return [];
  }
}

export function saveChatHistory(messages: ChatMessage[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(messages));
}

export function clearChatHistory() {
  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem(CONV_KEY);
}

export function getConversationId(): number | null {
  const raw = localStorage.getItem(CONV_KEY);
  return raw ? Number(raw) : null;
}

export function setConversationId(id: number) {
  localStorage.setItem(CONV_KEY, String(id));
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
): Promise<{ reply: string; conversationId: number }> {
  const conversationId = getConversationId();

  const res = await api.post('/chat/message', {
    conversationId,
    message: content,
    context,
  });

  if (res.data.conversationId) {
    setConversationId(res.data.conversationId);
  }

  return res.data;
}
