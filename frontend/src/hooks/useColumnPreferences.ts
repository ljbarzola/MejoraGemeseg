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

  // Si la persona aplica un cambio antes de que llegue la respuesta del
  // servidor, esa respuesta (vieja) no debe pisar lo que acaba de elegir.
  const cambioLocal = useRef(false);

  const guardarCache = (next: string[]) => {
    try {
      localStorage.setItem(clave, JSON.stringify(next));
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
    return () => { vigente = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clave]);

  /** Aplica la lista completa. Devuelve false si no se pudo guardar en la cuenta. */
  const set = useCallback(async (next: string[]): Promise<boolean> => {
    cambioLocal.current = true;
    setVisible(next);
    guardarCache(next);
    try {
      await setUserPreference(clave, next);
      return true;
    } catch {
      return false;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clave]);

  return { visible, set };
}
