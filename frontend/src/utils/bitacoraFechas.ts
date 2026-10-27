// Los días de la Bitácora son días de Ecuador (UTC-5, sin horario de verano), igual que en el servidor.
export const ZONA_ECUADOR = 'America/Guayaquil';
const DESFASE_MS = 5 * 3_600_000;

/** Día (AAAA-MM-DD) que marca hoy el reloj de Ecuador, sin depender de la zona del computador. */
export function hoyEcuador(): string {
  return new Date(Date.now() - DESFASE_MS).toISOString().slice(0, 10);
}

export function sumarDias(fecha: string, dias: number): string {
  const d = new Date(`${fecha}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

/** «08:12», en hora de Ecuador. */
export function hora(iso: string): string {
  return new Date(iso).toLocaleTimeString('es-EC', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: ZONA_ECUADOR,
  });
}

/** «Hoy, 08:12» o «Martes, 27 de octubre de 2026, 08:12», en hora de Ecuador. */
export function instanteLegible(iso: string): string {
  const dia = new Date(new Date(iso).getTime() - DESFASE_MS).toISOString().slice(0, 10);
  return dia === hoyEcuador() ? `Hoy, ${hora(iso)}` : `${fechaLarga(dia)}, ${hora(iso)}`;
}

/** 45 → «45 min»; 130 → «2 h 10 min». */
export function duracion(minutos: number): string {
  if (minutos < 60) return `${minutos} min`;
  const h = Math.floor(minutos / 60);
  const m = minutos % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}

/** «Martes, 27 de octubre de 2026». */
export function fechaLarga(fecha: string): string {
  const texto = new Date(`${fecha}T12:00:00Z`).toLocaleDateString('es-EC', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}
