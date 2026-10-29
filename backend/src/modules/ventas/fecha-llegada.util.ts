import { BadRequestException } from '@nestjs/common';

// «Fecha en que llegó» de una OPORTUNIDAD (`SalesOpportunity.receivedAt`, 2026-10-28).
//
// Es SIEMPRE la fecha de la negociación, nunca la de la empresa o persona del Directorio (`SalesClient.createdAt`):
// un cliente de hace años puede abrir hoy una oportunidad nueva. Reglas:
//  - Al crear una oportunidad para alguien que ya está en el Directorio, sin fecha elegida = ahora.
//  - Cambiar la «fecha de ingreso» de la empresa o persona NO mueve las fechas de sus oportunidades.
//  - Solo cuando la empresa se crea JUNTO con su primera oportunidad (alta «en negociación» o «ya contrata») las dos
//    fechas coinciden, a propósito: es la misma llegada.
//  - Las métricas de tiempos (respuesta, cotización, ciclo) miden desde esta fecha, así que no puede quedar después
//    del primer cambio de etapa ni del cierre de la oportunidad.
//
// El día llega como 'YYYY-MM-DD' y se entiende como día de Ecuador (UTC-5 todo el año).

const ECUADOR_OFFSET_MS = 5 * 60 * 60 * 1000;
const DIA_MS = 24 * 60 * 60 * 1000;

export const diaEcuadorDe = (d: Date): string =>
  new Date(d.getTime() - ECUADOR_OFFSET_MS).toISOString().slice(0, 10);

const diaCorto = (d: Date): string => {
  const [y, m, dd] = diaEcuadorDe(d).split('-');
  return `${dd}/${m}/${y}`;
};

// 'YYYY-MM-DD' -> instante a guardar. Un día pasado se guarda a mediodía UTC (07:00 en Ecuador: el mismo día en
// los dos husos). Si el día es HOY se guarda «ahora»: un mediodía UTC de hoy puede ser todavía el futuro
// (antes de las 07:00 de Ecuador) y haría salir tiempos de respuesta negativos.
export function parseFechaLlegada(raw: string, ahora: Date = new Date()): Date {
  const dia = (raw || '').trim();
  const fecha = new Date(`${dia}T12:00:00.000Z`);
  // Además de leerse, el día tiene que existir: «2026-02-31» no es una fecha real.
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(dia) ||
    Number.isNaN(fecha.getTime()) ||
    fecha.toISOString().slice(0, 10) !== dia
  ) {
    throw new BadRequestException('La fecha en que llegó no es válida.');
  }
  const hoy = diaEcuadorDe(ahora);
  if (dia > hoy) throw new BadRequestException('La fecha en que llegó no puede ser futura.');
  return dia === hoy ? ahora : fecha;
}

// Al CREAR: sin fecha elegida (o vacía) = ahora.
export function llegadaParaCrear(raw: string | null | undefined, ahora: Date = new Date()): Date {
  return raw && raw.trim() ? parseFechaLlegada(raw, ahora) : ahora;
}

// Al EDITAR: solo se reescribe si el DÍA cambió respecto al guardado (así no se pierde la hora original al
// guardar otros cambios). `undefined` = no tocar. Vacío no se admite: una oportunidad siempre llegó algún día.
export function llegadaParaEditar(
  raw: string | null | undefined,
  actual: Date,
  ahora: Date = new Date(),
): Date | undefined {
  if (raw === undefined) return undefined;
  if (raw === null || !raw.trim()) {
    throw new BadRequestException('La fecha en que llegó es obligatoria.');
  }
  const nueva = parseFechaLlegada(raw, ahora);
  return diaEcuadorDe(nueva) === diaEcuadorDe(actual) ? undefined : nueva;
}

// La llegada no puede quedar después del primer cambio de etapa ni del cierre (se compara por día de Ecuador).
// Devuelve el mensaje de error (para el usuario) o null si está bien.
export function errorDeLlegada(
  llegada: Date,
  hitos: { primerCambioDeEtapa?: Date | null; cerradaEl?: Date | null },
): string | null {
  const dia = diaEcuadorDe(llegada);
  const { primerCambioDeEtapa, cerradaEl } = hitos;
  if (primerCambioDeEtapa && dia > diaEcuadorDe(primerCambioDeEtapa)) {
    return `La fecha en que llegó no puede ser posterior al primer cambio de etapa (${diaCorto(primerCambioDeEtapa)}).`;
  }
  if (cerradaEl && dia > diaEcuadorDe(cerradaEl)) {
    return `La fecha en que llegó no puede ser posterior a la fecha en que se cerró la oportunidad (${diaCorto(cerradaEl)}).`;
  }
  return null;
}

// Rango de días de Ecuador ('YYYY-MM-DD', ambos opcionales) -> instantes para filtrar `receivedAt`: desde el
// inicio del día `desde` hasta el último milisegundo del día `hasta`. Es la misma regla que usa la lista de
// Oportunidades en pantalla (`fechaEnRango`), para que un número del Dashboard y su lista cuenten lo mismo.
export function rangoDiasEcuador(
  desde?: string | null,
  hasta?: string | null,
): { gte?: Date; lte?: Date } {
  const leer = (s: string, nombre: string) => {
    const d = new Date(`${s}T00:00:00.000Z`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== s) {
      throw new BadRequestException(`La fecha «${nombre}» no es válida.`);
    }
    return d;
  };
  const out: { gte?: Date; lte?: Date } = {};
  const d = desde && desde.trim() ? leer(desde.trim(), 'desde') : null;
  const h = hasta && hasta.trim() ? leer(hasta.trim(), 'hasta') : null;
  if (d && h && d.getTime() > h.getTime()) {
    throw new BadRequestException('La fecha «desde» no puede ser posterior a «hasta».');
  }
  if (d) out.gte = new Date(d.getTime() + ECUADOR_OFFSET_MS);
  if (h) out.lte = new Date(h.getTime() + ECUADOR_OFFSET_MS + DIA_MS - 1);
  return out;
}
