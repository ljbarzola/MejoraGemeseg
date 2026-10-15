// Estadísticas del dashboard de Ventas. Se usan mediana y percentil 75, no
// promedios: un solo cliente que tardó seis meses en responder arruinaría un
// promedio. Toda cifra viaja con su `n` (cuántos casos se midieron) y se marca
// «pocas muestras» cuando son menos de MIN_MUESTRAS, para no presentar como
// tendencia lo que son dos casos.

export const MIN_MUESTRAS = 5;
const DIA_MS = 24 * 60 * 60 * 1000;

export const diasEntre = (desde: Date, hasta: Date): number =>
  (hasta.getTime() - desde.getTime()) / DIA_MS;

// Percentil por interpolación lineal. null si no hay datos.
export function percentil(valores: number[], p: number): number | null {
  if (valores.length === 0) return null;
  const orden = [...valores].sort((a, b) => a - b);
  if (orden.length === 1) return orden[0];
  const pos = (p / 100) * (orden.length - 1);
  const bajo = Math.floor(pos);
  const alto = Math.ceil(pos);
  return orden[bajo] + (orden[alto] - orden[bajo]) * (pos - bajo);
}

export const mediana = (valores: number[]): number | null =>
  percentil(valores, 50);

export interface ResumenMuestra {
  n: number;
  mediana: number | null;
  p75: number | null;
  pocasMuestras: boolean;
}

const redondear = (v: number | null): number | null =>
  v === null ? null : Math.round(v * 10) / 10;

export function resumirMuestra(valores: number[]): ResumenMuestra {
  return {
    n: valores.length,
    mediana: redondear(mediana(valores)),
    p75: redondear(percentil(valores, 75)),
    pocasMuestras: valores.length < MIN_MUESTRAS,
  };
}

export interface CambioParaMetricas {
  toStatus: string;
  createdAt: Date;
}

// Primera vez que la oportunidad entró a una etapa. Sirve para el tiempo hasta
// cotizar y para la conversión entre etapas (que cuenta quién ALCANZÓ cada una).
export function primeraEntrada(
  cambios: CambioParaMetricas[],
  etapa: string,
): Date | null {
  let primera: Date | null = null;
  for (const c of cambios) {
    if (c.toStatus !== etapa) continue;
    if (!primera || c.createdAt < primera) primera = c.createdAt;
  }
  return primera;
}

// Conversión entre etapas consecutivas del embudo: de las oportunidades que
// alcanzaron la etapa N, cuántas alcanzaron la N+1. `etapas` va en el orden del
// embudo. Una oportunidad que se salta una etapa cuenta como que la alcanzó
// (haber llegado a una posterior implica haber pasado por las anteriores).
export interface PasoEmbudo {
  etapa: string;
  alcanzaron: number;
  convirtieron: number | null; // null en la última etapa
  tasa: number | null;
}

export function conversionEmbudo(
  etapas: string[],
  oportunidades: { posicionMaxima: number }[],
): PasoEmbudo[] {
  return etapas.map((etapa, i) => {
    const alcanzaron = oportunidades.filter((o) => o.posicionMaxima >= i).length;
    if (i === etapas.length - 1) {
      return { etapa, alcanzaron, convirtieron: null, tasa: null };
    }
    const convirtieron = oportunidades.filter(
      (o) => o.posicionMaxima >= i + 1,
    ).length;
    return {
      etapa,
      alcanzaron,
      convirtieron,
      tasa:
        alcanzaron === 0
          ? null
          : Math.round((convirtieron / alcanzaron) * 1000) / 10,
    };
  });
}
