import {
  detectarBloques,
  elegirPuesto,
  mapearColumnasAFechas,
  mismoNombre,
  normalizarCedula,
  quitarPalabras,
} from './horarios-importar.util';

const dias = (n: number) => Array.from({ length: n }, (_, i) => String(i + 1));

describe('detectarBloques', () => {
  it('lee título, cédula y turnos de un bloque; la fila vacía lo cierra', () => {
    const m = [
      [],
      ['', 'HOSPITAL VALDIVIA', 'CEDULA'],
      ['', 'NOMBRES Y APELLIDOS', 'CEDULA', ...dias(3)],
      ['', 'JADY BOLAÑOS', '802631713', 'D', '', 'N'],
      ['', 'SIN CEDULA', '', 'L', 'L', 'L'],
      [],
      ['', 'OTRO PUESTO', 'CEDULA'],
      ['', 'NOMBRES Y APELLIDOS', 'CEDULA', ...dias(3)],
      ['', 'ALGUIEN MAS', '0912345678', 'D', 'D', 'D'],
    ];
    const b = detectarBloques(m);
    expect(b).toHaveLength(2);
    expect(b[0].titulo).toBe('HOSPITAL VALDIVIA');
    expect(b[0].personas).toHaveLength(2);
    expect(b[0].personas[0].cedula).toBe('0802631713');
    expect(b[0].personas[0].turnos.map((t) => t.codigo)).toEqual(['D', 'N']);
    expect(b[0].personas[1].cedula).toBeNull();
  });

  it('acepta bloques sin columna de cédula (puestos privados)', () => {
    const m = [
      ['', 'PUERTA AL RIO.'],
      ['', 'NOMBRES Y APELLIDOS', ...dias(2)],
      ['', 'VICENTE CHINGA', 'd', 'N'],
    ];
    const [b] = detectarBloques(m);
    expect(b.titulo).toBe('PUERTA AL RIO');
    expect(b.personas[0].cedula).toBeNull();
    expect(b.personas[0].turnos.map((t) => t.codigo)).toEqual(['D', 'N']);
  });
});

describe('quitarPalabras', () => {
  const t = (s: string[]) => s.map((codigo, i) => ({ col: i, codigo })).filter((x) => x.codigo);

  it('no toma la D de DESCANSO como turno de día', () => {
    const r = quitarPalabras(t(['D', 'D', 'L', 'D', 'E', 'S', 'C', 'A', 'N', 'S', 'O']));
    expect(r.palabras).toEqual(['DESCANSO']);
    expect(r.turnos.map((x) => x.codigo)).toEqual(['D', 'D', 'L']);
  });

  it('reconoce la palabra aunque haya una celda vacía entre letras', () => {
    const r = quitarPalabras(t(['V', '', 'A', '', 'C', '', 'A', '', 'C', 'I', 'O', 'N', 'E', '', 'S']));
    expect(r.palabras).toEqual(['VACACIONES']);
    expect(r.turnos).toHaveLength(0);
  });

  it('deja intacto un horario normal', () => {
    const r = quitarPalabras(t(['D', 'N', 'L', 'D', 'N', 'L']));
    expect(r.palabras).toEqual([]);
    expect(r.turnos).toHaveLength(6);
  });
});

describe('mapearColumnasAFechas', () => {
  it('sigue el rango del horario aunque cruce de mes (30, 1, 2…)', () => {
    const rango = ['2026-07-30', '2026-07-31', '2026-08-01', '2026-08-02'];
    const cols = [30, 31, 1, 2].map((dia, i) => ({ col: 3 + i, dia }));
    const mapa = mapearColumnasAFechas(cols, rango);
    expect([...mapa.values()]).toEqual(rango);
  });

  it('ignora una columna cuyo día no está en el rango', () => {
    const mapa = mapearColumnasAFechas([{ col: 3, dia: 1 }, { col: 4, dia: 15 }], ['2026-03-01', '2026-03-02']);
    expect(mapa.size).toBe(1);
  });
});

describe('coincidencias', () => {
  it('nombres iguales aunque cambie el orden o las tildes', () => {
    expect(mismoNombre('ROLANDO QUIMIS PILAY', 'Quimis Pilay Rolando')).toBe(true);
    expect(mismoNombre('KEVIN', 'Kevin Sanchez')).toBe(false);
  });

  it('repone el cero de una cédula de 9 dígitos', () => {
    expect(normalizarCedula('923189799')).toBe('0923189799');
    expect(normalizarCedula('')).toBeNull();
  });

  it('elige el puesto por nombre igual o contenido, y no adivina si hay dudas', () => {
    const ps = [{ nombre: 'Hospital Valdivia' }, { nombre: 'Ministerio Roblex 1' }, { nombre: 'Ministerio Roblex 2' }];
    expect(elegirPuesto('HOSPITAL VALDIVIA', ps)?.nombre).toBe('Hospital Valdivia');
    expect(elegirPuesto('Ministerio', ps)).toBeNull();
  });
});
