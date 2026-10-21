import type { ReactNode } from 'react';

/**
 * Encabezado ESTÁNDAR de una pantalla (2026-10-20): nombre del módulo, título, descripción y botones, siempre
 * en el mismo orden y lugar. Úsalo en vez de armar `.page-title-row` a mano en cada pantalla:
 *
 *   <PageHeader eyebrow="Ventas y CRM" title="Oportunidades" description="Cada negociación…"
 *     actions={<><button className="btn-secondary">…</button><button className="auth-btn">+ Nueva</button></>} />
 *
 * Reglas que ya trae (ver CLAUDE.md, «Header buttons sit at the FOOT of the title»):
 *  - el nombre del módulo va pegado al título, y la descripción justo debajo, dentro del mismo bloque;
 *  - los botones van a la derecha y al PIE del título, nunca en la esquina de arriba (la campana de
 *    notificaciones es fija ahí y los tapaba);
 *  - orden de los botones: ayuda → secundarios → el principal (el único `auth-btn`) siempre al final.
 * Las pestañas de la pantalla van justo debajo, con <PageTabs>.
 */
export default function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  /** Nombre del módulo, encima del título (ej. «Ventas y CRM»). */
  eyebrow?: string;
  title: string;
  /** Una o dos frases que dicen para qué sirve la pantalla. */
  description?: ReactNode;
  /** Botones, ya en su orden: ayuda → secundarios → principal. */
  actions?: ReactNode;
}) {
  return (
    <div className="page-title-row">
      <div>
        {eyebrow && <p className="page-eyebrow">{eyebrow}</p>}
        <h1>{title}</h1>
        {description && <p className="page-title-help">{description}</p>}
      </div>
      {actions && <div className="header-actions">{actions}</div>}
    </div>
  );
}
