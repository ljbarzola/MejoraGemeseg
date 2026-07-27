import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

const HELP_TOPICS = [
  {
    q: '¿Qué es el módulo Cacao?',
    a: 'Sistema de control de inventario de cacao para Mikacao S.A. Controla desde la recepción del grano hasta la exportación.',
  },
  {
    q: 'Flujo del Sistema',
    a: 'Recepción → Lote → Liquidación → Fijación → Kárdex → Embarque → CxP/CxC. Cada paso está conectado.',
  },
  {
    q: 'Recepción',
    a: 'Registra entradas de cacao: proveedor, guía, pesos, humedad, impurezas, calidad. Genera un lote automáticamente. Soporta unidades TON/KG/SACO.',
  },
  {
    q: 'Liquidación',
    a: 'Cierra la recepción: aplica descuentos por humedad/impurezas, calcula valor neto a pagar. Genera la CxP.',
  },
  {
    q: 'Fijación de Precio',
    a: 'Convierte precio provisional en definitivo usando mercado de referencia (ICE Cocoa). Control de riesgo de precio.',
  },
  {
    q: 'Kárdex',
    a: 'Registro de movimientos por lote. Siempre en kg. Método promedio ponderado.',
  },
  {
    q: 'Embarque',
    a: 'Salida de inventario: descuenta del kárdex, genera CxC. Soporta unidades de venta.',
  },
  {
    q: 'CxP / CxC',
    a: 'Control deudas con proveedores y cobros a clientes. Antigüedad de saldos.',
  },
  {
    q: 'Guía Completa',
    a: 'Link a la guía completa del módulo.',
    link: '/cacao/guia',
  },
];

export default function CacaoHelpMenu() {
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState<number | null>(null);
  const navigate = useNavigate();
  const panelRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (
        panelRef.current && !panelRef.current.contains(e.target as Node) &&
        buttonRef.current && !buttonRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
        setExpanded(null);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  const handleToggle = (i: number) => {
    setExpanded(expanded === i ? null : i);
  };

  const handleTopicClick = (topic: typeof HELP_TOPICS[number]) => {
    if (topic.link) {
      navigate(topic.link);
      setOpen(false);
      setExpanded(null);
    }
  };

  return (
    <>
      <button
        ref={buttonRef}
        onClick={() => { setOpen(!open); setExpanded(null); }}
        className="cacao-help-fab"
        title="Ayuda Módulo Cacao"
        aria-label="Ayuda Módulo Cacao"
      >
        <span className="cacao-help-fab-icon">?</span>
      </button>

      {open && (
        <div className="cacao-help-panel" ref={panelRef}>
          <div className="cacao-help-header">
            <span>Ayuda - Módulo Cacao</span>
            <button className="cacao-help-close" onClick={() => { setOpen(false); setExpanded(null); }}>
              ×
            </button>
          </div>
          <div className="cacao-help-body">
            {HELP_TOPICS.map((topic, i) => (
              <div key={i} className={`cacao-help-item ${expanded === i ? 'expanded' : ''}`}>
                <button
                  className="cacao-help-question"
                  onClick={() => topic.link ? handleTopicClick(topic) : handleToggle(i)}
                >
                  <span>{topic.q}</span>
                  {!topic.link && (
                    <svg
                      className={`cacao-help-chevron ${expanded === i ? 'rotated' : ''}`}
                      width="14" height="14" viewBox="0 0 24 24" fill="none"
                      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                    >
                      <polyline points="6 9 12 15 18 9" />
                    </svg>
                  )}
                </button>
                {!topic.link && (
                  <div className={`cacao-help-answer ${expanded === i ? 'open' : ''}`}>
                    <p>{topic.a}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
