// Estadísticas de la actividad que dejan las hojas: rondas, ingresos de personas, vehículos y los ingresos que la
// hoja anota como «sin autorización» (la novedad más frecuente según Operaciones). Se cuenta a partir de las
// novedades ya leídas y de su categoría; lo de «sin autorización» se reconoce por el texto de la anotación, así
// que es una aproximación honesta («anotados como…»), no un dato exacto (2026-11-25, etapa 4).

const normalizar = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase();

/** «Ingreso sin autorización», «no autorizado», «sin permiso»… pero no «autorizado por el administrador». */
export function esSinAutorizacion(texto: string | null | undefined): boolean {
  const t = normalizar(texto ?? '');
  return /\b(SIN|NO)\s+(ESTAR\s+|ESTABA\s+|TENER\s+|TIENE\s+)?(AUTORIZAD|AUTORIZACION|PERMISO)/.test(t) || /\bNO\s+AUTORIZ/.test(t);
}

export interface NovedadParaActividad {
  categoria: string;
  texto: string;
  puestoId: number;
  puestoNombre: string;
  entidadNombre: string;
}

export interface ActividadResumen {
  rondas: number;
  ingresosPersonas: number;
  vehiculos: number;
  /** Ingresos (de personas o vehículos) que la hoja anota como sin autorización. */
  ingresosSinAutorizacion: number;
  puestosConIngresosSinAutorizacion: { puestoId: number; puestoNombre: string; entidadNombre: string; cantidad: number }[];
}

export function resumirActividad(novedades: NovedadParaActividad[], maxPuestos = 5): ActividadResumen {
  let rondas = 0;
  let ingresosPersonas = 0;
  let vehiculos = 0;
  let sinAutorizacion = 0;
  const porPuesto = new Map<number, { puestoNombre: string; entidadNombre: string; cantidad: number }>();

  for (const n of novedades) {
    if (n.categoria === 'RONDA') rondas++;
    else if (n.categoria === 'ACCESO') ingresosPersonas++;
    else if (n.categoria === 'VEHICULOS') vehiculos++;

    if ((n.categoria === 'ACCESO' || n.categoria === 'VEHICULOS') && esSinAutorizacion(n.texto)) {
      sinAutorizacion++;
      const p = porPuesto.get(n.puestoId) ?? { puestoNombre: n.puestoNombre, entidadNombre: n.entidadNombre, cantidad: 0 };
      p.cantidad++;
      porPuesto.set(n.puestoId, p);
    }
  }

  return {
    rondas,
    ingresosPersonas,
    vehiculos,
    ingresosSinAutorizacion: sinAutorizacion,
    puestosConIngresosSinAutorizacion: [...porPuesto.entries()]
      .map(([puestoId, v]) => ({ puestoId, ...v }))
      .sort((a, b) => b.cantidad - a.cantidad || a.puestoNombre.localeCompare(b.puestoNombre, 'es'))
      .slice(0, maxPuestos),
  };
}
