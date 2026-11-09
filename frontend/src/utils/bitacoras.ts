// Textos y colores compartidos por las pantallas de Bitácoras.
import type { CategoriaNovedad, ResultadoBitacora, Severidad, EstadoLectura, OrigenLectura } from '../types/bitacoras';

export const RESULTADO_LABEL: Record<ResultadoBitacora, string> = {
  CONFORME: 'Conforme',
  A_REVISAR: 'A revisar',
  CON_ERRORES: 'Con errores',
  SIN_COMPARAR: 'Sin comparar',
  SIN_REVISAR: 'Sin revisar',
};

export const RESULTADO_COLOR: Record<ResultadoBitacora, { bg: string; fg: string }> = {
  CONFORME: { bg: '#c6f6d5', fg: '#276749' },
  A_REVISAR: { bg: '#feebc8', fg: '#c05621' },
  CON_ERRORES: { bg: '#fed7d7', fg: '#c53030' },
  SIN_COMPARAR: { bg: '#e2e8f0', fg: '#4a5568' },
  SIN_REVISAR: { bg: '#e2e8f0', fg: '#4a5568' },
};

export const RESULTADO_AYUDA: Record<ResultadoBitacora, string> = {
  CONFORME: 'Quienes aparecen en la hoja son quienes debían estar, en su horario.',
  A_REVISAR: 'No hay errores graves, pero hay cosas que conviene confirmar.',
  CON_ERRORES: 'Aparece alguien que no debía estar, o falta alguien que sí.',
  SIN_COMPARAR: 'No se pudo comparar con un horario (no hay horario cargado para esos días).',
  SIN_REVISAR: 'Todavía no se ha comparado con el horario.',
};

export const SEVERIDAD_LABEL: Record<Severidad, string> = { ALTA: 'Alta', MEDIA: 'Media', BAJA: 'Baja' };
export const SEVERIDAD_COLOR: Record<Severidad, { bg: string; fg: string }> = {
  ALTA: { bg: '#fed7d7', fg: '#c53030' },
  MEDIA: { bg: '#feebc8', fg: '#c05621' },
  BAJA: { bg: '#e2e8f0', fg: '#4a5568' },
};

export const TIPO_HALLAZGO_LABEL: Record<string, string> = {
  GUARDIA_DISTINTO: 'Otro guardia en lugar del programado',
  GUARDIA_AUSENTE: 'Guardia que no aparece',
  GUARDIA_NO_PROGRAMADO: 'Guardia que estaba libre',
  GUARDIA_NO_ASIGNADO: 'Nombre que no es del puesto',
  HORARIO_DISTINTO: 'Horas distintas a las del turno',
  SIN_HORAS: 'Hora sin leer',
  NOMBRE_DUDOSO: 'Nombre dudoso',
  NOMBRE_AMBIGUO: 'Nombre ambiguo',
  LECTURA_DUDOSA: 'Línea poco legible',
  NO_HORARIO: 'Día sin horario',
  HORARIO_NO_APROBADO: 'Horario sin aprobar',
  FECHA_FUERA_DE_CONTRATO: 'Fecha fuera del contrato',
  PUESTO_DISTINTO: 'Puesto distinto',
  FECHA_YA_CARGADA: 'Hoja repetida',
};

export const LECTURA_LABEL: Record<EstadoLectura, string> = {
  LEIDA: 'Leída',
  SIN_LECTURA: 'Sin leer',
  ERROR: 'No se pudo leer',
};

// Colores categóricos fijos para la dona de novedades (el nombre y la cantidad van
// siempre en la leyenda: el color nunca es la única señal).
export const COLOR_CATEGORIA: Record<CategoriaNovedad, string> = {
  INCIDENTE: '#d64545',
  EQUIPOS: '#eb6834',
  ACCESO: '#2a78d6',
  VEHICULOS: '#1baf7a',
  RONDA: '#7a5af8',
  ENTREGA_TURNO: '#eda100',
  OTRO: '#718096',
  SIN_NOVEDAD: '#a0aec0',
};

export const OPCIONES_RESULTADO: { value: ResultadoBitacora | ''; label: string }[] = [
  { value: '', label: 'Todos los resultados' },
  { value: 'CON_ERRORES', label: 'Con errores' },
  { value: 'A_REVISAR', label: 'A revisar' },
  { value: 'CONFORME', label: 'Conforme' },
  { value: 'SIN_COMPARAR', label: 'Sin comparar' },
];

