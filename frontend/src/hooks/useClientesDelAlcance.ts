import { useCallback, useState } from 'react';
import { getClientesDelAlcance } from '../services/ventas.service';

/**
 * Cuando el Dashboard lleva al Directorio o a Contratos con «mis clientes» (o con un vendedor), la lista se
 * limita a las empresas o personas de ese alcance, con la misma regla que usa el Dashboard para contarlas
 * (una oportunidad a su nombre, o el responsable que traía la empresa del sistema anterior).
 * `ids` es null cuando no hay límite. `quitar` lo levanta (el chip «Quitar» de la pantalla).
 */
export function useClientesDelAlcance() {
  const [alcance, setAlcance] = useState<string | null>(null);
  const [ids, setIds] = useState<Set<number> | null>(null);

  const aplicar = useCallback(async (nuevo: string | null) => {
    if (!nuevo || nuevo === 'all') {
      setAlcance(null);
      setIds(null);
      return;
    }
    try {
      const r = await getClientesDelAlcance(nuevo);
      setIds(r.ids ? new Set(r.ids) : null);
      setAlcance(r.ids ? nuevo : null);
    } catch {
      // Si no se pudo saber, la lista queda completa (mejor que vacía).
      setAlcance(null);
      setIds(null);
    }
  }, []);

  const quitar = useCallback(() => {
    setAlcance(null);
    setIds(null);
  }, []);

  return { alcance, ids, aplicar, quitar };
}
