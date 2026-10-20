import { fechaDeRecepcion } from './lead-recepcion.util';

describe('fechaDeRecepcion — fecha real de un lead enviado con retraso', () => {
  const ahora = new Date('2026-10-20T20:00:00Z');

  it('acepta una fecha ISO pasada y la respeta, con zona horaria', () => {
    expect(fechaDeRecepcion('2026-10-19T17:11:35+00:00', ahora)?.toISOString()).toBe('2026-10-19T17:11:35.000Z');
    expect(fechaDeRecepcion('2026-10-19T12:11:35-05:00', ahora)?.toISOString()).toBe('2026-10-19T17:11:35.000Z');
  });

  it('sin valor, vacío o que no es texto, devuelve null (se usa la fecha de ahora)', () => {
    expect(fechaDeRecepcion(undefined, ahora)).toBeNull();
    expect(fechaDeRecepcion(null, ahora)).toBeNull();
    expect(fechaDeRecepcion('', ahora)).toBeNull();
    expect(fechaDeRecepcion('   ', ahora)).toBeNull();
    expect(fechaDeRecepcion(1760893895000, ahora)).toBeNull();
  });

  it('una fecha que no existe o que no se entiende, null', () => {
    expect(fechaDeRecepcion('ayer por la tarde', ahora)).toBeNull();
    expect(fechaDeRecepcion('2026-13-45T10:00:00Z', ahora)).toBeNull();
  });

  it('una fecha del futuro lejano no es creíble, null', () => {
    expect(fechaDeRecepcion('2026-10-21T20:00:00Z', ahora)).toBeNull();
  });

  it('con el reloj de la web unos minutos adelantado, queda en ahora y no en el futuro', () => {
    expect(fechaDeRecepcion('2026-10-20T20:03:00Z', ahora)?.toISOString()).toBe(ahora.toISOString());
  });

  it('una fecha de hace más de 90 días no se respeta, null', () => {
    expect(fechaDeRecepcion('2026-07-01T00:00:00Z', ahora)).toBeNull();
    expect(fechaDeRecepcion('2026-08-01T00:00:00Z', ahora)).not.toBeNull();
  });
});
