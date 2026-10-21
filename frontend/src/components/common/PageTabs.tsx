import type { ComponentType, ReactNode } from 'react';

export interface PageTab<T extends string = string> {
  key: T;
  label: ReactNode;
  /** Icono opcional de lucide-react. */
  icon?: ComponentType<{ size?: number }>;
  /** Texto de ayuda al pasar el mouse. */
  title?: string;
}

/**
 * Pestañas ESTÁNDAR de una pantalla (2026-10-20): el mismo `admin-tabs` de Oportunidades, Visitas y
 * Dashboard, siempre justo debajo del <PageHeader>, compactas (no estiradas al ancho) y con el mismo
 * margen. Úsalo en vez de repetir el bloque `admin-tabs` a mano.
 */
export default function PageTabs<T extends string>({
  tabs,
  value,
  onChange,
  label,
}: {
  tabs: PageTab<T>[];
  value: T;
  onChange: (key: T) => void;
  /** Nombre accesible del grupo de pestañas. */
  label: string;
}) {
  return (
    <div className="admin-tabs page-tabs" role="tablist" aria-label={label}>
      {tabs.map((t) => {
        const Icono = t.icon;
        return (
          <button
            key={t.key} type="button" role="tab" aria-selected={value === t.key} title={t.title}
            className={`admin-tab ${value === t.key ? 'active' : ''}`}
            onClick={() => onChange(t.key)}
          >
            {Icono && <Icono size={17} />}
            {t.label}
          </button>
        );
      })}
    </div>
  );
}
