import { useState, useRef, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import {
  getConversations,
  getConversationMessages,
  deleteConversation,
  sendMessage,
  getActiveAgentId,
  setActiveAgentId,
  detectContext,
  EVENTO_CHAT_VENTAS,
  type ChatMessage,
  type Conversation,
  type PedidoChatVentas,
} from '../../services/chat.service';
import { getAvailableAgents, setActiveAgent } from '../../services/agent.service';
import type { Agent } from '../../types/agent';
import ConfirmDialog from '../common/ConfirmDialog';
import ChatMarkdown from './ChatMarkdown';
import ChatEsperando from './ChatEsperando';

interface ChatDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

const AGENT_EMOJI: Record<string, string> = {
  GLOBAL: '🌐',
  PROJECTS: '📋',
  TASKS: '✅',
  ADMIN: '⚙️',
  VENTAS: '📈',
};

function getAgentEmoji(agent: Agent | null): string {
  if (!agent) return '🤖';
  return AGENT_EMOJI[agent.scope] || '🤖';
}

const esAgenteDeVentas = (agent: Agent | null | undefined) => agent?.scope === 'VENTAS';

// Preguntas de un clic para empezar con el Agente de Ventas. Son las que mejor sabe contestar.
const SUGERENCIAS_VENTAS: { icono: string; texto: string }[] = [
  { icono: '📋', texto: '¿Qué debo atender hoy?' },
  { icono: '♻️', texto: '¿A quién podemos recuperar de los clientes inactivos?' },
  { icono: '📊', texto: 'Dame un resumen de mi cartera' },
  { icono: '🔎', texto: '¿Por qué perdimos clientes en los últimos 90 días?' },
  { icono: '📅', texto: '¿Qué contratos vencen pronto y qué hago con cada uno?' },
];

interface ClienteDeLaConversacion {
  id: number;
  nombre: string;
}

export default function ChatDrawer({ isOpen, onClose }: ChatDrawerProps) {
  const location = useLocation();
  const context = detectContext(location.pathname);

  const [agents, setAgents] = useState<Agent[]>([]);
  const [defaultAgent, setDefaultAgent] = useState<Agent | null>(null);
  const [activeAgentId, setActiveAgentIdState] = useState<number | null>(null);
  const [showAgentMenu, setShowAgentMenu] = useState(false);
  const [agentsLoaded, setAgentsLoaded] = useState(false);

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loadingConversations, setLoadingConversations] = useState(false);

  const [activeConversationId, setActiveConversationId] = useState<number | null>(null);
  const [isNewConversation, setIsNewConversation] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);

  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [confirmandoEliminarConv, setConfirmandoEliminarConv] = useState<Conversation | null>(null);
  // Empresa o persona de la que habla esta conversación (se abrió desde su ficha): cada mensaje
  // la lleva para que el Agente de Ventas siga con su expediente a la vista.
  const [clienteCtx, setClienteCtx] = useState<ClienteDeLaConversacion | null>(null);
  // Pedido de «Preguntar al agente» que espera a que se carguen los agentes.
  const [pedido, setPedido] = useState<PedidoChatVentas | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const currentAgent = agents.find((a) => a.id === activeAgentId) || defaultAgent;
  const showChat = activeConversationId !== null || isNewConversation;
  const hablandoConVentas = esAgenteDeVentas(currentAgent);

  useEffect(() => {
    if (isOpen && !agentsLoaded) {
      getAvailableAgents().then((data) => {
        setAgents(data.agents);
        setDefaultAgent(data.defaultAgent);
        setAgentsLoaded(true);
        const saved = getActiveAgentId();
        setActiveAgentIdState(saved);
        // Antes solo se pedía el historial si el usuario ya había elegido un
        // agente a mano alguna vez (localStorage). Con el agente por defecto
        // (el flujo normal, sin tocar el selector) esa condición nunca se
        // cumplía y el historial nunca se pedía al servidor — parecía que
        // las conversaciones no se guardaban, cuando sí se guardaban.
        loadConversations(saved);
      }).catch(() => {});
    }
  }, [isOpen, agentsLoaded]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping]);

  useEffect(() => {
    if (isOpen && showChat) {
      setTimeout(() => inputRef.current?.focus(), 300);
    }
  }, [isOpen, showChat]);

  // «Preguntar al agente» desde la ficha de un cliente, una oportunidad o un contrato (ver
  // abrirChatDeVentas en chat.service.ts). App.tsx abre el cajón; aquí se guarda el pedido.
  useEffect(() => {
    const alPedir = (e: Event) => setPedido((e as CustomEvent<PedidoChatVentas>).detail);
    window.addEventListener(EVENTO_CHAT_VENTAS, alPedir);
    return () => window.removeEventListener(EVENTO_CHAT_VENTAS, alPedir);
  }, []);

  useEffect(() => {
    if (!pedido || !agentsLoaded) return;
    const p = pedido;
    setPedido(null);
    const ventas = agents.find(esAgenteDeVentas);
    if (!ventas) {
      setActiveConversationId(null);
      setIsNewConversation(true);
      setClienteCtx(null);
      setMessages([{
        id: crypto.randomUUID(),
        role: 'assistant',
        content: 'No encuentro el Agente de Ventas para tu usuario. Puede que no tengas acceso a Ventas o que esté desactivado: avisa a Sistemas.',
        timestamp: new Date(),
      }]);
      return;
    }
    const cliente = { id: p.clienteId, nombre: p.clienteNombre };
    setActiveAgentIdState(ventas.id);
    setActiveAgentId(ventas.id);
    setActiveAgent(ventas.id).catch(() => {});
    setShowAgentMenu(false);
    setActiveConversationId(null);
    setIsNewConversation(true);
    setClienteCtx(cliente);
    setMessages([]);
    loadConversations(ventas.id);
    void enviar(
      p.mensaje?.trim() || `Analiza el historial de ${p.clienteNombre}: ¿qué ha pasado y qué puedo hacer ahora?`,
      { agentId: ventas.id, conversationId: null, cliente, base: [] },
    );
  }, [pedido, agentsLoaded]);

  async function loadConversations(agentId: number | null) {
    setLoadingConversations(true);
    try {
      const data = await getConversations(agentId || undefined);
      setConversations(data);
    } catch {
      setConversations([]);
    } finally {
      setLoadingConversations(false);
    }
  }

  async function handleSelectAgent(agent: Agent | null) {
    const agentId = agent?.id || null;
    setActiveAgentIdState(agentId);
    setActiveAgentId(agentId);
    setActiveConversationId(null);
    setIsNewConversation(false);
    setMessages([]);
    setClienteCtx(null);
    setShowAgentMenu(false);
    try {
      await setActiveAgent(agentId);
    } catch {}
    loadConversations(agentId);
  }

  async function handleSelectConversation(conversation: Conversation) {
    setActiveConversationId(conversation.id);
    setIsNewConversation(false);
    setClienteCtx(null);
    setLoadingMessages(true);
    try {
      const msgs = await getConversationMessages(conversation.id);
      setMessages(msgs);
    } catch {
      setMessages([]);
    } finally {
      setLoadingMessages(false);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }

  function handleNewConversation() {
    setActiveConversationId(null);
    setIsNewConversation(true);
    setMessages([]);
    setClienteCtx(null);
    setTimeout(() => inputRef.current?.focus(), 100);
  }

  async function confirmarEliminarConversacion() {
    if (!confirmandoEliminarConv) return;
    const conv = confirmandoEliminarConv;
    setConfirmandoEliminarConv(null);
    try {
      await deleteConversation(conv.id);
      if (activeConversationId === conv.id) {
        setActiveConversationId(null);
        setIsNewConversation(false);
        setMessages([]);
      }
      loadConversations(activeAgentId);
    } catch {}
  }

  function handleBackToList() {
    setActiveConversationId(null);
    setIsNewConversation(false);
    setMessages([]);
    setClienteCtx(null);
    loadConversations(activeAgentId);
  }

  // Manda un mensaje y pone la respuesta. Recibe todo lo que necesita (agente, conversación,
  // empresa y mensajes anteriores) porque se llama también justo después de cambiar el estado,
  // cuando el estado de React todavía trae los valores viejos.
  async function enviar(
    text: string,
    opts: {
      agentId: number | null;
      conversationId: number | null;
      cliente: ClienteDeLaConversacion | null;
      base: ChatMessage[];
    },
  ) {
    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: text,
      timestamp: new Date(),
    };

    const updated = [...opts.base, userMsg];
    setMessages(updated);
    setInput('');
    if (inputRef.current) inputRef.current.style.height = 'auto';
    setIsTyping(true);

    try {
      const result = await sendMessage(text, context, opts.agentId, opts.conversationId, opts.cliente?.id ?? null);
      const assistantMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: result.reply,
        timestamp: new Date(),
      };
      setMessages([...updated, assistantMsg]);

      if (!opts.conversationId && result.conversationId) {
        setActiveConversationId(result.conversationId);
        setIsNewConversation(false);
        loadConversations(opts.agentId);
      }
    } catch (err: any) {
      const detalle = err?.response?.data?.message;
      const errorMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content:
          (typeof detalle === 'string' && detalle) ||
          'Lo siento, hubo un error al procesar tu pregunta. Intenta de nuevo.',
        timestamp: new Date(),
      };
      setMessages([...updated, errorMsg]);
    } finally {
      setIsTyping(false);
    }
  }

  const handleSend = async (textoDirecto?: string) => {
    const text = (textoDirecto ?? input).trim();
    if (!text || isTyping) return;
    await enviar(text, {
      agentId: activeAgentId,
      conversationId: activeConversationId,
      cliente: clienteCtx,
      base: messages,
    });
  };

  // Una pregunta sugerida: abre una conversación nueva y la envía de una vez.
  const preguntarSugerida = (texto: string) => {
    if (isTyping) return;
    setIsNewConversation(true);
    setActiveConversationId(null);
    setClienteCtx(null);
    void enviar(texto, { agentId: activeAgentId, conversationId: null, cliente: null, base: [] });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const ajustarAltura = (el: HTMLTextAreaElement) => {
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  };

  if (!isOpen) return null;

  const sugerencias = (
    <>
      <p className="chat-sugerencias-titulo">Puedes empezar con</p>
      <div className="chat-sugerencias">
        {SUGERENCIAS_VENTAS.map((s) => (
          <button key={s.texto} type="button" className="chat-sugerencia" onClick={() => preguntarSugerida(s.texto)} disabled={isTyping}>
            <span aria-hidden="true">{s.icono}</span>
            <span>{s.texto}</span>
          </button>
        ))}
      </div>
      <p className="chat-ayuda-ventas">
        Para analizar a una empresa escribe su nombre: «¿Qué puedo hacer con Hotel Sol?». También puedes abrirme desde su ficha, en el botón «Preguntar al agente». Todo lo que te digo sale de lo que está registrado en el sistema; lo que no consta te lo digo.
      </p>
    </>
  );

  return (
    <div className="chat-overlay" onClick={onClose}>
      <div className="chat-drawer" onClick={(e) => e.stopPropagation()}>
        <div className="chat-header">
          <div className="chat-header-info">
            {showChat && (
              <button className="chat-back-btn" onClick={handleBackToList}>←</button>
            )}
            <div className="chat-bot-icon">{getAgentEmoji(currentAgent)}</div>
            <div className="chat-header-title-wrapper">
              <button className="chat-header-title-btn" onClick={() => setShowAgentMenu(!showAgentMenu)}>
                <span className="chat-header-title">{currentAgent?.name || 'Agente Gemeseg'}</span>
                <span className="chat-agent-arrow">{showAgentMenu ? '▲' : '▼'}</span>
              </button>
              <div className="chat-header-context">
                {showChat
                  ? `${messages.length} mensajes`
                  : currentAgent
                    ? `${conversations.length} conversaciones`
                    : 'Selecciona un agente'
                }
              </div>
              {showAgentMenu && (
                <div className="chat-agent-menu">
                  {defaultAgent && (
                    <button
                      className={`chat-agent-option ${activeAgentId === defaultAgent.id ? 'active' : ''}`}
                      onClick={() => handleSelectAgent(defaultAgent)}
                    >
                      <span className="chat-agent-option-name">🤖 {defaultAgent.name}</span>
                      <span className="chat-agent-option-desc">Agente por defecto: cómo usar la plataforma</span>
                    </button>
                  )}
                  {/* El Agente de Ventas es del sistema (sin dueño): antes este filtro lo escondía. */}
                  {agents.filter((a) => a.createdBy !== null || esAgenteDeVentas(a)).map((agent) => (
                    <button
                      key={agent.id}
                      className={`chat-agent-option ${activeAgentId === agent.id ? 'active' : ''}`}
                      onClick={() => handleSelectAgent(agent)}
                    >
                      <span className="chat-agent-option-name">{getAgentEmoji(agent)} {agent.name}</span>
                      <span className="chat-agent-option-desc">
                        {esAgenteDeVentas(agent) ? 'Analiza clientes y sugiere qué hacer' : agent.scope}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
          <button className="chat-close" onClick={onClose}>✕</button>
        </div>

        {!currentAgent ? (
          <div className="chat-empty">
            <div className="chat-bot-icon-lg">🤖</div>
            <p>Selecciona un agente para comenzar.</p>
            <p className="chat-empty-hint">Haz clic en la barra de arriba para ver los agentes disponibles.</p>
          </div>
        ) : showChat ? (
          <div className="chat-messages">
            {loadingMessages ? (
              <div className="chat-empty">
                <div className="chat-bot-icon-lg">{getAgentEmoji(currentAgent)}</div>
                <p>Cargando mensajes...</p>
              </div>
            ) : messages.length === 0 ? (
              <div className="chat-empty">
                <div className="chat-bot-icon-lg">{getAgentEmoji(currentAgent)}</div>
                {hablandoConVentas ? (
                  <>
                    <p>¡Hola! Soy tu <strong>Agente de Ventas</strong>. Reviso lo que hay registrado, te cuento qué pasó y te sugiero qué hacer.</p>
                    {sugerencias}
                  </>
                ) : (
                  <p>¡Hola! Soy {currentAgent.name}. Pregúntame sobre esta sección.</p>
                )}
              </div>
            ) : (
              messages.map((msg) => (
                <div key={msg.id} className={`chat-msg chat-msg-${msg.role}`}>
                  {msg.role === 'assistant' && (
                    <div className="chat-msg-avatar">{getAgentEmoji(currentAgent)}</div>
                  )}
                  <div className="chat-msg-bubble">
                    <div className="chat-msg-text">
                      {msg.role === 'assistant' ? <ChatMarkdown text={msg.content} onNavegar={onClose} /> : msg.content}
                    </div>
                    <div className="chat-msg-time">
                      {msg.timestamp.toLocaleTimeString('es-EC', { hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </div>
                </div>
              ))
            )}
            {isTyping && (
              <div className="chat-msg chat-msg-assistant">
                <div className="chat-msg-avatar">{getAgentEmoji(currentAgent)}</div>
                <div className="chat-msg-bubble">
                  <ChatEsperando />
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        ) : (
          <div className="chat-conversations">
            <div className="chat-conversations-header">
              <span className="chat-conversations-title">Conversaciones</span>
              <button className="chat-new-conv-btn" onClick={handleNewConversation}>+ Nueva</button>
            </div>
            {hablandoConVentas && <div style={{ padding: '0 16px' }}>{sugerencias}</div>}
            {loadingConversations ? (
              <div className="chat-conversations-loading">Cargando...</div>
            ) : conversations.length === 0 ? (
              <div className="chat-conversations-empty">
                <p>No hay conversaciones aún.</p>
                <p>Envía un mensaje para empezar una nueva.</p>
              </div>
            ) : (
              <div className="chat-conversations-list">
                {hablandoConVentas && <p className="chat-sugerencias-titulo" style={{ padding: '0 4px' }}>Tus conversaciones</p>}
                {conversations.map((conv) => (
                  <div key={conv.id} className="chat-conv-item-row">
                    <button
                      className="chat-conv-item"
                      onClick={() => handleSelectConversation(conv)}
                    >
                      <div className="chat-conv-item-header">
                        <span className="chat-conv-item-icon">💬</span>
                        <span className="chat-conv-item-context">{conv.context}</span>
                        <span className="chat-conv-item-count">{conv._count.messages}</span>
                      </div>
                      {conv.title && <div className="chat-conv-item-titulo">{conv.title}</div>}
                      <div className="chat-conv-item-date">
                        {new Date(conv.updatedAt).toLocaleDateString('es-EC', {
                          day: 'numeric',
                          month: 'short',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </div>
                    </button>
                    <button
                      type="button"
                      className="chat-conv-item-delete"
                      title="Eliminar conversación"
                      onClick={(e) => { e.stopPropagation(); setConfirmandoEliminarConv(conv); }}
                    >
                      🗑️
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {showChat && clienteCtx && (
          <div className="chat-contexto-cliente">
            <span>📌 Hablando de <strong>{clienteCtx.nombre}</strong>: tengo su expediente a la vista.</span>
            <button type="button" onClick={() => setClienteCtx(null)} title="Dejar de hablar de esta empresa">Quitar</button>
          </div>
        )}

        {showChat && (
          <div className="chat-input-bar">
            <textarea
              ref={inputRef}
              rows={1}
              className="chat-input"
              placeholder={`Pregúntale a ${currentAgent?.name || 'tu agente'}…  (Mayús+Enter para otra línea)`}
              value={input}
              onChange={(e) => { setInput(e.target.value); ajustarAltura(e.target); }}
              onKeyDown={handleKeyDown}
              disabled={isTyping}
            />
            <button
              className="chat-send"
              onClick={() => handleSend()}
              disabled={!input.trim() || isTyping}
              aria-label="Enviar"
            >
              ➤
            </button>
          </div>
        )}
      </div>

      {confirmandoEliminarConv && (
        <ConfirmDialog
          title="Eliminar conversación"
          message="¿Eliminar esta conversación? Esta acción no se puede deshacer."
          confirmLabel="Eliminar"
          danger
          onConfirm={confirmarEliminarConversacion}
          onCancel={() => setConfirmandoEliminarConv(null)}
        />
      )}
    </div>
  );
}
