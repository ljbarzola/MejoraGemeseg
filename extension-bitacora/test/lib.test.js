import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CONFIG_CADUCA_MS,
  TRAMO_MAXIMO_MINUTOS,
  colapsarMuestras,
  dentroDelHorario,
  dominioDeUrl,
  motivoDePausa,
  nombreEquipo,
  normalizarDominio,
  textoHorario,
} from '../src/lib.js';

const MIN = 60_000;
const oficina = { dias: [1, 2, 3, 4, 5], inicio: '08:00', fin: '17:00', zona: 'America/Guayaquil' };
// Miércoles 28 de octubre de 2026: 08:00 en Ecuador = 13:00 UTC.
const miercoles = (horaUtc) => Date.parse(`2026-10-28T${horaUtc}:00Z`);

test('normalizarDominio deja solo el dominio', () => {
  assert.equal(normalizarDominio('WWW.Banco.com'), 'banco.com');
  assert.equal(normalizarDominio('mail.google.com'), 'mail.google.com');
});

test('normalizarDominio rechaza direcciones completas, IP y localhost', () => {
  for (const malo of ['https://ejemplo.com/x', 'ejemplo.com/x', 'ejemplo.com:8080', '192.168.0.1', 'localhost', '', null, 42]) {
    assert.equal(normalizarDominio(malo), null, String(malo));
  }
});

test('dominioDeUrl solo mira http(s) y nunca devuelve la ruta ni los parámetros', () => {
  assert.equal(dominioDeUrl('https://www.Ejemplo.com/cuenta/123?token=secreto#x'), 'ejemplo.com');
  assert.equal(dominioDeUrl('http://wikipedia.org'), 'wikipedia.org');
  for (const url of ['chrome://extensions', 'edge://settings', 'file:///C:/doc.docx', 'about:blank', 'chrome-extension://abc/popup.html', 'http://192.168.0.1/', 'http://localhost:3000/', 'no es url', '']) {
    assert.equal(dominioDeUrl(url), null, url);
  }
});

test('dentroDelHorario: incluye el minuto de inicio y excluye el de fin', () => {
  assert.equal(dentroDelHorario(oficina, miercoles('13:00')), true);
  assert.equal(dentroDelHorario(oficina, miercoles('12:59')), false);
  assert.equal(dentroDelHorario(oficina, miercoles('21:59')), true);
  assert.equal(dentroDelHorario(oficina, miercoles('22:00')), false);
});

test('dentroDelHorario: usa la hora de Ecuador y no registra los días que no son del horario', () => {
  // Sábado y domingo fuera.
  assert.equal(dentroDelHorario(oficina, Date.parse('2026-10-31T15:00:00Z')), false);
  assert.equal(dentroDelHorario(oficina, Date.parse('2026-11-01T15:00:00Z')), false);
  // 01:00 UTC del jueves son las 20:00 del miércoles en Ecuador.
  const noche = { dias: [3], inicio: '19:00', fin: '21:00', zona: 'America/Guayaquil' };
  assert.equal(dentroDelHorario(noche, Date.parse('2026-10-29T01:00:00Z')), true);
  assert.equal(dentroDelHorario(null, miercoles('15:00')), false);
});

test('motivoDePausa: ante cualquier duda no se registra', () => {
  const ahoraMs = miercoles('15:00');
  const config = { registrando: true, horario: oficina, obtenidaEn: ahoraMs - 5 * MIN };
  assert.equal(motivoDePausa({ token: 'bx_x', config, ahoraMs }), null);
  assert.equal(motivoDePausa({ token: '', config, ahoraMs }), 'sin-vincular');
  assert.equal(motivoDePausa({ token: 'bx_x', config: null, ahoraMs }), 'sin-configuracion');
  assert.equal(
    motivoDePausa({ token: 'bx_x', config: { ...config, obtenidaEn: ahoraMs - CONFIG_CADUCA_MS - 1 }, ahoraMs }),
    'sin-configuracion',
  );
  assert.equal(motivoDePausa({ token: 'bx_x', config: { ...config, registrando: false }, ahoraMs }), 'hoja-inactiva');
  assert.equal(motivoDePausa({ token: 'bx_x', config: { ...config, horario: null }, ahoraMs }), 'sin-horario');
  assert.equal(motivoDePausa({ token: 'bx_x', config, ahoraMs: miercoles('23:00') }), 'fuera-de-horario');
  const domingo = Date.parse('2026-11-01T15:00:00Z');
  assert.equal(
    motivoDePausa({ token: 'bx_x', config: { ...config, obtenidaEn: domingo - 5 * MIN }, ahoraMs: domingo }),
    'fuera-de-horario',
  );
});

test('colapsarMuestras junta minutos seguidos del mismo sitio', () => {
  const t0 = miercoles('15:00');
  const muestras = [0, 1, 2].map((i) => ({ d: 'a.com', t: t0 + i * MIN }));
  assert.deepEqual(colapsarMuestras(muestras), [
    { dominio: 'a.com', inicio: new Date(t0).toISOString(), minutos: 3 },
  ]);
});

test('colapsarMuestras corta al cambiar de sitio, al haber un salto y cada 10 minutos', () => {
  const t0 = miercoles('15:00');
  const largo = Array.from({ length: 12 }, (_, i) => ({ d: 'a.com', t: t0 + i * MIN }));
  const muestras = [...largo, { d: 'b.com', t: t0 + 12 * MIN }, { d: 'a.com', t: t0 + 20 * MIN }];
  const tramos = colapsarMuestras(muestras);
  assert.deepEqual(
    tramos.map((t) => [t.dominio, t.minutos]),
    [['a.com', TRAMO_MAXIMO_MINUTOS], ['a.com', 2], ['b.com', 1], ['a.com', 1]],
  );
  assert.equal(tramos[1].inicio, new Date(t0 + 10 * MIN).toISOString());
});

test('colapsarMuestras ordena lo desordenado, no cuenta dos veces un minuto y no inventa nada si no hay muestras', () => {
  const t0 = miercoles('15:00');
  const tramos = colapsarMuestras([
    { d: 'a.com', t: t0 + MIN },
    { d: 'a.com', t: t0 },
    { d: 'a.com', t: t0 },
  ]);
  assert.deepEqual(tramos, [{ dominio: 'a.com', inicio: new Date(t0).toISOString(), minutos: 2 }]);
  assert.deepEqual(colapsarMuestras([]), []);
});

test('textoHorario escribe el horario para la persona', () => {
  assert.equal(textoHorario(oficina), 'lun a vie, 08:00 a 17:00');
  assert.equal(textoHorario({ dias: [1, 3, 5], inicio: '08:00', fin: '12:00' }), 'lun, mié y vie, 08:00 a 12:00');
  assert.equal(textoHorario({ dias: [6], inicio: '09:00', fin: '13:00' }), 'sáb, 09:00 a 13:00');
  assert.equal(textoHorario(null), 'sin horario');
});

test('nombreEquipo reconoce el navegador y el sistema', () => {
  assert.equal(nombreEquipo('Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/130.0 Safari/537.36 Edg/130.0'), 'Edge en Windows');
  assert.equal(nombreEquipo('Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/130.0 Safari/537.36'), 'Chrome en Windows');
  assert.equal(nombreEquipo('algo raro'), 'Navegador');
});
