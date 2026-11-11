/**
 * Piezas de texto del informe mensual de Contratación Pública, calculadas con código fijo a partir
 * de los datos del contrato, los puestos, el horario y las bitácoras. Escritas con el estilo de los
 * informes que ya hace la empresa («24 de septiembre del 2026», «02 puesto de guardia armada de 24
 * horas»). Sin IA: lo que sale aquí se puede repetir y probar.
 */

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const MS_DIA = 86_400_000;

const partes = (iso: string) => {
  const [a, m, d] = iso.slice(0, 10).split('-').map(Number);
  return { a, m, d };
};
const aMs = (iso: string) => {
  const { a, m, d } = partes(iso);
  return Date.UTC(a, m - 1, d);
};
const aIso = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/** '2026-09-24' → '24 de septiembre del 2026'. */
export function fechaTexto(iso: string): string {
  const { a, m, d } = partes(iso);
  return `${d} de ${MESES[m - 1]} del ${a}`;
}

/** '2026-09-09' → '9 de septiembre de 2026' (así lo escribe el informe del Ministerio: «de», no «del»). */
export function fechaLarga(iso: string): string {
  const { a, m, d } = partes(iso);
  return `${d} de ${MESES[m - 1]} de ${a}`;
}

/** 315624.18 → '315.624,18' (formato de Ecuador: punto para miles, coma para decimales). */
export function montoEcuador(valor: number): string {
  const [ent, dec] = Math.abs(valor).toFixed(2).split('.');
  return `${valor < 0 ? '-' : ''}${ent.replace(/\B(?=(\d{3})+(?!\d))/g, '.')},${dec}`;
}

/** '2026-03-24' → 'martes, 24 de marzo del 2026'. */
export function fechaConDia(iso: string): string {
  const dia = DIAS[new Date(aMs(iso)).getUTCDay()];
  return `${dia}, ${fechaTexto(iso)}`;
}

/** Del primero al último día del mes: '2026-09-01' / '2026-09-30'. */
export function limitesDelMes(anio: number, mes: number): { desde: string; hasta: string } {
  const mm = String(mes).padStart(2, '0');
  const ultimo = new Date(Date.UTC(anio, mes, 0)).getUTCDate();
  return { desde: `${anio}-${mm}-01`, hasta: `${anio}-${mm}-${String(ultimo).padStart(2, '0')}` };
}

/**
 * El periodo en una frase, sin el «del» inicial: «24 de agosto al 23 de septiembre del 2026»,
 * «1 al 30 de septiembre del 2026», o con los dos años si cruza de año.
 */
export function periodoTexto(desde: string, hasta: string): string {
  const a = partes(desde);
  const b = partes(hasta);
  if (a.a !== b.a) return `${a.d} de ${MESES[a.m - 1]} del ${a.a} al ${b.d} de ${MESES[b.m - 1]} del ${b.a}`;
  if (a.m === b.m) return a.d === b.d ? fechaTexto(hasta) : `${a.d} al ${b.d} de ${MESES[b.m - 1]} del ${b.a}`;
  return `${a.d} de ${MESES[a.m - 1]} al ${b.d} de ${MESES[b.m - 1]} del ${b.a}`;
}

/** Fecha en la que normalmente se firma el informe: el día después de terminar el periodo. */
export function fechaDelInforme(hasta: string): string {
  return aIso(aMs(hasta) + MS_DIA);
}

/** Meses de vigencia del contrato: «8 meses», «1 mes» o, si dura menos de un mes, «15 días». */
export function duracionTexto(inicio: string, fin: string): string {
  const dias = Math.round((aMs(fin) - aMs(inicio)) / MS_DIA) + 1;
  const meses = Math.round(dias / 30.4375);
  if (meses < 1) return `${dias} ${dias === 1 ? 'día' : 'días'}`;
  return `${meses} ${meses === 1 ? 'mes' : 'meses'}`;
}

const dosDigitos = (n: number) => String(n).padStart(2, '0');

/**
 * «02 puesto de guardia armada de 24 horas» (así redactan hoy el informe, sin concordar el plural),
 * o «02 puestos de … de 24 horas y 01 puesto de … de 12 horas» si hay turnos distintos.
 */
export function descripcionPuestos(puestos: { tipoTurno: string }[]): string {
  if (!puestos.length) return 'sin puestos registrados';
  const porTurno = new Map<string, number>();
  for (const p of puestos) porTurno.set(p.tipoTurno, (porTurno.get(p.tipoTurno) ?? 0) + 1);
  return [...porTurno.entries()]
    .sort((x, y) => parseInt(x[0], 10) - parseInt(y[0], 10))
    .map(([turno, n]) => `${dosDigitos(n)} puesto${n === 1 ? '' : 's'} de guardia armada de ${parseInt(turno, 10)} horas`)
    .join(' y ');
}

export interface NovedadDelPeriodo {
  fecha: string; // YYYY-MM-DD
  puesto: string;
  texto: string;
  categoria: string;
  gravedad: string;
}

const CATEGORIAS_RELEVANTES = new Set(['INCIDENTE', 'EQUIPOS']);

/** Una novedad cuenta como «relevante» si es un incidente, un problema de equipos o no es de gravedad baja. */
export const esNovedadRelevante = (n: NovedadDelPeriodo): boolean =>
  CATEGORIAS_RELEVANTES.has(n.categoria) || n.gravedad === 'MEDIA' || n.gravedad === 'ALTA';

/**
 * Conclusión que se propone para el informe a partir de las bitácoras del periodo. Solo sugiere:
 * quien redacta la edita. Sin bitácoras no se concluye nada (null): no hay base para afirmar que
 * «no hubo novedades».
 */
export function conclusionSugerida(o: {
  periodo: string;
  puestos: number;
  bitacoras: number;
  novedades: NovedadDelPeriodo[];
}): string | null {
  if (o.bitacoras === 0) return null;
  const relevantes = o.novedades.filter(esNovedadRelevante).sort((a, b) => a.fecha.localeCompare(b.fecha));
  const donde = o.puestos > 1 ? 'en los puestos asignados' : 'en el puesto asignado';
  if (relevantes.length === 0) {
    return `No se han registrado novedades relevantes ${donde} a la compañía de Seguridad correspondiente al periodo del ${o.periodo}.`;
  }
  const MAX = 10;
  const lineas = relevantes.slice(0, MAX).map((n) => {
    const { d, m } = partes(n.fecha);
    return `- ${d} de ${MESES[m - 1]}${o.puestos > 1 ? ` (${n.puesto})` : ''}: ${n.texto.replace(/\s+/g, ' ').trim()}`;
  });
  const resto = relevantes.length > MAX ? `\n- Y ${relevantes.length - MAX} novedad(es) más registradas en las bitácoras.` : '';
  return `En el periodo del ${o.periodo} se registraron ${relevantes.length} novedad(es) relevante(s) ${donde}:\n${lineas.join('\n')}${resto}`;
}

/** Texto de una fila de la tabla «Lugar del servicio»: «1 puesto de 24 horas». */
export const puestosDeLaFila = (tipoTurno: string): string => `1 puesto de ${parseInt(tipoTurno, 10)} horas`;
