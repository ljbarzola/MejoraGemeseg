import type { ReactNode } from 'react';
import PageHeader from '../common/PageHeader';
import CPComoFunciona, { type PantallaCP } from './CPComoFunciona';

/**
 * Encabezado de TODA pantalla de Contratación Pública (2026-10-30): el <PageHeader> estándar con
 * «Contratación Pública» como módulo y, en las pantallas principales, el botón «Cómo funciona»
 * siempre primero. Las pantallas de detalle (una entidad, un contrato, una bitácora…) no llevan
 * ayuda: no pasan `pantalla`. Los botones propios van en este orden: secundarios y, al final,
 * el principal (`auth-btn`).
 */
export default function CPPageHeader({
  title,
  description,
  actions,
  pantalla,
}: {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  /** Pantalla principal desde la que se abre la ayuda. Sin ella no hay botón «Cómo funciona». */
  pantalla?: PantallaCP;
}) {
  return (
    <PageHeader
      eyebrow="Contratación Pública"
      title={title}
      description={description}
      actions={
        pantalla || actions ? (
          <>
            {pantalla && <CPComoFunciona pantalla={pantalla} />}
            {actions}
          </>
        ) : undefined
      }
    />
  );
}
