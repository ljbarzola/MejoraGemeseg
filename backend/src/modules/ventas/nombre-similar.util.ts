// Aviso de posible empresa/persona duplicada en el Directorio (Fase 2 del CRM,
// 2026-10-18). No es un match exacto (eso ya lo cubre `coincidencias` por
// correo/teléfono/RUC): es un aviso blando por nombre parecido, para que la
// persona de Ventas decida si es la misma o no — nunca bloquea el guardado.
// Sin dependencias ni extensión de Postgres (pg_trgm no está habilitada):
// coeficiente de Dice sobre bigramas de caracteres, igual de barato que
// recorrer en JS lo que ya hace `coincidencias`.

export function normalizarNombreEmpresa(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function bigramas(s: string): string[] {
  const t = s.replace(/\s+/g, ' ');
  if (t.length < 2) return t ? [t] : [];
  const out: string[] = [];
  for (let i = 0; i < t.length - 1; i++) out.push(t.slice(i, i + 2));
  return out;
}

// Coeficiente de Dice: 1 = idéntico, 0 = nada en común.
export function similitudNombres(a: string, b: string): number {
  const na = normalizarNombreEmpresa(a);
  const nb = normalizarNombreEmpresa(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  const ba = bigramas(na);
  const bb = bigramas(nb);
  if (ba.length === 0 || bb.length === 0) return 0;
  const cuenta = new Map<string, number>();
  for (const g of ba) cuenta.set(g, (cuenta.get(g) ?? 0) + 1);
  let comunes = 0;
  for (const g of bb) {
    const restante = cuenta.get(g) ?? 0;
    if (restante > 0) {
      comunes++;
      cuenta.set(g, restante - 1);
    }
  }
  return (2 * comunes) / (ba.length + bb.length);
}

export const UMBRAL_NOMBRE_PARECIDO = 0.6;

// De una lista de candidatos (otros clientes de la misma empresa), los que
// parecen el mismo nombre. Ordenado del más parecido al menos. Excluye el
// propio id cuando se edita un cliente existente.
export function nombresParecidos<T extends { id: number; name: string }>(
  nombre: string,
  candidatos: T[],
  excluirId?: number,
  umbral = UMBRAL_NOMBRE_PARECIDO,
): T[] {
  return candidatos
    .filter((c) => c.id !== excluirId)
    .map((c) => ({ c, s: similitudNombres(nombre, c.name) }))
    .filter(({ s }) => s >= umbral && s < 1)
    .sort((a, b) => b.s - a.s)
    .map(({ c }) => c);
}
