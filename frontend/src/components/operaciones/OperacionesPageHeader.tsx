import type { ReactNode } from 'react';
import PageHeader from '../common/PageHeader';
import OperacionesComoFunciona, { type PantallaOperaciones } from './OperacionesComoFunciona';

/**
 * Encabezado de TODA pantalla de Operaciones: el <PageHeader> estándar con «Operaciones» como módulo
 * y, en las pantallas principales, el botón «Cómo funciona» siempre primero. Las pantallas de detalle
 * (un contrato, un horario, una bitácora…) no llevan ayuda: no pasan `pantalla`. Los botones propios
 * van en este orden: secundarios y, al final, el principal (`auth-btn`).
 */
export default function OperacionesPageHeader({
  title,
  description,
  actions,
  pantalla,
}: {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  /** Pantalla principal desde la que se abre la ayuda. Sin ella no hay botón «Cómo funciona». */
  pantalla?: PantallaOperaciones;
}) {
  return (
    <PageHeader
      eyebrow="Operaciones"
      title={title}
      description={description}
      actions={
        pantalla || actions ? (
          <>
            {pantalla && <OperacionesComoFunciona pantalla={pantalla} />}
            {actions}
          </>
        ) : undefined
      }
    />
  );
}
