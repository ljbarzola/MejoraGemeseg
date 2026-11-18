import { normalizarClasificacion, sectoresDe, PROVINCIAS } from './entidad-clasificacion.util';

describe('normalizarClasificacion', () => {
  it('acepta un sector del tipo, una provincia real y limpia el cantón', () => {
    expect(normalizarClasificacion({ sector: 'Ministerio', provincia: 'Pichincha', canton: '  Quito ' }, 'PUBLICA')).toEqual({
      sector: 'Ministerio',
      provincia: 'Pichincha',
      canton: 'Quito',
    });
  });

  it('rechaza un sector que no es del tipo y una provincia inventada', () => {
    expect(normalizarClasificacion({ sector: 'Ministerio' }, 'PRIVADA').error).toMatch(/privada/);
    expect(normalizarClasificacion({ provincia: 'Atlántida' }, 'PUBLICA').error).toMatch(/no es una provincia/);
  });

  it('vacío = sin dato, y lo que no vino no se toca', () => {
    expect(normalizarClasificacion({ sector: '', provincia: '' }, 'PUBLICA')).toEqual({ sector: null, provincia: null });
    expect(normalizarClasificacion({}, 'PUBLICA')).toEqual({});
  });

  it('las listas: 24 provincias y «Otra» en ambos tipos', () => {
    expect(PROVINCIAS).toHaveLength(24);
    expect(sectoresDe('PUBLICA')).toContain('Otra');
    expect(sectoresDe('PRIVADA')).toContain('Otra');
  });
});
