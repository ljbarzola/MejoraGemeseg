import { armarEjecutado, type CeldaProgramada } from './horario-ejecutado.util';

const codigos = {
  D: { esDescanso: false, esCustodia: false },
  N: { esDescanso: false, esCustodia: false },
  L: { esDescanso: true, esCustodia: false },
  DC: { esDescanso: true, esCustodia: true },
};
const c = (cedula: string, nombre: string, fecha: string, codigo: string): CeldaProgramada => ({
  puestoId: 1,
  cedula,
  nombre,
  fecha,
  codigo,
});

describe('armarEjecutado — faltas y reemplazos', () => {
  const celdas = [c('111', 'Ana', '2026-11-02', 'D'), c('222', 'Luis', '2026-11-02', 'L')];

  it('sin faltas, lo ejecutado es igual a lo programado', () => {
    const r = armarEjecutado(celdas, [], [], codigos);
    expect(r.celdas.every((x) => x.estado === 'IGUAL' && x.ejecutado === x.programado)).toBe(true);
    expect(r.resumen).toEqual({ faltas: 0, cubiertas: 0, sinCubrir: 0, avisosCustodia: 0 });
  });

  it('falta sin reemplazo: ese turno queda vacío', () => {
    const r = armarEjecutado(
      celdas,
      [{ puestoId: 1, fecha: '2026-11-02', cedula: '111', estado: 'POR_CUBRIR', motivo: 'ENFERMEDAD', reemplazoCedula: null, reemplazoNombre: null }],
      [],
      codigos,
    );
    const ana = r.celdas.find((x) => x.cedula === '111')!;
    expect(ana.estado).toBe('FALTO');
    expect(ana.ejecutado).toBeNull();
    expect(r.resumen.sinCubrir).toBe(1);
  });

  it('falta con reemplazo: el reemplazo hace el turno de quien faltó (aunque tuviera libre)', () => {
    const r = armarEjecutado(
      celdas,
      [{ puestoId: 1, fecha: '2026-11-02', cedula: '111', estado: 'CUBIERTA', motivo: 'NO_AVISO', reemplazoCedula: '222', reemplazoNombre: 'Luis' }],
      [],
      codigos,
    );
    const luis = r.celdas.find((x) => x.cedula === '222')!;
    expect(luis.programado).toBe('L');
    expect(luis.ejecutado).toBe('D');
    expect(luis.estado).toBe('CUBRE');
    expect(r.resumen.cubiertas).toBe(1);
  });

  it('un reemplazo que no estaba en el horario se agrega como celda nueva', () => {
    const r = armarEjecutado(
      [c('111', 'Ana', '2026-11-02', 'N')],
      [{ puestoId: 1, fecha: '2026-11-02', cedula: '111', estado: 'CUBIERTA', motivo: 'PERMISO', reemplazoCedula: '999', reemplazoNombre: 'Sara' }],
      [],
      codigos,
    );
    const sara = r.celdas.find((x) => x.cedula === '999')!;
    expect(sara.programado).toBeNull();
    expect(sara.ejecutado).toBe('N');
  });
});

describe('armarEjecutado — cruce con Custodias', () => {
  it('DC sin custodia ese día: avisa que hay que revisar', () => {
    const r = armarEjecutado([c('0912345678', 'Ana', '2026-11-03', 'DC')], [], [], codigos);
    expect(r.avisos.map((a) => a.tipo)).toEqual(['DC_SIN_CUSTODIA']);
  });

  it('DC con una custodia de esa persona ese día: no avisa (aunque la cédula perdiera el cero)', () => {
    const r = armarEjecutado(
      [c('0912345678', 'Ana', '2026-11-03', 'DC')],
      [],
      [{ fecha: '2026-11-03', guia: 'G-77', cedulas: ['0912345678'] }],
      codigos,
    );
    expect(r.avisos).toHaveLength(0);
  });

  it('tiene una custodia pero su turno no es DC: avisa sin cambiar el horario', () => {
    const r = armarEjecutado(
      [c('0912345678', 'Ana', '2026-11-03', 'D')],
      [],
      [{ fecha: '2026-11-03', guia: 'G-77', cedulas: ['0912345678'] }],
      codigos,
    );
    expect(r.avisos[0].tipo).toBe('CUSTODIA_SIN_DC');
    expect(r.celdas[0].ejecutado).toBe('D');
  });

  it('quien faltó no genera avisos de custodia', () => {
    const r = armarEjecutado(
      [c('0912345678', 'Ana', '2026-11-03', 'DC')],
      [{ puestoId: 1, fecha: '2026-11-03', cedula: '0912345678', estado: 'POR_CUBRIR', motivo: 'OTRO', reemplazoCedula: null, reemplazoNombre: null }],
      [],
      codigos,
    );
    expect(r.avisos).toHaveLength(0);
  });
});
