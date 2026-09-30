import { useCallback, useEffect, useState } from 'react';

const ANCHO_MINIMO = 60;

/**
 * Hace redimensionables las columnas de una tabla: se arrastra la división
 * entre dos encabezados hacia la derecha o la izquierda. Estándar de la app:
 * TODA tabla de listado debería usarlo, porque los nombres de personas,
 * entidades y puestos varían mucho de largo y cada quien necesita ver
 * distinto.
 *
 * Cómo usarlo:
 *   const tablaRef = useResizableColumns('guardias');
 *   <table className="tasks-table resizable-table" ref={tablaRef}>
 *
 * Si las columnas de la tabla pueden cambiar en runtime (se agregan/quitan/
 * reordenan sin desmontar la tabla, ej. un picker de columnas visibles),
 * pasa además la lista de keys estables en su orden actual:
 *   const tablaRef = useResizableColumns('clientes', visibleColumns.map(c => c.key));
 * Sin este segundo argumento, los anchos se guardan por POSICIÓN (índice de
 * columna), que es más simple pero solo es correcto si el set de columnas
 * nunca cambia después del montaje — con columnas dinámicas, la instalación
 * de tiradores no se refresca cuando cambia el número de `<th>` (el efecto
 * solo depende de `[tabla, storageKey]`, no del contenido del `<thead>`), y
 * un ancho guardado bajo el índice 2 quedaría aplicado a la columna que hoy
 * ocupa esa posición, no a la que lo tenía cuando se guardó.
 *
 * Detalles que importan:
 *  - El ref es un CALLBACK, no un useRef. Con useRef el efecto corría al
 *    montar, cuando la tabla todavía no estaba en el DOM (la pantalla mostraba
 *    "Cargando..."), y los tiradores nunca llegaban a colocarse. Con callback
 *    ref el montaje de la tabla dispara la instalación, y también la
 *    reinstala si la tabla se desmonta y vuelve.
 *  - El ancho se guarda por tabla en el navegador y sobrevive a recargas. Es
 *    una comodidad por persona: si el almacenamiento falla (ventana privada)
 *    simplemente no se recuerda.
 *  - Arrastrar NO debe ordenar la columna: la tabla puede ser ordenable por
 *    clic en el encabezado (ver useSortableTable), así que el tirador corta
 *    la propagación del mousedown Y del click.
 *  - La última columna no lleva tirador: no hay nada a su derecha que ceder
 *    espacio, y arrastrarla solo desbordaba la tabla.
 *  - Doble clic en el tirador devuelve esa columna a su ancho automático.
 */
export function useResizableColumns(storageKey: string, columnKeys?: string[]) {
  const [tabla, setTabla] = useState<HTMLTableElement | null>(null);

  const ref = useCallback((node: HTMLTableElement | null) => {
    setTabla(node);
  }, []);

  // Con columnKeys, la identidad de cada columna es su key estable; sin él,
  // es su posición — igual que siempre.
  const idDeColumna = (index: number): string =>
    columnKeys && columnKeys[index] !== undefined ? columnKeys[index] : String(index);

  useEffect(() => {
    if (!tabla) return;

    const headers = Array.from(tabla.querySelectorAll('thead th'));
    if (headers.length < 2) return;

    const clave = `colwidths:${storageKey}`;

    const leerGuardado = (): Record<string, number> => {
      try {
        return JSON.parse(localStorage.getItem(clave) || '{}');
      } catch {
        return {};
      }
    };

    const guardar = (anchos: Record<string, number>) => {
      try {
        localStorage.setItem(clave, JSON.stringify(anchos));
      } catch {
        /* ventana privada o almacenamiento lleno: no se recuerda, y ya. */
      }
    };

    const anchos = leerGuardado();
    headers.forEach((th, index) => {
      const w = anchos[idDeColumna(index)];
      if (w && w >= ANCHO_MINIMO) (th as HTMLElement).style.width = `${w}px`;
    });

    const limpiadores: (() => void)[] = [];

    headers.forEach((th, index) => {
      if (index === headers.length - 1) return; // la última no se arrastra

      const el = th as HTMLElement;
      if (!el.style.position) el.style.position = 'relative';

      const tirador = document.createElement('span');
      tirador.className = 'col-resizer';
      tirador.setAttribute('aria-hidden', 'true');
      tirador.title = 'Arrastra para cambiar el ancho. Doble clic para restablecer.';
      el.appendChild(tirador);

      let xInicial = 0;
      let anchoInicial = 0;
      let arrastro = false;

      const onMove = (ev: MouseEvent) => {
        arrastro = true;
        const nuevo = Math.max(ANCHO_MINIMO, anchoInicial + (ev.clientX - xInicial));
        el.style.width = `${nuevo}px`;
      };

      const onUp = () => {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        document.body.style.userSelect = '';
        document.body.style.cursor = '';
        tabla.classList.remove('resizing');
        if (arrastro) {
          const actuales = leerGuardado();
          actuales[idDeColumna(index)] = el.getBoundingClientRect().width;
          guardar(actuales);
        }
      };

      const onDown = (ev: MouseEvent) => {
        ev.preventDefault();
        ev.stopPropagation();
        arrastro = false;
        xInicial = ev.clientX;
        anchoInicial = el.getBoundingClientRect().width;
        // Se fijan TODOS los anchos actuales antes de arrastrar: si no, al
        // fijar solo uno el navegador recalcula los demás y la tabla "salta".
        headers.forEach((otro) => {
          const o = otro as HTMLElement;
          if (!o.style.width) o.style.width = `${o.getBoundingClientRect().width}px`;
        });
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
        document.body.style.userSelect = 'none';
        document.body.style.cursor = 'col-resize';
        tabla.classList.add('resizing');
      };

      // Sin esto, soltar el tirador dispara el click del <th> y la tabla se
      // reordena cada vez que alguien ajusta un ancho.
      const onClick = (ev: MouseEvent) => {
        ev.preventDefault();
        ev.stopPropagation();
      };

      const onDobleClic = (ev: MouseEvent) => {
        ev.preventDefault();
        ev.stopPropagation();
        el.style.width = '';
        const actuales = leerGuardado();
        delete actuales[idDeColumna(index)];
        guardar(actuales);
      };

      tirador.addEventListener('mousedown', onDown);
      tirador.addEventListener('click', onClick);
      tirador.addEventListener('dblclick', onDobleClic);
      limpiadores.push(() => {
        tirador.removeEventListener('mousedown', onDown);
        tirador.removeEventListener('click', onClick);
        tirador.removeEventListener('dblclick', onDobleClic);
        tirador.remove();
      });
    });

    return () => limpiadores.forEach((fn) => fn());
    // eslint-disable-next-line react-hooks/exhaustive-deps -- idDeColumna se reconstruye cada render a propósito; lo que importa para reinstalar es la firma de columnas.
  }, [tabla, storageKey, columnKeys ? columnKeys.join(',') : '']);

  return ref;
}
