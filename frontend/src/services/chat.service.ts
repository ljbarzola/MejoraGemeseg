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
  // Primera pregunta de la conversación (la pone el servidor): así el historial se lee como
  // «¿Qué debo atender hoy?» y no solo como «Ventas».
  title?: string | null;
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

export async function deleteConversation(conversationId: number): Promise<void> {
  await api.delete(`/chat/conversations/${conversationId}`);
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
  // Solo Agente de Ventas: empresa o persona del Directorio de la que se habla.
  clienteId: number | null = null,
): Promise<{ reply: string; conversationId: number; agentId: number }> {
  const res = await api.post('/chat/message', {
    conversationId,
    agentId: agentId || undefined,
    message: content,
    context,
    ...(clienteId ? { clienteId } : {}),
  });

  return res.data;
}

// «Preguntar al agente» desde la ficha de un cliente, una oportunidad o un contrato: abre el chat
// con el Agente de Ventas ya hablando de esa empresa y le manda la primera pregunta. Es un evento
// del navegador (no un prop) para poder pedirlo desde cualquier pantalla sin pasar por App.tsx.
export const EVENTO_CHAT_VENTAS = 'gemeseg:chat-ventas';

export interface PedidoChatVentas {
  clienteId: number;
  clienteNombre: string;
  // Primera pregunta; sin ella se usa «¿Qué ha pasado con X y qué puedo hacer ahora?».
  mensaje?: string;
}

export function abrirChatDeVentas(pedido: PedidoChatVentas) {
  window.dispatchEvent(new CustomEvent<PedidoChatVentas>(EVENTO_CHAT_VENTAS, { detail: pedido }));
}
