import {
  mismaPersona,
  validarDatosPostulacion,
  validarValorCampo,
} from './postulacion-validacion.util';

describe('validarValorCampo', () => {
  it('exige dos apellidos', () => {
    expect(validarValorCampo('Apellidos', 'TEXTO', 'Perez')).toBe(
      'Ingresa tus dos apellidos.',
    );
    expect(validarValorCampo('Apellidos', 'TEXTO', 'Perez Lopez')).toBeNull();
  });

  it('exige cédula de 10 dígitos y rechaza identificadores generados', () => {
    expect(validarValorCampo('Cédula', 'NUMERICO', '123')).toMatch(/10 dígitos/);
    expect(validarValorCampo('Cédula', 'TEXTO', 'ID-M9m4K_pW5o')).toMatch(
      /10 dígitos/,
    );
    expect(validarValorCampo('Cédula', 'NUMERICO', '1712345678')).toBeNull();
  });

  it('rechaza correo, teléfono y número con el mismo criterio del portal', () => {
    expect(validarValorCampo('Correo', 'CORREO', 'correo-malo')).toMatch(
      /correo electrónico válido/,
    );
    expect(validarValorCampo('Correo', 'CORREO', 'a@b')).toMatch(
      /correo electrónico válido/,
    );
    expect(validarValorCampo('Celular', 'TELEFONO', 'abc')).toMatch(
      /teléfono válido/,
    );
    expect(validarValorCampo('Años de experiencia', 'NUMERICO', 'abc')).toMatch(
      /solo números/,
    );
  });
});

describe('validarDatosPostulacion', () => {
  it('junta los errores de varios campos', () => {
    const errores = validarDatosPostulacion(
      { Apellidos: 'Perez', Correo: 'correo-malo', 'Años': 'abc' },
      [
        { nombre: 'Apellidos', tipo: 'TEXTO', obligatorio: true },
        { nombre: 'Correo', tipo: 'CORREO', obligatorio: true },
        { nombre: 'Años', tipo: 'NUMERICO', obligatorio: true },
      ],
    );
    expect(errores).toHaveLength(3);
  });
});

describe('mismaPersona', () => {
  it('ignora orden, mayúsculas y tildes', () => {
    expect(mismaPersona('María López', 'LOPEZ MARIA')).toBe(true);
    expect(mismaPersona('JUAN PEREZ', 'Perez Lopez Ana Maria')).toBe(false);
  });
});
