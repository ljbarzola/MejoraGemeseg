// 593969135744 -> «+593 96 913 5744» (Ecuador); otros países se muestran como +<dígitos>.
export function numeroLegible(numero: string | null | undefined): string {
  const d = (numero || '').replace(/\D/g, '');
  if (!d) return '';
  const ec = /^593(\d{2})(\d{3})(\d{4})$/.exec(d);
  return ec ? `+593 ${ec[1]} ${ec[2]} ${ec[3]}` : `+${d}`;
}
