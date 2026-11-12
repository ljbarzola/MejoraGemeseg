import {
  construirCifras,
  leerRespuestaModelo,
  textoBase,
} from './bitacora-resumen.util';
import { EventoHoja } from './bitacora-hoja.util';

// Miércoles 28 de octubre de 2026; «hora(9, 30)» = 09:30 en Ecuador.
const hora = (h: number, m = 0) => new Date(Date.UTC(2026, 9, 28, h + 5, m));

const eventos: EventoHoja[] = [
  {
    fuente: 'APP',
    modulo: 'ventas',
    accion: 'CREAR',
    ruta: '/ventas/oportunidades',
    nombre: 'Solutech',
    ocurridoEn: hora(9, 0),
  },
  {
    fuente: 'EXTENSION',
    modulo: 'web',
    accion: 'SITIO',
    ruta: '/document/d/:id/edit',
    nombre: 'docs.google.com',
    titulo: 'Contrato Solutech',
    minutos: 10,
    ocurridoEn: hora(9, 10),
  },
  {
    fuente: 'GOOGLE',
    modulo: 'drive',
    accion: 'edit',
    ruta: null,
    nombre: 'Informe.docx',
    ocurridoEn: hora(11, 0),
  },
];

describe('construirCifras', () => {
  const c = construirCifras({
    fecha: '2026-10-28',
    eventos,
    notas: [
      {
        desde: '14:00',
        hasta: '15:00',
        tipo: 'REUNION',
        texto: 'Reunión con Solutech',
      },
    ],
    tiempoExtraMinutos: 25,
  });

  it('cuenta por fuente y suma los minutos del navegador', () => {
    expect(c.totalEventos).toBe(3);
    expect(c.accionesApp).toBe(1);
    expect(c.eventosGoogle).toBe(1);
    expect(c.minutosWeb).toBe(10);
  });

  it('agrupa los sitios con su título y los módulos con ejemplos', () => {
    expect(c.sitios[0].sitio).toContain('docs.google.com');
    expect(c.sitios[0].sitio).toContain('Contrato Solutech');
    expect(c.modulos[0].modulo).toBe('Ventas y CRM');
    expect(c.modulos[0].ejemplos.length).toBeGreaterThan(0);
  });

  it('guarda las anotaciones aparte y el tiempo extra', () => {
    expect(c.notas).toHaveLength(1);
    expect(c.tiempoExtraMinutos).toBe(25);
  });
});

describe('textoBase', () => {
  it('sin nada dice que no hay actividad', () => {
    const t = textoBase(
      construirCifras({
        fecha: '2026-10-28',
        eventos: [],
        notas: [],
        tiempoExtraMinutos: 0,
      }),
    );
    expect(t.texto).toMatch(/No hay actividad/);
    expect(t.puntos).toEqual([]);
  });

  it('arma un párrafo con el horario y puntos, marcando lo escrito por la persona', () => {
    const t = textoBase(
      construirCifras({
        fecha: '2026-10-28',
        eventos,
        notas: [
          { desde: null, hasta: null, tipo: 'VISITA', texto: 'Visita a obra' },
        ],
        tiempoExtraMinutos: 0,
      }),
    );
    expect(t.texto).toMatch(/09:00/);
    expect(
      t.puntos.some((p) => p.startsWith('Anotado por la persona')),
    ).toBe(true);
    expect(t.puntos.some((p) => p.includes('Visita a obra'))).toBe(true);
  });
});

describe('leerRespuestaModelo', () => {
  it('lee el JSON aunque venga entre comillas de código', () => {
    const r = leerRespuestaModelo(
      '```json\n{"texto":"Hola","puntos":["a","b"]}\n```',
    );
    expect(r).toEqual({ texto: 'Hola', puntos: ['a', 'b'] });
  });

  it('devuelve null con otra cosa', () => {
    expect(leerRespuestaModelo('no es json')).toBeNull();
    expect(leerRespuestaModelo('{"texto":"","puntos":[]}')).toBeNull();
    expect(leerRespuestaModelo('{"texto":"x"}')).toBeNull();
  });
});
