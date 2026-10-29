import { useMemo, useState, type ReactNode } from 'react';

export type SortDirection = 'asc' | 'desc';

/**
 * El orden de UNA columna, en la forma que lee el botón único de la cabecera (`<ColumnFilter orden={ordenDe('x')} />`):
 * qué dirección tiene hoy (o ninguna), cómo cambiarla y, si el A→Z no se entiende en esa columna (una etapa, un
 * estado), cómo se llaman las dos direcciones.
 */
export interface ControlOrden {
  campo: string;
  activo: SortDirection | null;
  fijar: (dir: SortDirection | null) => void;
  etiquetas?: [string, string];
}

/**
 * Ordenamiento por columna para tablas de listado. Estándar de la app: toda
 * tabla de listado debería poder ordenarse haciendo clic en su encabezado,
 * igual que el listado de tareas del Inicio (de donde viene este patrón).
 *
 * Cómo usarlo:
 *   const { filas, thProps, SortIcon } = useSortableTable(datos, {
 *     apellidos: (r) => r.apellidos,
 *     cedula:    (r) => r.cedula,
 *   }, 'apellidos');
 *
 *   <th {...thProps('apellidos')}>Apellidos <SortIcon campo="apellidos" /></th>
 *   {filas.map(...)}
 *
 * Detalles:
 *  - Un clic ordena ascendente; otro clic en la misma columna invierte.
 *  - Los valores se comparan con `localeCompare` cuando son texto, para que
 *    las tildes y la ñ queden donde corresponde en español.
 *  - Los vacíos van siempre al final, sin importar la dirección: una fila sin
 *    dato no debería adelantarse a las que sí lo tienen.
 */
export function useSortableTable<T>(
  filasOriginales: T[],
  campos: Record<string, (fila: T) => string | number | null | undefined>,
  campoInicial?: string,
  direccionInicial: SortDirection = 'asc',
) {
  const [campo, setCampo] = useState<string | null>(campoInicial ?? null);
  const [direccion, setDireccion] = useState<SortDirection>(direccionInicial);

  const ordenar = (nuevo: string) => {
    if (campo === nuevo) {
      setDireccion((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setCampo(nuevo);
      setDireccion('asc');
    }
  };

  /** Fija el orden de una columna a una dirección, o lo quita (null) si era la que estaba ordenando. */
  const fijarOrden = (c: string, dir: SortDirection | null) => {
    if (dir === null) {
      if (campo === c) setCampo(null);
      return;
    }
    setCampo(c);
    setDireccion(dir);
  };
  const ordenDe = (c: string, etiquetas?: [string, string]): ControlOrden => ({
    campo: c,
    activo: campo === c ? direccion : null,
    fijar: (dir) => fijarOrden(c, dir),
    etiquetas,
  });

  const filas = useMemo(() => {
    if (!campo || !campos[campo]) return filasOriginales;
    const obtener = campos[campo];
    const vacio = (v: unknown) => v === null || v === undefined || v === '';

    return [...filasOriginales].sort((a, b) => {
      const va = obtener(a);
      const vb = obtener(b);

      // Los vacíos siempre al final, en las dos direcciones.
      if (vacio(va) && vacio(vb)) return 0;
      if (vacio(va)) return 1;
      if (vacio(vb)) return -1;

      let cmp: number;
      if (typeof va === 'number' && typeof vb === 'number') {
        cmp = va - vb;
      } else {
        cmp = String(va).localeCompare(String(vb), 'es', { sensitivity: 'base' });
      }
      return direccion === 'asc' ? cmp : -cmp;
    });
  }, [filasOriginales, campo, direccion, campos]);

  const SortIcon = ({ campo: c }: { campo: string }): ReactNode => {
    if (campo !== c) return <span className="sort-icon">⇅</span>;
    return <span className="sort-icon sort-active">{direccion === 'asc' ? '↑' : '↓'}</span>;
  };

  /** Props para el <th>: lo hace clicable y accesible por teclado. */
  const thProps = (c: string) => ({
    className: 'sortable-th',
    onClick: () => ordenar(c),
    role: 'button' as const,
    tabIndex: 0,
    'aria-sort': (campo === c
      ? direccion === 'asc'
        ? 'ascending'
        : 'descending'
      : 'none') as 'ascending' | 'descending' | 'none',
    onKeyDown: (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        ordenar(c);
      }
    },
  });

  return { filas, thProps, SortIcon, campo, direccion, ordenDe };
}
