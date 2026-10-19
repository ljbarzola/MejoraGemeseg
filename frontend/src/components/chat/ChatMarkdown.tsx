import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

// Formato de las respuestas de Agente Gemeseg. El modelo contesta en Markdown
// (listas con "*" o "-", "1.", **negritas**) y antes se mostraba el texto
// crudo: un párrafo con asteriscos sueltos. Esto cubre solo lo que el agente
// usa, armando elementos de React — nunca HTML inyectado, así una respuesta
// no puede meter etiquetas ni scripts en la página.

// Referencias de evidencia del Agente de Ventas: [#opp:12], [#contrato:3]... El agente las pone
// junto a cada hecho para que se pueda comprobar de dónde sale. En vez del texto crudo se muestran
// como una etiqueta pequeña («oportunidad 12»); las que tienen pantalla propia llevan enlace.
const REF_RE = /(\[#[a-z]+:\d+\])/g;
const REF_UNA_RE = /^\[#([a-z]+):(\d+)\]$/;

const REFERENCIAS: Record<string, { etiqueta: string; ayuda: string; enlace?: (id: string) => string }> = {
  opp: { etiqueta: 'oportunidad', ayuda: 'Oportunidad registrada en Ventas → Oportunidades', enlace: () => '/ventas/oportunidades' },
  contrato: { etiqueta: 'contrato', ayuda: 'Contrato registrado en Ventas → Contratos', enlace: (id) => `/ventas/contratos/${id}` },
  lead: { etiqueta: 'posible cliente', ayuda: 'Posible cliente en Ventas → Posibles clientes', enlace: () => '/ventas/leads' },
  act: { etiqueta: 'nota', ayuda: 'Nota o actividad del historial del cliente' },
  motivo: { etiqueta: 'motivo', ayuda: 'Motivo de cierre registrado' },
};

function referencia(parte: string, key: string, onNavegar?: () => void): ReactNode {
  const m = parte.match(REF_UNA_RE);
  if (!m) return parte;
  const def = REFERENCIAS[m[1]];
  if (!def) return <span key={key} className="chat-ref" title="Registro del sistema">{m[1]} {m[2]}</span>;
  const texto = `${def.etiqueta} ${m[2]}`;
  return def.enlace ? (
    <Link key={key} to={def.enlace(m[2])} className="chat-ref chat-ref-enlace" title={def.ayuda} onClick={onNavegar}>
      {texto}
    </Link>
  ) : (
    <span key={key} className="chat-ref" title={def.ayuda}>{texto}</span>
  );
}

// **negrita**, __negrita__, *cursiva*, `código`
const INLINE_RE = /(\*\*[^*]+\*\*|__[^_]+__|\*[^*\s][^*]*\*|`[^`]+`)/g;

function inline(text: string, keyBase: string, onNavegar?: () => void): ReactNode[] {
  return text.split(INLINE_RE).filter(Boolean).flatMap((part, i): ReactNode[] => {
    const key = `${keyBase}-${i}`;
    if ((part.startsWith('**') && part.endsWith('**')) || (part.startsWith('__') && part.endsWith('__'))) {
      return [<strong key={key}>{conReferencias(part.slice(2, -2), key, onNavegar)}</strong>];
    }
    if (part.startsWith('`') && part.endsWith('`')) {
      return [<code key={key}>{part.slice(1, -1)}</code>];
    }
    if (part.startsWith('*') && part.endsWith('*') && part.length > 2) {
      return [<em key={key}>{conReferencias(part.slice(1, -1), key, onNavegar)}</em>];
    }
    return conReferencias(part, key, onNavegar);
  });
}

function conReferencias(text: string, keyBase: string, onNavegar?: () => void): ReactNode[] {
  return text.split(REF_RE).filter(Boolean).map((p, i) => referencia(p, `${keyBase}-r${i}`, onNavegar));
}

const BULLET_RE = /^(\s*)[*\-•]\s+(.*)$/;
const NUMBER_RE = /^(\s*)(\d+)[.)]\s+(.*)$/;
const HEADING_RE = /^\s*#{1,6}\s+(.*)$/;

/**
 * El modelo a veces pega la lista en una sola línea ("Puedes: * A. * B.").
 * Si una línea trae dos o más " * " seguidos de texto, se parte en viñetas.
 */
function splitInlineBullets(line: string): string[] {
  const parts = line.split(/\s+\*\s+(?=\S)/);
  if (parts.length < 3) return [line];
  const [intro, ...items] = parts;
  return [intro.trim(), ...items.map((it) => `* ${it.trim()}`)].filter(Boolean);
}

// `onNavegar` se llama al tocar un enlace de referencia (el cajón del chat se cierra para ver la pantalla).
export default function ChatMarkdown({ text, onNavegar }: { text: string; onNavegar?: () => void }) {
  const lines = text.split(/\r?\n/).flatMap(splitInlineBullets);
  const blocks: ReactNode[] = [];
  let list: { type: 'ul' | 'ol'; items: ReactNode[]; start: number } | null = null;
  let paragraph: string[] = [];

  const flushParagraph = () => {
    if (paragraph.length) {
      const k = `p${blocks.length}`;
      blocks.push(<p key={k}>{inline(paragraph.join(' '), k, onNavegar)}</p>);
      paragraph = [];
    }
  };
  const flushList = () => {
    if (list) {
      const k = `l${blocks.length}`;
      blocks.push(
        list.type === 'ul'
          ? <ul key={k}>{list.items}</ul>
          : <ol key={k} start={list.start}>{list.items}</ol>,
      );
      list = null;
    }
  };

  lines.forEach((line, idx) => {
    const bullet = line.match(BULLET_RE);
    const number = line.match(NUMBER_RE);
    const heading = line.match(HEADING_RE);

    if (bullet || number) {
      flushParagraph();
      const type = bullet ? 'ul' : 'ol';
      if (!list || list.type !== type) {
        flushList();
        list = { type, items: [], start: number ? Number(number[2]) : 1 };
      }
      const content = bullet ? bullet[2] : number![3];
      // Sangría de 2+ espacios = subnivel ("  - detalle" bajo un punto).
      const sub = (bullet ? bullet[1] : number![1]).replace(/\t/g, '  ').length >= 2;
      list.items.push(
        <li key={idx} className={sub ? 'chat-md-sub' : undefined}>{inline(content, `li${idx}`, onNavegar)}</li>,
      );
    } else if (heading) {
      flushParagraph();
      flushList();
      blocks.push(<p key={`h${idx}`} className="chat-md-heading">{inline(heading[1], `h${idx}`, onNavegar)}</p>);
    } else if (!line.trim()) {
      flushParagraph();
      flushList();
    } else {
      flushList();
      paragraph.push(line.trim());
    }
  });
  flushParagraph();
  flushList();

  return <div className="chat-md">{blocks}</div>;
}
