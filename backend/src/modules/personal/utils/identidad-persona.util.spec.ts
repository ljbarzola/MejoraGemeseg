import {
  cedulaEsDigitosDeCarpeta,
  cedulaMostrable,
} from './identidad-persona.util';

describe('cedulaMostrable', () => {
  it('deja vacía la clave interna y una cédula en blanco', () => {
    expect(cedulaMostrable('ID-1AbCdefGhIjKlMn')).toBe('');
    expect(cedulaMostrable('TEMP-123')).toBe('');
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
