import { useState } from 'react';

/**
 * Qué columnas de una tabla ve cada persona, y en qué orden — preferencia
 * personal guardada en el navegador (localStorage), no en la base de datos.
 * Mismo espíritu que useResizableColumns (ancho de columnas): cada quien
 * ajusta su propia vista, si el almacenamiento falla simplemente no se
 * recuerda.
 *
 * Las columnas que SIEMPRE deben verse (ej. Nombre, Acciones) no pasan por
 * este hook: el llamador las renderiza fijas al principio/final de la tabla
 * y solo le pasa a este hook las columnas que sí son elegibles para
 * mostrar/ocultar/reordenar.
 */
export function useColumnPreferences(
  storageKey: string,
  defaultVisibleKeys: string[],
) {
  const clave = `columnas:${storageKey}`;

  // No se filtra contra la lista de columnas disponibles acá: esa lista
  // depende de datos que llegan async (los campos de la empresa), así que
  // en el primer render todavía no se conocen — filtrar acá descartaría
  // "email"/"phone" del default antes de que los campos terminen de cargar.
  // Quien pinta la tabla ya descarta con seguridad cualquier key que ya no
  // exista (campo personalizado borrado), así que no hace falta hacerlo acá.
  const [visible, setVisible] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem(clave);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {
      /* localStorage no disponible (ventana privada) o dato corrupto */
    }
    return defaultVisibleKeys;
  });

  const persist = (next: string[]) => {
    setVisible(next);
    try {
      localStorage.setItem(clave, JSON.stringify(next));
    } catch {
      /* no se recuerda, y ya */
    }
  };

  const toggle = (key: string) => {
    persist(visible.includes(key) ? visible.filter((k) => k !== key) : [...visible, key]);
  };

  const move = (key: string, direction: -1 | 1) => {
    const idx = visible.indexOf(key);
    if (idx === -1) return;
    const swapIdx = idx + direction;
    if (swapIdx < 0 || swapIdx >= visible.length) return;
    const next = [...visible];
    [next[idx], next[swapIdx]] = [next[swapIdx], next[idx]];
    persist(next);
  };

  const reset = () => persist(defaultVisibleKeys);

  return { visible, toggle, move, reset };
}
