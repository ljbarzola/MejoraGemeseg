// Parseo y filtrado por sección de la Base de Conocimiento institucional
// (CompanyKnowledgeBase.content) que Agente Gemeseg usa como contexto extra.
//
// El admin escribe el documento en Markdown con encabezados de nivel 2
// exactos en mayúsculas, uno por sección: `## RRHH`, `## VENTAS`, etc. —
// deben coincidir letra por letra con una clave de ALL_SECTIONS, o con el
// nombre especial `GENERAL`. El texto antes del primer encabezado reconocido,
// y todo lo que esté bajo `## GENERAL`, se entrega SIEMPRE a cualquier
// usuario sin importar sus permisos — es la única regla de "todos lo ven" y
// tiene que ser así de explícita para que un admin no crea que algo quedó
// protegido cuando en realidad cayó en el bloque general.
//
// Un encabezado mal escrito o que no coincide con ninguna sección conocida
// (mayúscula distinta, typo, clave inventada) NO abre una sección nueva: la
// línea se trata como texto normal y queda pegada a la sección que estaba
// abierta antes (o a GENERAL si es la primera línea del documento). Esto es
// deliberado — la alternativa (tratar cualquier encabezado desconocido como
// "general") dejaría visible para todo el mundo un bloque que el admin quiso
// restringir mal escrito.

const HEADING_RE = /^##\s+([A-Za-z0-9_]+)\s*$/;

export interface KbSection {
  /** null = texto antes del primer encabezado reconocido (se trata como GENERAL). */
  heading: string | null;
  body: string;
}

/**
 * `knownKeys` (normalmente ALL_SECTIONS.map(s => s.key)) decide qué líneas
 * `## ALGO` realmente abren una sección nueva. Sin este chequeo, un
 * encabezado mal escrito (`## Rrhh`) o inventado (`## FOOBAR`) abriría su
 * propia "sección" igual que uno válido, y como filterKnowledgeBase nunca la
 * encontraría en la lista de secciones permitidas de NADIE, ese contenido
 * quedaría invisible para todos — incluida la gente que sí debería verlo
 * porque en realidad pertenecía a la sección anterior. Verificar la clave
 * acá, no solo la forma "##  MAYUSCULAS", es lo que logra el comportamiento
 * real que se documenta: se pega a la sección abierta antes, hereda su
 * visibilidad, en vez de perderse.
 */
export function parseKnowledgeBase(markdown: string, knownKeys: string[]): KbSection[] {
  const known = new Set([...knownKeys, 'GENERAL']);
  const lines = (markdown || '').split('\n');
  const sections: KbSection[] = [];
  let current: KbSection = { heading: null, body: '' };

  for (const line of lines) {
    const match = line.match(HEADING_RE);
    if (match && known.has(match[1])) {
      sections.push(current);
      current = { heading: match[1], body: '' };
    } else {
      current.body += (current.body ? '\n' : '') + line;
    }
  }
  sections.push(current);

  return sections.filter((s) => s.body.trim().length > 0 || s.heading);
}

/** Encabezados `##` que no coincidieron con ninguna clave conocida — para avisar al admin al guardar. */
export function findUnknownHeadings(
  markdown: string,
  knownKeys: string[],
): string[] {
  const known = new Set([...knownKeys, 'GENERAL']);
  const unknown: string[] = [];
  for (const line of (markdown || '').split('\n')) {
    const match = line.match(HEADING_RE);
    if (match && !known.has(match[1])) unknown.push(match[1]);
  }
  return unknown;
}

/**
 * Filtra las secciones ya parseadas a las que el usuario puede ver.
 * GENERAL y el texto sin encabezado se incluyen siempre.
 */
export function filterKnowledgeBase(
  sections: KbSection[],
  allowedSectionKeys: string[],
): string {
  const allowed = new Set(allowedSectionKeys);
  return sections
    .filter(
      (s) => s.heading === null || s.heading === 'GENERAL' || allowed.has(s.heading),
    )
    .map((s) => (s.heading ? `## ${s.heading}\n${s.body}` : s.body))
    .join('\n\n')
    .trim();
}
