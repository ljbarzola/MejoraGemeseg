import {
  conEjemplos,
  fechaCorta,
  finEfectivoDelContrato,
  lineasDelResumen,
  mensajeDelResumen,
  PendientesOperaciones,
  TEMA_VACIO,
} from './operaciones-pendientes.util';

const vacio = (): PendientesOperaciones => ({
  fecha: '2026-11-18',
  faltasSinCubrir: TEMA_VACIO,
  puestosSinCubrir: TEMA_VACIO,
  bitacorasSinSubir: TEMA_VACIO,
  permisosDeArmas: TEMA_VACIO,
  inventarioBajoMinimo: TEMA_VACIO,
  visitasSinRegistrar: TEMA_VACIO,
  horariosSinAprobar: TEMA_VACIO,
  contratosPorVencer: TEMA_VACIO,
});

describe('conEjemplos', () => {
  it('recorta los ejemplos y conserva el total', () => {
    const t = conEjemplos(['a', 'b', 'c', 'd', 'e'], 5, 3);
    expect(t.total).toBe(5);
    expect(t.ejemplos).toEqual(['a', 'b', 'c']);
  });
});

describe('mensajeDelResumen', () => {
  it('si no hay nada pendiente no hay mensaje (nunca un aviso vacío)', () => {
    expect(lineasDelResumen(vacio())).toEqual([]);
    expect(mensajeDelResumen(vacio())).toBeNull();
  });

  it('un renglón por cada tema con algo, con "y N más" cuando hay más que los ejemplos', () => {
    const p = vacio();
    p.faltasSinCubrir = conEjemplos(['Ana, Garita Norte, 17 nov', 'Luis, Garita Sur, 18 nov'], 5, 2);
    p.contratosPorVencer = conEjemplos(['Ministerio, contrato 12, vence en 9 d'], 1);
    const msg = mensajeDelResumen(p)!;
    expect(msg).toContain('Esto tiene pendiente Operaciones hoy:');
    expect(msg).toContain('• 5 faltas sin cubrir (Ana, Garita Norte, 17 nov; Luis, Garita Sur, 18 nov y 3 más)');
    expect(msg).toContain('• 1 contrato por vencer o vencidos sin cerrar (Ministerio, contrato 12, vence en 9 d)');
    expect(msg.split('\n')).toHaveLength(3);
  });

  it('usa singular cuando hay uno', () => {
    const p = vacio();
    p.horariosSinAprobar = conEjemplos(['X, contrato 1 (borrador)'], 1);
    expect(mensajeDelResumen(p)).toContain('• 1 horario sin aprobar');
  });
});

describe('fechaCorta', () => {
  it('escribe día y mes abreviado', () => {
    expect(fechaCorta('2026-11-17')).toBe('17 nov');
    expect(fechaCorta('2026-01-05')).toBe('5 ene');
  });
});

describe('finEfectivoDelContrato', () => {
  const d = (s: string) => new Date(`${s}T00:00:00Z`);
  it('sin adendas es la fecha del contrato', () => {
    expect(finEfectivoDelContrato(d('2026-12-01'), [])).toEqual(d('2026-12-01'));
  });
  it('una adenda más tardía manda; una más temprana o sin fecha no cuenta', () => {
    const fin = finEfectivoDelContrato(d('2026-12-01'), [
      { fechaFin: d('2027-03-01') },
      { fechaFin: d('2026-06-01') },
      { fechaFin: null },
    ]);
    expect(fin).toEqual(d('2027-03-01'));
  });
});
