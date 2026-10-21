import type { ReactNode } from 'react';
import PageHeader from '../common/PageHeader';
import VentasComoFunciona from './VentasComoFunciona';

/**
 * Encabezado de TODA pantalla de Ventas y CRM: el <PageHeader> estándar con «Ventas y CRM» como módulo y el
 * botón «Cómo funciona» siempre primero (es el mismo en todas las pantallas, así se encuentra en el mismo
 * sitio). Una pantalla con su propia ayuda pasa `ayuda`; sin ayuda, `ayuda={null}`.
 */
export default function VentasPageHeader({
  title,
  description,
  actions,
  ayuda,
}: {
  title: string;
  description?: ReactNode;
  /** Botones propios de la pantalla: secundarios primero y el principal (`auth-btn`) al final. */
  actions?: ReactNode;
  /** Reemplaza al «Cómo funciona» general. `null` = sin botón de ayuda. */
  ayuda?: ReactNode;
}) {
  return (
    <PageHeader
      eyebrow="Ventas y CRM"
      title={title}
      description={description}
      actions={
        <>
          {ayuda === undefined ? <VentasComoFunciona /> : ayuda}
          {actions}
        </>
      }
    />
  );
}
