import { useState, useRef, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { queryGemeBot } from '../../services/custodia.service';

interface Message {
  id: string;
  sender: 'user' | 'bot';
  text: string;
  timestamp: string;
  intent?: string;
}

export default function GemeBotChat() {
  const navigate = useNavigate();
  const location = useLocation();
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      sender: 'bot',
      text: '¡Hola! Soy **GEME-BOT**, tu asistente especializado en la gestión de custodias de GEMESEG. 🛡️\n\nPuedes hacerme preguntas como:\n• *¿Cuál es la placa más usada en PUERTO este mes?*\n• *¿Qué guardia tiene más viajes en HACIENDA en los últimos 30 días?*\n• *¿Cuándo fue el primer viaje de Juan Pérez?*',
      timestamp: new Date().toLocaleTimeString('es-EC', { hour: '2-digit', minute: '2-digit' }),
    },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, loading]);

  async function handleSend(textToSend?: string) {
    const text = (textToSend || input).trim();
    if (!text || loading) return;

    const userMsg: Message = {
      id: String(Date.now()),
      sender: 'user',
      text,
      timestamp: new Date().toLocaleTimeString('es-EC', { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages((prev) => [...prev, userMsg]);
    if (!textToSend) setInput('');
    setLoading(true);

    try {
      const res = await queryGemeBot(text);
      const botMsg: Message = {
        id: String(Date.now() + 1),
        sender: 'bot',
        text: res.respuesta || 'Consulta procesada.',
        intent: res.intent,
        timestamp: new Date().toLocaleTimeString('es-EC', { hour: '2-digit', minute: '2-digit' }),
      };
      setMessages((prev) => [...prev, botMsg]);
    } catch {
      const errorMsg: Message = {
        id: String(Date.now() + 1),
        sender: 'bot',
        text: 'Ocurrió un error al procesar la consulta. Por favor intenta de nuevo.',
        timestamp: new Date().toLocaleTimeString('es-EC', { hour: '2-digit', minute: '2-digit' }),
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setLoading(false);
    }
  }

  const suggestionChips = [
    'Placa más usada en PUERTO este mes',
    'Guardia con más viajes HACIENDA en 30 días',
    'Primer viaje registrado en el sistema',
  ];

  return (
    <div className="page-container">
      <div className="page-header-row">
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button className="cacao-back-btn" onClick={() => navigate(location.state?.from || '/custodias')}>← Volver</button>
          <div>
            <p className="page-eyebrow">CUSTODIAS</p>
            <h1>GEME-BOT Asistente Operativo</h1>
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 850, margin: '0 auto', background: '#fff', borderRadius: '16px', border: '1px solid #e2e8f0', boxShadow: '0 4px 16px rgba(0,0,0,0.06)', display: 'flex', flexDirection: 'column', height: 'calc(80vh - 100px)', minHeight: '500px' }}>
        {/* CHAT HEADER */}
        <div style={{ padding: '16px 20px', background: '#100F31', color: '#fff', borderTopLeftRadius: '15px', borderTopRightRadius: '15px', display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ fontSize: '1.5rem', background: '#12375F', width: '40px', height: '40px', borderRadius: '50%', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
            🤖
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: '1rem' }}>GEME-BOT Asistente</div>
            <div style={{ fontSize: '0.75rem', color: '#cbd5e1' }}>Motor inteligente de consulta operativa</div>
          </div>
        </div>

        {/* CHAT MESSAGES BODY */}
        <div style={{ flex: 1, padding: '20px', overflowY: 'auto', background: '#f8fafc', display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {messages.map((m) => {
            const isBot = m.sender === 'bot';
            return (
              <div
                key={m.id}
                style={{
                  alignSelf: isBot ? 'flex-start' : 'flex-end',
                  maxWidth: '82%',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: isBot ? 'flex-start' : 'flex-end',
                }}
              >
                <div
                  style={{
                    padding: '12px 16px',
                    borderRadius: '14px',
                    background: isBot ? '#ffffff' : '#100F31',
                    color: isBot ? '#1e293b' : '#ffffff',
                    border: isBot ? '1px solid #e2e8f0' : 'none',
                    boxShadow: isBot ? '0 2px 6px rgba(0,0,0,0.04)' : 'none',
                    fontSize: '0.9rem',
                    lineHeight: '1.5',
                    whiteSpace: 'pre-wrap',
                  }}
                >
                  {m.text}
                </div>
                <div style={{ fontSize: '0.68rem', color: '#94a3b8', marginTop: '4px', padding: '0 4px' }}>
                  {m.timestamp}
                </div>
              </div>
            );
          })}

          {loading && (
            <div style={{ alignSelf: 'flex-start', padding: '12px 16px', background: '#ffffff', borderRadius: '14px', border: '1px solid #e2e8f0', color: '#718096', fontSize: '0.85rem' }}>
              🤖 Procesando consulta SQL...
            </div>
          )}
          <div ref={chatEndRef} />
        </div>

        {/* SUGGESTION CHIPS */}
        <div style={{ padding: '10px 16px', background: '#fff', borderTop: '1px solid #f1f5f9', display: 'flex', gap: '8px', overflowX: 'auto' }}>
          {suggestionChips.map((chip, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => handleSend(chip)}
              disabled={loading}
              style={{
                padding: '6px 12px',
                borderRadius: '12px',
                background: '#f1f5f9',
                border: '1px solid #cbd5e1',
                color: '#334155',
                fontSize: '0.78rem',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                fontWeight: 600,
              }}
            >
              💡 {chip}
            </button>
          ))}
        </div>

        {/* INPUT FORM */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSend();
          }}
          style={{ padding: '14px 16px', background: '#fff', borderBottomLeftRadius: '15px', borderBottomRightRadius: '15px', borderTop: '1px solid #e2e8f0', display: 'flex', gap: '10px' }}
        >
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Haz una pregunta sobre vehículos, guardias o viajes..."
            disabled={loading}
            style={{ flex: 1, padding: '12px 16px', border: '2px solid #e2e8f0', borderRadius: '12px', fontSize: '0.9rem' }}
          />
          <button
            type="submit"
            className="auth-btn"
            disabled={loading || !input.trim()}
            style={{ padding: '0 20px', borderRadius: '12px', whiteSpace: 'nowrap' }}
          >
            Enviar ➔
          </button>
        </form>
      </div>
    </div>
  );
}
