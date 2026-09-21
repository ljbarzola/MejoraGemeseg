// Formato compartido para "Última sincronización: ..." en cualquier pantalla
// con un botón de sincronizar (Reclutamiento, Guardias, Personal
// Administrativo, y las que se agreguen a futuro) — misma regla en todas.
export function formatFechaHoraSync(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('es-EC', { dateStyle: 'medium', timeStyle: 'short' });
}
