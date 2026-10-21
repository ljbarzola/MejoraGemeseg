import { useCallback, useEffect, useRef, useState } from 'react';
import { getUserPreference, setUserPreference } from '../services/user.service';

/**
 * Qué columnas de una tabla ve cada persona, y en qué orden — preferencia
 * personal guardada en SU CUENTA (tabla UserPreference), así la conserva en
 * cualquier navegador o computador. Mismo espíritu que useResizableColumns
 * (ancho de columnas), pero ese sí es por navegador.
 *
 * localStorage se usa solo como caché: la tabla arranca con el último valor
 * conocido sin esperar al servidor (sin parpadeo) y sigue funcionando si el
 * servidor no responde. Cuando llega el valor de la cuenta, manda ese.
 *
 * Las columnas que SIEMPRE deben verse (ej. Nombre, Acciones) no pasan por
 * este hook: el llamador las renderiza fijas al principio/final de la tabla
 * y solo le pasa a este hook las columnas que sí son elegibles para
 * mostrar/ocultar/reordenar.
 *
 * `set` reemplaza la lista completa de una vez: lo usa el botón "Aplicar" de
 * ColumnPickerMenu, que edita un borrador y recién ahí cambia la tabla.
 *
 * COLUMNAS FIJAS (2026-10-20). La columna principal (la que el llamador
 * renderiza siempre primera) queda fija al desplazar la tabla de lado, y cada
 * persona puede fijar además UNA columna elegible, hasta 2 fijas en total (así
 * lo decidió la usuaria). Las fijas van pegadas a la izquierda: `visible` ya
 * devuelve las elegibles con la fijada primero, así que las pantallas no
 * reordenan nada; solo ponen `data-fijas={columnPrefs.fijas}` en la <table> (el
 * CSS de utils/tablasVivas.ts hace el resto) y `pinned={columnPrefs.pinned}` en
 * ColumnPickerMenu. `columnasBase` es cuántas columnas FIJAS renderiza ya la
 * pantalla antes de las elegibles (1 por defecto; 2 si abre con «#» y «Título»).
 */
const MAX_FIJAS = 2;

export function useColumnPreferences(
  storageKey: string,
  defaultVisibleKeys: string[],
  opciones: { columnasBase?: number } = {},
) {
  const clave = `columnas:${storageKey}`;
  // Mismo prefijo `columnas:` a propósito: el servidor solo acepta prefijos de una lista cerrada
  // (set-preference.dto.ts) y así no hace falta tocar el backend para guardar las fijas.
  const claveFijas = `columnas:${storageKey}-fijas`;
  const columnasBase = opciones.columnasBase ?? 1;
  const maxExtras = Math.max(0, MAX_FIJAS - columnasBase);

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

  const [fijadas, setFijadas] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem(claveFijas);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed.slice(0, maxExtras);
      }
    } catch {
      /* igual que arriba */
    }
    return [];
  });

  // Si la persona aplica un cambio antes de que llegue la respuesta del
  // servidor, esa respuesta (vieja) no debe pisar lo que acaba de elegir.
  const cambioLocal = useRef(false);

  const guardarCache = (next: string[], key = clave) => {
    try {
      localStorage.setItem(key, JSON.stringify(next));
    } catch {
      /* no se recuerda en este navegador, y ya */
    }
  };

  useEffect(() => {
    let vigente = true;
    getUserPreference(clave)
      .then((valor) => {
        if (!vigente || cambioLocal.current || !Array.isArray(valor)) return;
        setVisible(valor);
        guardarCache(valor);
      })
      .catch(() => {
        /* sin respuesta del servidor: se queda con el caché local o el default */
      });
    getUserPreference(claveFijas)
      .then((valor) => {
        if (!vigente || cambioLocal.current || !Array.isArray(valor)) return;
        const fijas = valor.slice(0, maxExtras);
        setFijadas(fijas);
        guardarCache(fijas, claveFijas);
      })
      .catch(() => { /* idem */ });
    return () => { vigente = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clave]);

  /**
   * Aplica la lista completa (y, si se pasa, la columna fijada). Devuelve false si
   * no se pudo guardar en la cuenta.
   */
  const set = useCallback(async (next: string[], nuevasFijas?: string[]): Promise<boolean> => {
    cambioLocal.current = true;
    // Una fijada que ya no está visible deja de estar fijada.
    const fijasFinales = (nuevasFijas ?? fijadas).filter((k) => next.includes(k)).slice(0, maxExtras);
    setVisible(next);
    setFijadas(fijasFinales);
    guardarCache(next);
    guardarCache(fijasFinales, claveFijas);
    try {
      await Promise.all([
        setUserPreference(clave, next),
        setUserPreference(claveFijas, fijasFinales),
      ]);
      return true;
    } catch {
      return false;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clave, fijadas, maxExtras]);

  // Las fijadas (que sigan visibles) van primero; el resto conserva su orden.
  const pinned = fijadas.filter((k) => visible.includes(k));
  const visibleOrdenadas = [...pinned, ...visible.filter((k) => !pinned.includes(k))];

  return {
    visible: visibleOrdenadas,
    set,
    /** Columnas elegibles fijadas por la persona (ya van primero en `visible`). */
    pinned,
    /** Cuántas fijadas extra admite esta tabla (2 en total, menos las que ya fija la pantalla). */
    maxPinned: maxExtras,
    /** Valor para `data-fijas` de la <table>. */
    fijas: columnasBase + pinned.length,
  };
}
