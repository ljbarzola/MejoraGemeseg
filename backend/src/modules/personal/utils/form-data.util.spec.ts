import { valorCampoPostulacion } from './form-data.util';

describe('valorCampoPostulacion', () => {
  const datos = {
    Teléfono: '0991112233',
    Email: 'ana@gemeseg.com',
    Cédula: '1712345678',
    Nombres: 'Ana Maria',
    Apellidos: 'Perez Lopez',
    'Años de experiencia': '5',
  };

  it('encuentra Celular cuando el JSON dice Teléfono', () => {
    expect(valorCampoPostulacion(datos, 'Celular')).toBe('0991112233');
  });

  it('encuentra Correo cuando el JSON dice Email', () => {
    expect(valorCampoPostulacion(datos, 'Correo')).toBe('ana@gemeseg.com');
  });

  it('encuentra la cédula aunque el rótulo no lleve tilde', () => {
    expect(valorCampoPostulacion(datos, 'Cedula')).toBe('1712345678');
  });

  it('respeta un campo que ya viene con el mismo nombre', () => {
    expect(valorCampoPostulacion(datos, 'Años de experiencia')).toBe('5');
  });
});
