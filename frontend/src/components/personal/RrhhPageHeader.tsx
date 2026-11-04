import type { ReactNode } from 'react';
import PageHeader from '../common/PageHeader';

/**
 * Encabezado de TODA pantalla de Recursos Humanos (2026-10-30): el <PageHeader> estándar con
 * «Recursos Humanos» siempre como módulo, el título, una frase que dice para qué sirve la pantalla y
 * los botones al pie a la derecha en este orden: secundarios primero y, al final, el principal
 * (`auth-btn`). Misma idea que CPPageHeader (Contratación Pública) y VentasPageHeader.
 */
export default function RrhhPageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return <PageHeader eyebrow="Recursos Humanos" title={title} description={description} actions={actions} />;
}
