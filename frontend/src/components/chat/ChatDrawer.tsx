import { useState, useRef, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import {
  getChatHistory,
  saveChatHistory,
  detectContext,
  sendMessage,
  type ChatMessage,
} from '../../services/chat.service';
import { getAvailableAgents, setActiveAgent } from '../../services/agent.service';
import type { Agent } from '../../types/agent';

interface ChatDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

const AGENT_STORAGE_KEY = 'gemeseg_active_agent_id';

export default function ChatDrawer({ isOpen, onClose }: ChatDrawerProps) {
  const location = useLocation();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const [agents, setAgents] = useState<Agent[]>([]);
  const [defaultAgent, setDefaultAgent] = useState<Agent | null>(null);
  const [activeAgentId, setActiveAgentIdState] = useState<number | null>(null);
  const [showAgentMenu, setShowAgentMenu] = useState(false);

  const context = detectContext(location.pathname);

  useEffect(() => {
    setMessages(getChatHistory());
    const saved = localStorage.getItem(AGENT_STORAGE_KEY);
    if (saved) setActiveAgentIdState(Number(saved));
  }, []);

  useEffect(() => {
    if (isOpen && agents.length === 0) {
      getAvailableAgents().then((data) => {
        setAgents(data.agents);
        setDefaultAgent(data.defaultAgent);
      }).catch(() => {});
    }
  }, [isOpen]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping]);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 300);
    }
  }, [isOpen]);

  const currentAgent = agents.find((a) => a.id === activeAgentId) || defaultAgent;

  async function handleSelectAgent(agent: Agent | null) {
    const agentId = agent?.id || null;
    setActiveAgentIdState(agentId);
    if (agentId) {
      localStorage.setItem(AGENT_STORAGE_KEY, String(agentId));
    } else {
      localStorage.removeItem(AGENT_STORAGE_KEY);
    }
    try {
      await setActiveAgent(agentId);
    } catch {}
    setShowAgentMenu(false);
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
    saveChatHistory(updated);
    setInput('');
    setIsTyping(true);

    try {
      const result = await sendMessage(text, context);
      const assistantMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: result.reply,
        timestamp: new Date(),
      };
      const final = [...updated, assistantMsg];
      setMessages(final);
      saveChatHistory(final);
    } catch {
      const errorMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: 'Lo siento, hubo un error al procesar tu pregunta. Intenta de nuevo.',
        timestamp: new Date(),
      };
      const final = [...updated, errorMsg];
      setMessages(final);
      saveChatHistory(final);
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
            <div className="chat-bot-icon">🤖</div>
            <div>
              <div className="chat-header-title">Agente GEMESEG</div>
              <div className="chat-header-context">Sección: {context}</div>
            </div>
          </div>
          <button className="chat-close" onClick={onClose}>✕</button>
        </div>

        <div className="chat-agent-bar">
          <button className="chat-agent-trigger" onClick={() => setShowAgentMenu(!showAgentMenu)}>
            <span className="chat-agent-icon">🧠</span>
            <span className="chat-agent-name">{currentAgent?.name || 'Agente GEMESEG'}</span>
            <span className="chat-agent-arrow">{showAgentMenu ? '▲' : '▼'}</span>
          </button>
          {showAgentMenu && (
            <div className="chat-agent-menu">
              <button
                className={`chat-agent-option ${!activeAgentId ? 'active' : ''}`}
                onClick={() => handleSelectAgent(null)}
              >
                <span className="chat-agent-option-name">Agente GEMESEG</span>
                <span className="chat-agent-option-desc">Agente por defecto</span>
              </button>
              {agents.filter((a) => a.userId !== null).map((agent) => (
                <button
                  key={agent.id}
                  className={`chat-agent-option ${activeAgentId === agent.id ? 'active' : ''}`}
                  onClick={() => handleSelectAgent(agent)}
                >
                  <span className="chat-agent-option-name">{agent.name}</span>
                  <span className="chat-agent-option-desc">{agent.scope}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="chat-messages">
          {messages.length === 0 && (
            <div className="chat-empty">
              <div className="chat-bot-icon-lg">🤖</div>
              <p>¡Hola! Soy tu agente. Pregúntame sobre esta sección.</p>
            </div>
          )}
          {messages.map((msg) => (
            <div key={msg.id} className={`chat-msg chat-msg-${msg.role}`}>
              {msg.role === 'assistant' && (
                <div className="chat-msg-avatar">🤖</div>
              )}
              <div className="chat-msg-bubble">
                <div className="chat-msg-text">{msg.content}</div>
                <div className="chat-msg-time">
                  {msg.timestamp.toLocaleTimeString('es-EC', { hour: '2-digit', minute: '2-digit' })}
                </div>
              </div>
            </div>
          ))}
          {isTyping && (
            <div className="chat-msg chat-msg-assistant">
              <div className="chat-msg-avatar">🤖</div>
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

        <div className="chat-input-bar">
          <input
            ref={inputRef}
            type="text"
            className="chat-input"
            placeholder="Pregúntame sobre esta sección..."
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
      </div>
    </div>
  );
}
