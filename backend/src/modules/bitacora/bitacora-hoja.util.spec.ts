import {
  AGRUPAR_MINUTOS,
  construirHoja,
  EventoHoja,
  HUECO_MINIMO_MINUTOS,
} from './bitacora-hoja.util';

// 8:00 de Ecuador = 13:00 UTC.
const base = new Date('2026-10-27T13:00:00Z').getTime();
const en = (minutos: number) => new Date(base + minutos * 60_000);

const ev = (
  minutos: number,
  parcial: Partial<EventoHoja> = {},
): EventoHoja => ({
  fuente: 'APP',
  modulo: 'tasks',
  accion: 'EDITAR',
  ruta: '/tasks/:id',
  nombre: null,
  ocurridoEn: en(minutos),
  ...parcial,
});

describe('construirHoja', () => {
  it('un día sin eventos queda vacío, sin inventar nada', () => {
    const hoja = construirHoja('2026-10-27', []);
    expect(hoja.primera).toBeNull();
    expect(hoja.ultima).toBeNull();
    expect(hoja.totalEventos).toBe(0);
    expect(hoja.huecos).toEqual([]);
    expect(hoja.filas).toEqual([]);
  });

  it('primera y última actividad aunque los eventos lleguen desordenados', () => {
    const hoja = construirHoja('2026-10-27', [ev(300), ev(0), ev(120)]);
    expect(hoja.primera).toBe(en(0).toISOString());
    expect(hoja.ultima).toBe(en(300).toISOString());
    expect(hoja.totalEventos).toBe(3);
  });

  describe('huecos', () => {
    it('cuenta como hueco el silencio de una hora o más entre dos acciones', () => {
      const hoja = construirHoja('2026-10-27', [ev(0), ev(30), ev(120)]);
      expect(hoja.huecoMinimoMinutos).toBe(HUECO_MINIMO_MINUTOS);
      expect(hoja.huecos).toEqual([
        {
          desde: en(30).toISOString(),
          hasta: en(120).toISOString(),
          minutos: 90,
        },
      ]);
    });

    it('59 minutos no es hueco y 60 sí', () => {
      expect(construirHoja('2026-10-27', [ev(0), ev(59)]).huecos).toHaveLength(
        0,
      );
      expect(construirHoja('2026-10-27', [ev(0), ev(60)]).huecos).toHaveLength(
        1,
      );
    });

    it('no hay hueco antes de la primera acción ni después de la última', () => {
      expect(construirHoja('2026-10-27', [ev(0)]).huecos).toEqual([]);
    });

    it('el mínimo se puede cambiar', () => {
      const hoja = construirHoja('2026-10-27', [ev(0), ev(30)], 20);
      expect(hoja.huecos).toHaveLength(1);
      expect(hoja.huecoMinimoMinutos).toBe(20);
    });
  });

  describe('sitios web de la extensión', () => {
    const sitio = (min: number, nombre: string, minutos: number) =>
      ev(min, {
        fuente: 'EXTENSION',
        modulo: 'web',
        accion: 'SITIO',
        ruta: null,
        nombre,
        minutos,
      });

    it('tramos seguidos del mismo sitio son una sola fila con los minutos sumados', () => {
      const hoja = construirHoja('2026-10-27', [
        sitio(0, 'ejemplo.com', 5),
        sitio(5, 'ejemplo.com', 5),
        sitio(10, 'ejemplo.com', 3),
      ]);
      expect(hoja.filas).toHaveLength(1);
      expect(hoja.filas[0]).toMatchObject({
        fuente: 'EXTENSION',
        moduloEtiqueta: 'Navegador',
        texto: 'Sitio web: ejemplo.com (13 min)',
        veces: 3,
        minutos: 13,
        desde: en(0).toISOString(),
        // El último tramo dura 3 minutos: termina en el minuto 12.
        hasta: en(12).toISOString(),
      });
    });

    it('dos sitios distintos nunca se juntan en una fila', () => {
      const hoja = construirHoja('2026-10-27', [
        sitio(0, 'ejemplo.com', 5),
        sitio(5, 'wikipedia.org', 3),
        sitio(8, 'ejemplo.com', 2),
      ]);
      expect(hoja.filas.map((f) => f.texto)).toEqual([
        'Sitio web: ejemplo.com (5 min)',
        'Sitio web: wikipedia.org (3 min)',
        'Sitio web: ejemplo.com (2 min)',
      ]);
    });

    it('la última actividad es cuando termina el último tramo, no cuando empieza', () => {
      const hoja = construirHoja('2026-10-27', [
        ev(0),
        sitio(30, 'ejemplo.com', 10),
      ]);
      expect(hoja.primera).toBe(en(0).toISOString());
      expect(hoja.ultima).toBe(en(39).toISOString());
    });

    it('un tramo largo no deja un hueco falso: el silencio empieza cuando termina', () => {
      // Tramo de 10 min desde el 0; siguiente acción en el 65 → silencio real de 56 min, no de 65.
      const sinHueco = construirHoja('2026-10-27', [
        sitio(0, 'ejemplo.com', 10),
        ev(65),
      ]);
      expect(sinHueco.huecos).toEqual([]);
      const conHueco = construirHoja('2026-10-27', [
        sitio(0, 'ejemplo.com', 10),
        ev(70),
      ]);
      expect(conHueco.huecos).toEqual([
        {
          desde: en(9).toISOString(),
          hasta: en(70).toISOString(),
          minutos: 61,
        },
      ]);
    });

    it('un tramo que cubre una acción posterior no crea hueco con lo que sigue', () => {
      const hoja = construirHoja('2026-10-27', [
        sitio(0, 'ejemplo.com', 10),
        ev(5),
        ev(100),
      ]);
      expect(hoja.huecos).toEqual([
        {
          desde: en(9).toISOString(),
          hasta: en(100).toISOString(),
          minutos: 91,
        },
      ]);
    });
  });

  describe('agrupación de filas', () => {
    const drive = (min: number, nombre: string) =>
      ev(min, {
        fuente: 'GOOGLE',
        modulo: 'drive',
        accion: 'edit',
        ruta: null,
        nombre,
      });

    it('junta acciones iguales seguidas y muestra los nombres', () => {
      const hoja = construirHoja('2026-10-27', [
        drive(0, 'Contrato ACME'),
        drive(3, 'Presupuesto Q4'),
        drive(6, 'Contrato ACME'),
      ]);
      expect(hoja.filas).toHaveLength(1);
      expect(hoja.filas[0].veces).toBe(3);
      expect(hoja.filas[0].texto).toBe(
        'Editó un archivo en Drive (3 veces): «Contrato ACME», «Presupuesto Q4»',
      );
      expect(hoja.filas[0].desde).toBe(en(0).toISOString());
      expect(hoja.filas[0].hasta).toBe(en(6).toISOString());
    });

    it('con más de tres nombres distintos resume el resto', () => {
      const hoja = construirHoja(
        '2026-10-27',
        ['A', 'B', 'C', 'D', 'E'].map((n, i) => drive(i, n)),
      );
      expect(hoja.filas[0].texto).toBe(
        'Editó un archivo en Drive (5 veces): «A», «B», «C» y 2 más',
      );
    });

    it('no junta si pasaron más de 10 minutos', () => {
      const hoja = construirHoja('2026-10-27', [
        drive(0, 'A'),
        drive(AGRUPAR_MINUTOS + 1, 'B'),
      ]);
      expect(hoja.filas).toHaveLength(2);
    });

    it('no junta acciones de distinto módulo o tipo', () => {
      const hoja = construirHoja('2026-10-27', [
        ev(0),
        ev(1, { modulo: 'ventas', ruta: '/ventas/oportunidades/:id' }),
        ev(2, { accion: 'CREAR' }),
      ]);
      expect(hoja.filas).toHaveLength(3);
    });

    it('una acción sola conserva su frase con el nombre', () => {
      const hoja = construirHoja('2026-10-27', [ev(0, { nombre: 'Informe' })]);
      expect(hoja.filas[0].texto).toBe('Editó tarea: «Informe»');
      expect(hoja.filas[0].moduloEtiqueta).toBe('Tareas');
      expect(hoja.filas[0].veces).toBe(1);
    });
  });
});
