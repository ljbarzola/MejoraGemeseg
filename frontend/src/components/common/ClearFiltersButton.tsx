import { Broom } from 'lucide-react';

/**
 * Botón estándar de "limpiar filtros". ÚSALO SIEMPRE en vez de armar uno a
 * mano, para que se vea y se comporte igual en todas las pantallas.
 *
 * Dos decisiones que no hay que deshacer:
 *  - Solo el ícono, sin texto: un botón con texto cambia de ancho según el
 *    idioma y el contenido, y eso movía de sitio a los botones vecinos.
 *  - SIEMPRE visible, deshabilitado cuando no hay nada que limpiar. Antes
 *    aparecía y desaparecía, y al aparecer empujaba "Exportar" a la línea de
 *    abajo. Ver la sección LAYOUT ESTABLE en styles.css.
 */
export default function ClearFiltersButton({
  onClear,
  disabled,
  title = 'Limpiar filtros',
}: {
  onClear: () => void;
  /** true cuando no hay ningún filtro aplicado. */
  disabled: boolean;
  title?: string;
}) {
  return (
    <button
      type="button"
      className="btn-secondary icon-btn"
      onClick={onClear}
      disabled={disabled}
      title={disabled ? 'No hay filtros aplicados' : title}
      aria-label={title}
    >
      <Broom size={16} />
    </button>
  );
}
