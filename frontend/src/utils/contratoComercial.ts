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

// 'YYYY-MM-DD' de hoy en Ecuador (UTC-5), igual que hoyEcuador del servidor, para
// comparar con las fechas de un contrato sin que la zona horaria del navegador
// corra el día.
export const hoyEcuador = (): string =>
  new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString().slice(0, 10);

// Texto explícito de un contrato para mensajes: «Título» de Empresa (del 01/01/2026 al 31/12/2026).
// Así nadie tiene que adivinar de cuál contrato habla un aviso.
export function describirContrato(c: {
  id: number;
  title?: string | null;
  kind?: string;
  salesClient: { name: string };
  startDate: string;
  endDate?: string | null;
}): string {
  const producto = c.kind === 'PRODUCTO';
  const nombre = c.title ? `«${c.title}»` : producto ? `venta #${c.id}` : `contrato #${c.id}`;
  const fechas = producto
    ? `el ${diaCorto(c.startDate)}`
    : c.endDate
      ? `del ${diaCorto(c.startDate)} al ${diaCorto(c.endDate)}`
      : `desde el ${diaCorto(c.startDate)}, sin fecha de fin`;
  return `${producto ? 'la venta' : 'el contrato'} ${nombre} de ${c.salesClient.name} (${fechas})`;
}
