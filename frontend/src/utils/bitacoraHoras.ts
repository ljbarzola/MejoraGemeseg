// Textos y colores del tiempo extra (bolsa de horas de la Bitácora).

/** Cómo terminó la ventana de tiempo extra. */
export function textoCierre(cierre: string | null): string {
  switch (cierre) {
    case 'MANUAL':
      return 'Terminado por la persona';
    case 'INACTIVIDAD':
      return 'Se cerró sola por inactividad';
    case 'HORARIO':
      return 'Se cerró al empezar el horario';
    case 'LIMITE':
      return 'Se cerró por llegar al tope de 8 horas';
    default:
      return 'En curso';
  }
}

export function textoEstadoExtra(estado: string): string {
  switch (estado) {
    case 'PENDIENTE':
      return 'Espera aprobación';
    case 'APROBADA':
      return 'Aprobado';
    case 'RECHAZADA':
      return 'Rechazado';
    case 'SIN_TIEMPO':
      return 'No suma (menos de la tolerancia)';
    default:
      return estado;
  }
}

/** Clase de la etiqueta (`bit-fuente`) según el estado. */
export function claseEstadoExtra(estado: string): string {
  switch (estado) {
    case 'APROBADA':
      return 'bit-fuente-app';
    case 'PENDIENTE':
      return 'bit-fuente-google';
    case 'RECHAZADA':
      return 'bit-fuente-web';
    default:
      return 'bit-fuente-inactiva';
  }
}

// ───────────────────────── Anotaciones de la persona ─────────────────────────

export const TIPOS_NOTA: { valor: string; etiqueta: string }[] = [
  { valor: 'REUNION', etiqueta: 'Reunión' },
  { valor: 'VISITA', etiqueta: 'Visita' },
  { valor: 'SIN_COMPUTADOR', etiqueta: 'Trabajo sin computador' },
  { valor: 'OTRO', etiqueta: 'Otro' },
];

export const etiquetaTipoNota = (tipo: string): string =>
  TIPOS_NOTA.find((t) => t.valor === tipo)?.etiqueta ?? 'Otro';
