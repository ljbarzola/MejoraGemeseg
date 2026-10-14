// 'YYYY-MM-DDT...' (una columna DATE llega como medianoche UTC) -> 'dd/mm/aaaa'
// sin pasar por Date, para que el día no se corra por zona horaria.
export function diaCorto(iso?: string | null): string {
  if (!iso) return '';
  const [y, m, d] = iso.slice(0, 10).split('-');
  return y && m && d ? `${d}/${m}/${y}` : '';
}

export const aInputDia = (iso?: string | null): string => (iso ? iso.slice(0, 10) : '');

export function vigenciaTexto(inicio: string, fin?: string | null): string {
  return `${diaCorto(inicio)} → ${fin ? diaCorto(fin) : 'sin fecha de fin'}`;
}
