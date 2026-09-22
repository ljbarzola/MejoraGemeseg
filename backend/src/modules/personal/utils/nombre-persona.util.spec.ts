import {
  formatNombrePersona,
  normalizarNombrePersona,
  validarNombrePersona,
} from './nombre-persona.util';

describe('formatNombrePersona', () => {
  it('une apellidos y nombres con un solo espacio, sin guion', () => {
    expect(formatNombrePersona('Pérez Gómez', 'Juan Carlos')).toBe(
      'Pérez Gómez Juan Carlos',
    );
  });

  it('colapsa espacios sobrantes y recorta los bordes', () => {
    expect(formatNombrePersona('  Pérez   Gómez ', ' Juan  Carlos ')).toBe(
      'Pérez Gómez Juan Carlos',
    );
  });

  it('tolera que falte una de las dos partes en vez de dejar un espacio suelto', () => {
    expect(formatNombrePersona('Pérez', '')).toBe('Pérez');
    expect(formatNombrePersona('', 'Juan')).toBe('Juan');
    expect(formatNombrePersona(null, undefined)).toBe('');
  });
});

describe('normalizarNombrePersona', () => {
  it('no altera mayúsculas ni tildes, solo los espacios', () => {
    expect(normalizarNombrePersona('  PÉREZ   gómez  ')).toBe('PÉREZ gómez');
  });
});

describe('validarNombrePersona', () => {
  it('acepta el formato estándar', () => {
    expect(validarNombrePersona('Pérez Gómez Juan Carlos').valido).toBe(true);
  });

  it('rechaza los formatos viejos que traían cédula o puesto', () => {
    expect(validarNombrePersona('Pérez Gómez - 0912345678 - Guardia').valido).toBe(false);
    expect(validarNombrePersona('Pérez Gómez - Juan Carlos').valido).toBe(false);
    expect(validarNombrePersona('Juan Pérez - Contador').valido).toBe(false);
    expect(validarNombrePersona('0912345678').valido).toBe(false);
  });

  it('explica el motivo para que RRHH sepa qué corregir', () => {
    expect(validarNombrePersona('Pérez - 0912345678').motivo).toContain('cédula');
    expect(validarNombrePersona('Pérez - Juan').motivo).toContain('guion');
    expect(validarNombrePersona('   ').motivo).toContain('no tiene nombre');
  });

  it('marca válido sin motivo', () => {
    expect(validarNombrePersona('Pérez Gómez Juan').motivo).toBe('');
  });
});
