import { validarFormatoEntidad } from './entidad-folder-format.util';

describe('validarFormatoEntidad', () => {
  it('acepta el formato canónico con espacios alrededor del guion', () => {
    expect(validarFormatoEntidad('Guayas - Zumocacao').valido).toBe(true);
  });

  it('acepta el guion pegado o con espacios incompletos, sin que RRHH tenga que renombrar', () => {
    expect(validarFormatoEntidad('GUAYAS- ZUMOCACAO').valido).toBe(true);
    expect(validarFormatoEntidad('GUAYAS -ZUMOCACAO').valido).toBe(true);
    expect(validarFormatoEntidad('GUAYAS-ZUMOCACAO').valido).toBe(true);
    expect(validarFormatoEntidad('  Guayas   -   Zumocacao  ').valido).toBe(
      true,
    );
  });

  it('compara la provincia sin tildes ni mayúsculas', () => {
    expect(validarFormatoEntidad('PICHINCHA - Banco Pichincha').valido).toBe(
      true,
    );
    expect(validarFormatoEntidad('bolivar - Hacienda X').valido).toBe(true);
    expect(
      validarFormatoEntidad('Santo Domingo de los Tsachilas - Matriz').valido,
    ).toBe(true);
  });

  it('rechaza un nombre sin provincia reconocible', () => {
    expect(validarFormatoEntidad('Banco Pichincha').valido).toBe(false);
    expect(validarFormatoEntidad('Madrid - Oficina').valido).toBe(false);
    expect(validarFormatoEntidad('Guayas-').valido).toBe(false);
    expect(validarFormatoEntidad('').valido).toBe(false);
  });
});
