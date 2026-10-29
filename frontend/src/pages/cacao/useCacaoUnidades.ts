import { useCallback, useEffect, useState } from 'react';
import { getUnitConfig } from '../../services/cacao.service';

export interface UnidadConfig {
  id: number;
  name: string;
  displayName: string;
  kgPerUnit: number;
  isDefault: boolean;
}

/** Etiquetas de las unidades de medida (universales, no dependen de la empresa). */
export const ABREVIATURA_UNIDAD: Record<string, string> = { TON: 'T', KG: 'kg', SACO: 'sacos', QQ: 'qq' };
export const NOMBRE_UNIDAD: Record<string, string> = { TON: 'Toneladas', KG: 'Kilogramos', SACO: 'Sacos', QQ: 'Quintales' };

/** Un quintal son 100 libras (0,45359237 kg cada una). Universal, como la tonelada: la empresa no lo configura. */
export const KG_POR_QUINTAL = 45.359237;

/**
 * Pesos por unidad de la EMPRESA (línea blanca). Toneladas, quintales y kilos son universales; lo que pesa un
 * saco lo define cada empresa en Cacao → Configuración → Unidades de medida. Antes cada pantalla
 * asumía 69 kg a mano. Mientras la empresa no configure su saco, `factor('SACO')` devuelve `null`
 * y las pantallas muestran el peso en kg en vez de inventar una conversión.
 */
export function useCacaoUnidades() {
  const [configs, setConfigs] = useState<UnidadConfig[]>([]);
  const [cargado, setCargado] = useState(false);

  useEffect(() => {
    getUnitConfig()
      .then(setConfigs)
      .catch(() => setConfigs([]))
      .finally(() => setCargado(true));
  }, []);

  const kgPorSaco = configs.find((c) => c.isDefault)?.kgPerUnit ?? null;

  /** Kilos que pesa una unidad; `null` si es saco y la empresa aún no lo configuró. */
  const factor = useCallback(
    (unidad: string | null | undefined): number | null => {
      if (!unidad || unidad === 'KG') return 1;
      if (unidad === 'TON') return 1000;
      if (unidad === 'QQ') return KG_POR_QUINTAL;
      if (unidad === 'SACO') return kgPorSaco;
      return 1;
    },
    [kgPorSaco],
  );

  return { configs, cargado, kgPorSaco, factor };
}
