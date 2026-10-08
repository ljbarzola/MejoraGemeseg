import { normalizarRecordatorios, tocaEnviar } from './task-reminders.util';

// La fecha fin se guarda a mediodía UTC; "hoy" es medianoche UTC (hoyEcuador()).
const fin = new Date('2026-10-20T12:00:00.000Z');
const dia = (texto: string) => new Date(`${texto}T00:00:00.000Z`);
const abierta = { status: 'TODO', endDate: fin };

describe('normalizarRecordatorios', () => {
  it('acepta plazos largos antes y después, sin repetidos, de mayor a menor', () => {
    expect(normalizarRecordatorios([1, 30, 90, 30, -3, 0, -1])).toEqual([
      90, 30, 1, 0, -1, -3,
    ]);
  });

  it('descarta no enteros y lo que pasa de un año', () => {
    expect(normalizarRecordatorios([1.5, 366, -366, 365, -365])).toEqual([
      365, -365,
    ]);
  });

  it('sin lista devuelve vacío', () => {
    expect(normalizarRecordatorios(undefined)).toEqual([]);
  });
});

describe('tocaEnviar', () => {
  it('avisa el día elegido antes del vencimiento (30 días antes)', () => {
    const r = { daysBefore: 30, sentAt: null };
    expect(tocaEnviar(r, { ...abierta, endDate: new Date('2026-11-19T12:00:00.000Z') }, dia('2026-10-20'))).toBe(true);
    expect(tocaEnviar(r, { ...abierta, endDate: new Date('2026-11-19T12:00:00.000Z') }, dia('2026-10-19'))).toBe(false);
  });

  it('el aviso de atraso de 1 día sigue saliendo el día siguiente (compatibilidad con -1)', () => {
    const r = { daysBefore: -1, sentAt: null };
    expect(tocaEnviar(r, abierta, dia('2026-10-20'))).toBe(false);
    expect(tocaEnviar(r, abierta, dia('2026-10-21'))).toBe(true);
  });

  it('el aviso de atraso de 3 días sale al tercer día y con un día de gracia', () => {
    const r = { daysBefore: -3, sentAt: null };
    expect(tocaEnviar(r, abierta, dia('2026-10-22'))).toBe(false);
    expect(tocaEnviar(r, abierta, dia('2026-10-23'))).toBe(true);
    expect(tocaEnviar(r, abierta, dia('2026-10-24'))).toBe(true);
    expect(tocaEnviar(r, abierta, dia('2026-10-25'))).toBe(false);
  });

  it('no avisa si ya se envió o la tarea está terminada o cancelada', () => {
    const hoy = dia('2026-10-23');
    expect(tocaEnviar({ daysBefore: -3, sentAt: new Date() }, abierta, hoy)).toBe(false);
    expect(tocaEnviar({ daysBefore: -3, sentAt: null }, { ...abierta, status: 'DONE' }, hoy)).toBe(false);
    expect(tocaEnviar({ daysBefore: -3, sentAt: null }, { ...abierta, status: 'CANCELLED' }, hoy)).toBe(false);
  });
});
