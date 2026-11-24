import { describe, expect, it } from 'vitest';
import { debePreguntarReemplazo, pilarUnicoDeOportunidad } from './condiciones';

const FABRICA = 'Validez de la oferta: 15 días calendario desde la fecha de emisión.';

describe('pilarUnicoDeOportunidad()', () => {
  it('preselecciona solo cuando todos los servicios son de un mismo pilar', () => {
    expect(pilarUnicoDeOportunidad(['GEMESEG'])).toBe('GEMESEG');
    expect(pilarUnicoDeOportunidad(['GEMESEG', 'GEMESEG'])).toBe('GEMESEG');
    expect(pilarUnicoDeOportunidad(['GEMESEG', 'MEGAMONT'])).toBeNull();
    expect(pilarUnicoDeOportunidad([])).toBeNull();
    expect(pilarUnicoDeOportunidad(undefined)).toBeNull();
  });

  it('ignora los servicios sin pilar', () => {
    expect(pilarUnicoDeOportunidad(['', 'ADASMEG'])).toBe('ADASMEG');
    expect(pilarUnicoDeOportunidad([''])).toBeNull();
  });
});

describe('debePreguntarReemplazo()', () => {
  it('no pregunta si el campo está vacío o sigue siendo el texto automático', () => {
    expect(debePreguntarReemplazo('', null, FABRICA)).toBe(false);
    expect(debePreguntarReemplazo(FABRICA, FABRICA, FABRICA)).toBe(false);
    expect(debePreguntarReemplazo('Condiciones de Megamont', 'Condiciones de Megamont', FABRICA)).toBe(false);
  });

  it('pregunta si la persona editó el texto', () => {
    expect(debePreguntarReemplazo('Pago a 30 días', FABRICA, FABRICA)).toBe(true);
    expect(debePreguntarReemplazo('Pago a 30 días', 'Condiciones de Megamont', FABRICA)).toBe(true);
  });

  it('no pregunta si el texto actual es el de fábrica, aunque el anterior fuera otro', () => {
    expect(debePreguntarReemplazo(FABRICA, 'Condiciones de Megamont', FABRICA)).toBe(false);
  });
});
