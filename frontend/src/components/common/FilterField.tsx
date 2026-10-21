import type { ReactNode } from 'react';

// Un filtro con su nombre visible encima: así se lee QUÉ filtra aunque la opción
// elegida sea solo «Todos». El select adentro se ensancha lo que necesite (hasta
// 240px) y no recorta su texto; ver .filter-field en styles.css.
export default function FilterField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="filter-field">
      <span className="filter-field-label">{label}</span>
      {children}
    </label>
  );
}
