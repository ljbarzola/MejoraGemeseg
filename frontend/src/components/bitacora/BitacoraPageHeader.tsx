import type { ReactNode } from 'react';
import PageHeader from '../common/PageHeader';

/** Encabezado de TODA pantalla de la Bitácora: el <PageHeader> estándar con «Bitácora» como módulo. */
export default function BitacoraPageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return <PageHeader eyebrow="Bitácora" title={title} description={description} actions={actions} />;
}
