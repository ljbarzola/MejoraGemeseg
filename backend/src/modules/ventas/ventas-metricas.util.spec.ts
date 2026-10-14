import {
  conversionEmbudo,
  mediana,
  percentil,
  primeraEntrada,
  resumirMuestra,
} from './ventas-metricas.util';

describe('mediana y percentil', () => {
  it('devuelven null sin datos', () => {
    expect(mediana([])).toBeNull();
    expect(percentil([], 75)).toBeNull();
  });

  it('mediana de cantidad impar y par', () => {
    expect(mediana([5, 1, 3])).toBe(3);
    expect(mediana([1, 2, 3, 4])).toBe(2.5);
  });

  it('un solo valor es su propia mediana y percentil', () => {
    expect(mediana([7])).toBe(7);
    expect(percentil([7], 75)).toBe(7);
  });

  it('un valor extremo no arrastra la mediana', () => {
    expect(mediana([1, 2, 3, 4, 500])).toBe(3);
  });
});

describe('resumirMuestra', () => {
  it('marca pocas muestras por debajo de 5 y trae el n', () => {
    expect(resumirMuestra([1, 2, 3, 4])).toMatchObject({ n: 4, pocasMuestras: true });
    expect(resumirMuestra([1, 2, 3, 4, 5])).toMatchObject({ n: 5, pocasMuestras: false, mediana: 3 });
  });

  it('sin datos no inventa cifras', () => {
    expect(resumirMuestra([])).toEqual({ n: 0, mediana: null, p75: null, pocasMuestras: true });
  });
});

describe('primeraEntrada', () => {
  it('devuelve la primera vez que entró a la etapa aunque haya vuelto después', () => {
    const cambios = [
      { toStatus: 'COTIZADO', createdAt: new Date('2026-10-05T00:00:00Z') },
      { toStatus: 'LEIDO', createdAt: new Date('2026-10-02T00:00:00Z') },
      { toStatus: 'COTIZADO', createdAt: new Date('2026-10-03T00:00:00Z') },
    ];
    expect(primeraEntrada(cambios, 'COTIZADO')?.toISOString()).toBe('2026-10-03T00:00:00.000Z');
    expect(primeraEntrada(cambios, 'ACEPTADO')).toBeNull();
  });
});

describe('conversionEmbudo', () => {
  const etapas = ['RECIBIDO', 'LEIDO', 'COTIZADO', 'ACEPTADO'];

  it('cuenta quién alcanzó cada etapa y la conversión a la siguiente', () => {
    const opps = [
      { posicionMaxima: 0 },
      { posicionMaxima: 1 },
      { posicionMaxima: 2 },
      { posicionMaxima: 3 },
    ];
    const r = conversionEmbudo(etapas, opps);
    expect(r.map((p) => p.alcanzaron)).toEqual([4, 3, 2, 1]);
    expect(r[0]).toMatchObject({ convirtieron: 3, tasa: 75 });
    expect(r[2]).toMatchObject({ convirtieron: 1, tasa: 50 });
    expect(r[3]).toMatchObject({ convirtieron: null, tasa: null });
  });

  it('una oportunidad que se salta etapas cuenta como que las alcanzó', () => {
    const r = conversionEmbudo(etapas, [{ posicionMaxima: 3 }]);
    expect(r.map((p) => p.alcanzaron)).toEqual([1, 1, 1, 1]);
  });

  it('sin oportunidades la tasa es null, no 0', () => {
    expect(conversionEmbudo(etapas, [])[0].tasa).toBeNull();
  });
});