export const ARCHIVOS_BITACORA = 'image/jpeg,image/png,image/webp,image/heic,image/heif,application/pdf';

// Fechas legibles de Operaciones (2026-11-06). Antes eran «02/11/2026», que cuesta leer de corrido y
// se confunde entre día y mes. Las fechas llegan como texto 'AAAA-MM-DD' y NUNCA se pasan por `new Date`
// local: en Ecuador (UTC-5) eso las corría un día atrás.
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const MESES_CORTOS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

const partes = (iso: string) => {
  const [y, m, d] = iso.slice(0, 10).split('-');
  return { y: Number(y), m: Number(m) - 1, d: Number(d) };
};
/** Año de hoy en Ecuador (UTC-5), para no repetir el año de las fechas de este año. */
const anioActual = () => new Date(Date.now() - 5 * 3600000).getUTCFullYear();

/** 'AAAA-MM-DD' → '2 de noviembre de 2026'. */
export const fechaLarga = (iso: string | null | undefined) => {
  if (!iso) return '—';
  const { y, m, d } = partes(iso);
  return `${d} de ${MESES[m]} de ${y}`;
};

/** 'AAAA-MM-DD' → '2 nov 2026'. Para tablas y listas. */
export const fechaCorta = (iso: string | null | undefined) => {
  if (!iso) return '—';
  const { y, m, d } = partes(iso);
  return `${d} ${MESES_CORTOS[m]} ${y}`;
};

/** 'AAAA-MM-DD' → '2 nov'. Para listas de días dentro de un periodo ya conocido. */
export const diaMes = (iso: string) => {
  const { m, d } = partes(iso);
  return `${d} ${MESES_CORTOS[m]}`;
};

/** 'AAAA-MM-DD' → 'lunes 2 de noviembre' (con el año si no es el de hoy). */
export const fechaConDia = (iso: string) => {
  const { y, m, d } = partes(iso);
  const dia = DIAS[new Date(`${iso.slice(0, 10)}T00:00:00Z`).getUTCDay()];
  return `${dia} ${d} de ${MESES[m]}${y === anioActual() ? '' : ` de ${y}`}`;
};

/** 'del 9 de agosto al 6 de noviembre de 2026' (el año una sola vez si es el mismo). */
export const rangoLargo = (desde: string, hasta: string) => {
  const a = partes(desde);
  const b = partes(hasta);
  if (desde.slice(0, 10) === hasta.slice(0, 10)) return `el ${fechaLarga(desde)}`;
  const inicio = a.y === b.y ? `${a.d} de ${MESES[a.m]}` : fechaLarga(desde);
  return `del ${inicio} al ${fechaLarga(hasta)}`;
};

/** El período que cubre una hoja: un día o un rango corto («2 nov 2026», «1 – 4 nov 2026»). */
export const periodoBitacora = (desde: string | null, hasta: string | null) => {
  if (!desde) return 'Sin fecha leída';
  if (!hasta || desde.slice(0, 10) === hasta.slice(0, 10)) return fechaCorta(desde);
  const a = partes(desde);
  const b = partes(hasta);
  if (a.y === b.y && a.m === b.m) return `${a.d} – ${b.d} ${MESES_CORTOS[b.m]} ${b.y}`;
  if (a.y === b.y) return `${a.d} ${MESES_CORTOS[a.m]} – ${b.d} ${MESES_CORTOS[b.m]} ${b.y}`;
  return `${fechaCorta(desde)} – ${fechaCorta(hasta)}`;
};

export const OPCIONES_ORIGEN: Record<string, string> = {
  IA: 'Leída por el agente',
  IA_CORREGIDA: 'Leída por el agente y corregida a mano',
  MANUAL: 'Transcrita a mano',
};

/** Quién leyó la hoja; mientras no esté leída, dice qué falta en vez de decir «leída por el agente». */
export const textoOrigen = (origen: OrigenLectura, estado: EstadoLectura) =>
  estado === 'LEIDA' ? OPCIONES_ORIGEN[origen] : estado === 'ERROR' ? 'No se pudo leer: falta transcribirla' : 'Sin leer: falta transcribirla';
