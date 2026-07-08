import { useState, useRef, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import {
  getConversations,
  getConversationMessages,
  sendMessage,
  getActiveAgentId,
  setActiveAgentId,
  detectContext,
  type ChatMessage,
  type Conversation,
} from '../../services/chat.service';
import { getAvailableAgents, setActiveAgent } from '../../services/agent.service';
import type { Agent } from '../../types/agent';

interface ChatDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

const AGENT_EMOJI: Record<string, string> = {
  GLOBAL: '🌐',
  PROJECTS: '📋',
  TASKS: '✅',
  ADMIN: '⚙️',
};

function getAgentEmoji(agent: Agent | null): string {
  if (!agent) return '🤖';
  return AGENT_EMOJI[agent.scope] || '🤖';
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
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const currentAgent = agents.find((a) => a.id === activeAgentId) || defaultAgent;
  const showChat = activeConversationId !== null || isNewConversation;

  useEffect(() => {
    if (isOpen && !agentsLoaded) {
      getAvailableAgents().then((data) => {
        setAgents(data.agents);
        setDefaultAgent(data.defaultAgent);
        setAgentsLoaded(true);
        const saved = getActiveAgentId();
        if (saved) {
          setActiveAgentIdState(saved);
          loadConversations(saved);
        }
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
    setShowAgentMenu(false);
    try {
      await setActiveAgent(agentId);
    } catch {}
    loadConversations(agentId);
  }

  async function handleSelectConversation(conversation: Conversation) {
    setActiveConversationId(conversation.id);
    setIsNewConversation(false);
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
    setTimeout(() => inputRef.current?.focus(), 100);
  }

  function handleBackToList() {
    setActiveConversationId(null);
    setIsNewConversation(false);
    setMessages([]);
    loadConversations(activeAgentId);
  }

  const handleSend = async () => {
    const text = input.trim();
    if (!text || isTyping) return;

    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: text,
      timestamp: new Date(),
    };

    const updated = [...messages, userMsg];
    setMessages(updated);
    setInput('');
    setIsTyping(true);

    try {
      const result = await sendMessage(text, context, activeAgentId, activeConversationId);
      const assistantMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: result.reply,
        timestamp: new Date(),
      };
      setMessages([...updated, assistantMsg]);

      if (!activeConversationId && result.conversationId) {
        setActiveConversationId(result.conversationId);
        setIsNewConversation(false);
        loadConversations(activeAgentId);
      }
    } catch {
      const errorMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: 'Lo siento, hubo un error al procesar tu pregunta. Intenta de nuevo.',
        timestamp: new Date(),
      };
      setMessages([...updated, errorMsg]);
    } finally {
      setIsTyping(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="chat-overlay" onClick={onClose}>
      <div className="chat-drawer" onClick={(e) => e.stopPropagation()}>
        <div className="chat-header">
          <div className="chat-header-info">
            {showChat && (
              <button className="chat-back-btn" onClick={handleBackToList}>←</button>
            )}
            <div className="chat-bot-icon">{getAgentEmoji(currentAgent)}</div>
            <div>
              <div className="chat-header-title">
                {currentAgent?.name || 'Agente GEMESEG'}
              </div>
              <div className="chat-header-context">
                {showChat
                  ? `${messages.length} mensajes`
                  : currentAgent
                    ? `${conversations.length} conversaciones`
                    : 'Selecciona un agente'
                }
              </div>
            </div>
          </div>
          <button className="chat-close" onClick={onClose}>✕</button>
        </div>

        <div className="chat-agent-bar">
          <button className="chat-agent-trigger" onClick={() => setShowAgentMenu(!showAgentMenu)}>
            <span className="chat-agent-icon">🧠</span>
            <span className="chat-agent-name">{currentAgent?.name || 'Seleccionar agente'}</span>
            <span className="chat-agent-arrow">{showAgentMenu ? '▲' : '▼'}</span>
          </button>
          {showAgentMenu && (
            <div className="chat-agent-menu">
              {defaultAgent && (
                <button
                  className={`chat-agent-option ${activeAgentId === defaultAgent.id ? 'active' : ''}`}
                  onClick={() => handleSelectAgent(defaultAgent)}
                >
                  <span className="chat-agent-option-name">🤖 {defaultAgent.name}</span>
                  <span className="chat-agent-option-desc">Agente por defecto</span>
                </button>
              )}
              {agents.filter((a) => a.createdBy !== null).map((agent) => (
                <button
                  key={agent.id}
                  className={`chat-agent-option ${activeAgentId === agent.id ? 'active' : ''}`}
                  onClick={() => handleSelectAgent(agent)}
                >
                  <span className="chat-agent-option-name">{getAgentEmoji(agent)} {agent.name}</span>
                  <span className="chat-agent-option-desc">{agent.scope}</span>
                </button>
              ))}
            </div>
          )}
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
                <p>¡Hola! Soy {currentAgent.name}. Pregúntame sobre esta sección.</p>
              </div>
            ) : (
              messages.map((msg) => (
                <div key={msg.id} className={`chat-msg chat-msg-${msg.role}`}>
                  {msg.role === 'assistant' && (
                    <div className="chat-msg-avatar">{getAgentEmoji(currentAgent)}</div>
                  )}
                  <div className="chat-msg-bubble">
                    <div className="chat-msg-text">{msg.content}</div>
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
                  <div className="chat-typing">
                    <span className="chat-typing-dot" />
                    <span className="chat-typing-dot" />
                    <span className="chat-typing-dot" />
                  </div>
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
            {loadingConversations ? (
              <div className="chat-conversations-loading">Cargando...</div>
            ) : conversations.length === 0 ? (
              <div className="chat-conversations-empty">
                <p>No hay conversaciones aún.</p>
                <p>Envía un mensaje para empezar una nueva.</p>
              </div>
            ) : (
              <div className="chat-conversations-list">
                {conversations.map((conv) => (
                  <button
                    key={conv.id}
                    className="chat-conv-item"
                    onClick={() => handleSelectConversation(conv)}
                  >
                    <div className="chat-conv-item-header">
                      <span className="chat-conv-item-icon">💬</span>
                      <span className="chat-conv-item-context">{conv.context}</span>
                      <span className="chat-conv-item-count">{conv._count.messages}</span>
                    </div>
                    <div className="chat-conv-item-date">
                      {new Date(conv.updatedAt).toLocaleDateString('es-EC', {
                        day: 'numeric',
                        month: 'short',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {showChat && (
          <div className="chat-input-bar">
            <input
              ref={inputRef}
              type="text"
              className="chat-input"
              placeholder={`Pregúntale a ${currentAgent?.name || 'tu agente'}...`}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={isTyping}
            />
            <button
              className="chat-send"
              onClick={handleSend}
              disabled={!input.trim() || isTyping}
            >
              ➤
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
