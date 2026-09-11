import type { CSSProperties } from 'react';

// Color de marca real de la empresa (blanco-etiquetable por compañía), el
// mismo que usa el sidebar — evita repetir un navy fijo distinto por archivo.
export const PRIMARY = 'var(--azul-oscuro)';

// Título para pantallas "de trabajo" (detalle de contrato) que muestran el
// título junto a un botón de volver y un badge de estado en una sola barra,
// a diferencia de las pantallas de lista que usan el patrón .page-header-row.
export const subPageTitle: CSSProperties = {
  margin: 0,
  fontSize: 18,
  fontWeight: 700,
  color: '#1e293b',
};
