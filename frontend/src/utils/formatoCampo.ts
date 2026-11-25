// Formatos de la pantalla de campo y de las secciones de fotos/recorrido de Custodias. Las horas son de Ecuador.

const ZONA = 'America/Guayaquil';

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 MB';
  const gb = bytes / 1024 ** 3;
  if (gb >= 1) return `${gb.toFixed(2)} GB`;
  const mb = bytes / 1024 ** 2;
  return `${mb < 10 ? mb.toFixed(1) : Math.round(mb)} MB`;
}

export function fechaEC(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat('es-EC', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: ZONA }).format(d);
}

export function horaEC(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat('es-EC', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: ZONA }).format(d);
}

export function fechaHoraEC(iso?: string | null): string {
  if (!iso) return '—';
  return `${fechaEC(iso)} ${horaEC(iso)}`;
}

/** Enlace al mapa de OpenStreetMap del punto donde se tomó algo. */
export function urlMapa(lat: number, lng: number): string {
  return `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=16/${lat}/${lng}`;
}

/** Quita lo que no sea dígito: para el teléfono de `tel:`. */
export const telefonoLlamable = (t: string): string => t.replace(/[^\d+]/g, '');
