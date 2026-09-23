export function conUnidad(cantidad: number, singular: string, plural: string): string {
  const n = Number(cantidad);
  return `${n} ${n === 1 ? singular : plural}`;
}
