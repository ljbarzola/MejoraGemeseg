import { BadRequestException } from '@nestjs/common';
import {
  cedulaEsDigitosDeCarpeta,
  cedulaMostrable,
  validarCedulaIngresada,
} from './identidad-persona.util';

describe('validarCedulaIngresada', () => {
  it('acepta una cédula de 10 dígitos y cualquier otro documento de 5 a 20 caracteres', () => {
    expect(validarCedulaIngresada('0912345678')).toBe('0912345678');
    // Pasaporte u otro documento de otro país, con letras y guion; se normaliza a mayúsculas y sin espacios.
    expect(validarCedulaIngresada(' ab 123-456 ')).toBe('AB123-456');
    expect(validarCedulaIngresada('12345')).toBe('12345');
    expect(validarCedulaIngresada('A'.repeat(20))).toBe('A'.repeat(20));
  });

  it('un valor vacío no es error: significa «sin documento»', () => {
    expect(validarCedulaIngresada('   ')).toBeNull();
  });

  it('rechaza lo muy corto, lo muy largo, los símbolos raros y las claves internas', () => {
    for (const malo of ['1234', 'A'.repeat(21), '12_345', 'ab#123', 'ID-abc123', 'temp-99999']) {
      expect(() => validarCedulaIngresada(malo)).toThrow(BadRequestException);
    }
  });
});

describe('cedulaMostrable', () => {
  it('deja vacía la clave interna y una cédula en blanco', () => {
    expect(cedulaMostrable('ID-1AbCdefGhIjKlMn')).toBe('');
    expect(cedulaMostrable('TEMP-123')).toBe('');
    expect(cedulaMostrable('SC-ABCDEF1234')).toBe('');
    expect(cedulaMostrable('ID-OP-0123456789ab')).toBe('');
    expect(cedulaMostrable('')).toBe('');
    expect(cedulaMostrable(null)).toBe('');
  });

  it('conserva una cédula de 10 dígitos', () => {
    expect(cedulaMostrable('0912345678')).toBe('0912345678');
  });
});

describe('cedulaEsDigitosDeCarpeta', () => {
  it('reconoce la cédula inventada a partir del id de Drive', () => {
    expect(cedulaEsDigitosDeCarpeta('0912345678', 'ab0912345678cd')).toBe(
      true,
    );
    expect(cedulaEsDigitosDeCarpeta('0912345678', 'otra-carpeta')).toBe(
      false,
    );
    expect(cedulaEsDigitosDeCarpeta('ID-ab0912345678cd', 'ab0912345678cd')).toBe(
      false,
    );
  });
});
