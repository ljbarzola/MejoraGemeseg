import type { ReactNode } from 'react';

// Formato de las respuestas de Agente Gemeseg. El modelo contesta en Markdown
// (listas con "*" o "-", "1.", **negritas**) y antes se mostraba el texto
// crudo: un párrafo con asteriscos sueltos. Esto cubre solo lo que el agente
// usa, armando elementos de React — nunca HTML inyectado, así una respuesta
// no puede meter etiquetas ni scripts en la página.

// **negrita**, __negrita__, *cursiva*, `código`
const INLINE_RE = /(\*\*[^*]+\*\*|__[^_]+__|\*[^*\s][^*]*\*|`[^`]+`)/g;

function inline(text: string, keyBase: string): ReactNode[] {
  return text.split(INLINE_RE).filter(Boolean).map((part, i) => {
    const key = `${keyBase}-${i}`;
    if ((part.startsWith('**') && part.endsWith('**')) || (part.startsWith('__') && part.endsWith('__'))) {
      return <strong key={key}>{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith('`') && part.endsWith('`')) {
      return <code key={key}>{part.slice(1, -1)}</code>;
    }
    if (part.startsWith('*') && part.endsWith('*') && part.length > 2) {
      return <em key={key}>{part.slice(1, -1)}</em>;
    }
    return part;
  });
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

export default function ChatMarkdown({ text }: { text: string }) {
  const lines = text.split(/\r?\n/).flatMap(splitInlineBullets);
  const blocks: ReactNode[] = [];
  let list: { type: 'ul' | 'ol'; items: ReactNode[]; start: number } | null = null;
  let paragraph: string[] = [];

  const flushParagraph = () => {
    if (paragraph.length) {
      const k = `p${blocks.length}`;
      blocks.push(<p key={k}>{inline(paragraph.join(' '), k)}</p>);
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
        <li key={idx} className={sub ? 'chat-md-sub' : undefined}>{inline(content, `li${idx}`)}</li>,
      );
    } else if (heading) {
      flushParagraph();
      flushList();
      blocks.push(<p key={`h${idx}`} className="chat-md-heading">{inline(heading[1], `h${idx}`)}</p>);
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
