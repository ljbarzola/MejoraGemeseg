import { nombresParecidos, similitudNombres } from './nombre-similar.util';

describe('similitudNombres', () => {
  it('da 1 para nombres idénticos, incluso con mayúsculas/acentos distintos', () => {
    expect(similitudNombres('Textiles del Valle', 'textiles del valle')).toBe(1);
    expect(similitudNombres('José Pérez', 'jose perez')).toBe(1);
  });

  it('da alto para nombres muy parecidos', () => {
    expect(similitudNombres('Textiles del Valle', 'Textiles Valle')).toBeGreaterThan(0.6);
  });

  it('da bajo para nombres sin relación', () => {
    expect(similitudNombres('Textiles del Valle', 'Banco Pichincha')).toBeLessThan(0.3);
  });

  it('da 0 si algún nombre queda vacío tras normalizar', () => {
    expect(similitudNombres('', 'Banco Pichincha')).toBe(0);
    expect(similitudNombres('···', 'Banco Pichincha')).toBe(0);
  });
});

describe('nombresParecidos', () => {
  const candidatos = [
    { id: 1, name: 'Textiles del Valle' },
    { id: 2, name: 'Banco Pichincha' },
    { id: 3, name: 'Textiles Valle' },
  ];

  it('excluye el match exacto (ya lo cubre el aviso de coincidencias)', () => {
    const r = nombresParecidos('Textiles del Valle', candidatos);
    expect(r.map((c) => c.id)).not.toContain(1);
  });

  it('encuentra el parecido y no el que no se relaciona', () => {
    const r = nombresParecidos('Textiles del Valle', candidatos);
    expect(r.map((c) => c.id)).toEqual([3]);
  });

  it('excluye el propio id al editar', () => {
    const r = nombresParecidos('Textiles Valle', candidatos, 3);
    expect(r.map((c) => c.id)).toEqual([1]);
  });

  it('sin candidatos parecidos, devuelve vacío', () => {
    expect(nombresParecidos('Hospital Metropolitano', candidatos)).toEqual([]);
  });
});
