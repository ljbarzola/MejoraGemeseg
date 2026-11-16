import type { TurnoPuesto } from '../../../types/contratacion-publica';

/** «Día 07:00–19:00 · 2, Noche 19:00–07:00 · 1» (vacío si el puesto no tiene turnos definidos). */
export function textoTurnos(turnos: TurnoPuesto[] | null | undefined): string {
  if (!turnos?.length) return '';
  return turnos
    .map((t) => `${t.nombre}${t.horaInicio && t.horaFin ? ` ${t.horaInicio}–${t.horaFin}` : ''} · ${t.guardias}`)
    .join(', ');
}

/** Turnos de partida según la jornada elegida, para no empezar con la lista vacía. */
export function turnosSugeridos(jornada: string): TurnoPuesto[] {
  if (jornada === '8H') {
    return [
      { nombre: 'Mañana', horaInicio: '06:00', horaFin: '14:00', guardias: 1 },
      { nombre: 'Tarde', horaInicio: '14:00', horaFin: '22:00', guardias: 1 },
      { nombre: 'Noche', horaInicio: '22:00', horaFin: '06:00', guardias: 1 },
    ];
  }
  if (jornada === '24H') return [{ nombre: '24 horas', horaInicio: '07:00', horaFin: '07:00', guardias: 1 }];
  return [
    { nombre: 'Día', horaInicio: '07:00', horaFin: '19:00', guardias: 1 },
    { nombre: 'Noche', horaInicio: '19:00', horaFin: '07:00', guardias: 1 },
  ];
}
