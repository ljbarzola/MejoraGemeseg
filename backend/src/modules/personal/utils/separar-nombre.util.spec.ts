import { separarNombre, separarNombreAproximado } from './separar-nombre.util';
import { POSTULACION_STASH_KEY } from './form-data.util';

describe('separarNombreAproximado', () => {
  it('asume dos apellidos, que es la convención ecuatoriana', () => {
    expect(separarNombreAproximado('PEREZ GOMEZ JUAN CARLOS')).toEqual({
      apellidos: 'PEREZ GOMEZ',
      nombres: 'JUAN CARLOS',
      exacto: false,
    });
  });

  it('con dos palabras reparte una y una', () => {
    expect(separarNombreAproximado('PEREZ JUAN')).toEqual({
      apellidos: 'PEREZ',
      nombres: 'JUAN',
      exacto: false,
    });
  });

  it('con una sola palabra no inventa un nombre', () => {
    expect(separarNombreAproximado('PEREZ')).toEqual({
      apellidos: 'PEREZ',
      nombres: '',
      exacto: false,
    });
  });

  it('tolera cadena vacía y espacios de más', () => {
    expect(separarNombreAproximado('   ')).toEqual({ apellidos: '', nombres: '', exacto: false });
    expect(separarNombreAproximado('  PEREZ   GOMEZ   JUAN  ').apellidos).toBe('PEREZ GOMEZ');
  });

  it('nunca marca exacto: la separación por posición siempre es una suposición', () => {
    expect(separarNombreAproximado('PEREZ GOMEZ JUAN').exacto).toBe(false);
  });
});

describe('separarNombre', () => {
  it('prefiere los campos del formulario de postulación sobre la suposición', () => {
    const campos = {
      [POSTULACION_STASH_KEY]: { Apellidos: 'DE LA TORRE', Nombres: 'ANA MARIA' },
    };

    // Por posición habría partido mal ("DE LA" como apellidos).
    expect(separarNombre('DE LA TORRE ANA MARIA', campos)).toEqual({
      apellidos: 'DE LA TORRE',
      nombres: 'ANA MARIA',
      exacto: true,
    });
  });

  it('cae a la suposición cuando el stash no trae las dos partes', () => {
    const campos = { [POSTULACION_STASH_KEY]: { Apellidos: 'PEREZ' } };

    expect(separarNombre('PEREZ GOMEZ JUAN', campos).exacto).toBe(false);
  });

  it('funciona sin ficha guardada', () => {
    expect(separarNombre('PEREZ GOMEZ JUAN', null).apellidos).toBe('PEREZ GOMEZ');
    expect(separarNombre('PEREZ GOMEZ JUAN', undefined).nombres).toBe('JUAN');
  });
});
