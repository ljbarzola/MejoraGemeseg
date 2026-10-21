// Estado de un contrato comercial (SalesAgreement). En un SERVICIO solo ACTIVO /
// RENOVADO / CANCELADO se guardan; el resto se calcula con las fechas para que
// nunca quede desactualizado (nadie tiene que marcar "vencido" a mano ni hay un
// proceso nocturno que lo haga). Una venta de PRODUCTO no vence ni se renueva:
// guarda POR_ENTREGAR / ENTREGADO / CANCELADO tal cual.
export const DIAS_POR_VENCER = 30;

export type EstadoContrato =
  | 'POR_INICIAR'
  | 'VIGENTE'
  | 'POR_VENCER'
  | 'VENCIDO'
  | 'RENOVADO'
  | 'CANCELADO'
  | 'POR_ENTREGAR'
  | 'ENTREGADO';

export type TipoContrato = 'SERVICIO' | 'PRODUCTO';
export const esProducto = (c: { kind?: string | null }): boolean =>
  c.kind === 'PRODUCTO';

// Garantía opcional de un producto: solo existe si se registró «Garantía hasta».
export type EstadoGarantia = 'VIGENTE' | 'POR_VENCER' | 'VENCIDA';

const ECUADOR_OFFSET_MS = 5 * 60 * 60 * 1000;
const DIA_MS = 24 * 60 * 60 * 1000;

// 'YYYY-MM-DD' de hoy en Ecuador (el servidor corre en UTC).
export const hoyEcuador = (ahora: Date = new Date()): string =>
  new Date(ahora.getTime() - ECUADOR_OFFSET_MS).toISOString().slice(0, 10);

const dia = (d: Date): string => d.toISOString().slice(0, 10);

export function calcularEstadoGarantia(
  warrantyUntil: Date | null | undefined,
  ahora: Date = new Date(),
): EstadoGarantia | null {
  if (!warrantyUntil) return null;
  const hoy = hoyEcuador(ahora);
  const fin = dia(warrantyUntil);
  if (fin < hoy) return 'VENCIDA';
  const diasRestantes = Math.round(
    (Date.parse(`${fin}T00:00:00.000Z`) - Date.parse(`${hoy}T00:00:00.000Z`)) /
      DIA_MS,
  );
  return diasRestantes <= DIAS_POR_VENCER ? 'POR_VENCER' : 'VIGENTE';
}

export function calcularEstadoContrato(
  c: { status: string; startDate: Date; endDate: Date | null; kind?: string | null },
  ahora: Date = new Date(),
): EstadoContrato {
  if (c.status === 'CANCELADO') return 'CANCELADO';
  if (esProducto(c)) return c.status === 'ENTREGADO' ? 'ENTREGADO' : 'POR_ENTREGAR';
  if (c.status === 'RENOVADO') return 'RENOVADO';
  const hoy = hoyEcuador(ahora);
  if (dia(c.startDate) > hoy) return 'POR_INICIAR';
  if (!c.endDate) return 'VIGENTE';
  const fin = dia(c.endDate);
  if (fin < hoy) return 'VENCIDO';
  const diasRestantes = Math.round(
    (Date.parse(`${fin}T00:00:00.000Z`) - Date.parse(`${hoy}T00:00:00.000Z`)) /
      DIA_MS,
  );
  return diasRestantes <= DIAS_POR_VENCER ? 'POR_VENCER' : 'VIGENTE';
}

// 'YYYY-MM-DD' -> Date a guardar en una columna DATE. Además de leerse, el día
// tiene que existir ("2026-02-31" se correría a marzo en silencio). Devuelve
// null si no es una fecha real.
export function parseDiaContrato(raw: string | undefined | null): Date | null {
  const texto = (raw || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(texto)) return null;
  const fecha = new Date(`${texto}T00:00:00.000Z`);
  if (
    Number.isNaN(fecha.getTime()) ||
    fecha.toISOString().slice(0, 10) !== texto
  )
    return null;
  return fecha;
}

export const sumarDias = (d: Date, n: number): Date =>
  new Date(d.getTime() + n * DIA_MS);

const aDiaCorto = (iso: string): string => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

// Fecha en que se canceló un contrato: puede ser pasada (contratos anteriores a la
// app), pero no anterior al inicio del contrato ni futura. Devuelve el mensaje
// del problema, o null si es válida.
export function problemaFechaCancelacion(
  cancelada: Date,
  inicio: Date,
  ahora: Date = new Date(),
): string | null {
  const dia_ = dia(cancelada);
  if (dia_ < dia(inicio)) {
    return `El contrato empezó el ${aDiaCorto(dia(inicio))}: no pudo cancelarse antes, el ${aDiaCorto(dia_)}.`;
  }
  if (dia_ > hoyEcuador(ahora)) {
    return `La fecha de cancelación (${aDiaCorto(dia_)}) no puede ser futura.`;
  }
  return null;
}
