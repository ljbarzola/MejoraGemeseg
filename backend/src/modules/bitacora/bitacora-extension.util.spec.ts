import {
  CODIGO_VIGENCIA_MS,
  dentroDelHorario,
  diasATexto,
  diasDeTexto,
  diaSemanaEcuador,
  errorDeHorario,
  externalIdDeTramo,
  generarCodigo,
  generarToken,
  hashear,
  Horario,
  normalizarCodigo,
  normalizarDominio,
  tokenDeCabecera,
  TRAMO_MAXIMO_MINUTOS,
  TRAMOS_POR_PETICION,
  validarTramos,
} from './bitacora-extension.util';

// Miércoles 28 de octubre de 2026: 08:00 en Ecuador = 13:00 UTC.
const oficina: Horario = {
  dias: [1, 2, 3, 4, 5],
  inicio: '08:00',
  fin: '17:00',
};
const miercoles = (horaUtc: string) => new Date(`2026-10-28T${horaUtc}:00Z`);

describe('bitacora-extension.util', () => {
  describe('errorDeHorario', () => {
    it('acepta un horario normal', () => {
      expect(errorDeHorario(oficina)).toBeNull();
    });

    it('pide al menos un día y que sean del 1 al 7', () => {
      expect(errorDeHorario({ ...oficina, dias: [] })).toMatch(
        /al menos un día/,
      );
      expect(errorDeHorario({ ...oficina, dias: [0, 1] })).toMatch(
        /no son válidos/,
      );
      expect(errorDeHorario({ ...oficina, dias: [8] })).toMatch(
        /no son válidos/,
      );
      expect(errorDeHorario({ ...oficina, dias: [1.5] })).toMatch(
        /no son válidos/,
      );
    });

    it('pide horas con formato HH:MM y fin posterior al inicio', () => {
      expect(errorDeHorario({ ...oficina, inicio: '8:00' })).toMatch(
        /hora de inicio/,
      );
      expect(errorDeHorario({ ...oficina, fin: '24:00' })).toMatch(
        /hora de inicio/,
      );
      expect(
        errorDeHorario({ ...oficina, inicio: '17:00', fin: '08:00' }),
      ).toMatch(/posterior/);
      expect(
        errorDeHorario({ ...oficina, inicio: '08:00', fin: '08:00' }),
      ).toMatch(/posterior/);
    });
  });

  describe('días', () => {
    it('se guardan ordenados y sin repetir, y se leen de vuelta', () => {
      expect(diasATexto([5, 1, 3, 1])).toBe('1,3,5');
      expect(diasDeTexto('1,3,5')).toEqual([1, 3, 5]);
    });

    it('al leer ignora lo que no es un día válido', () => {
      expect(diasDeTexto('1,x,9,0,7')).toEqual([1, 7]);
      expect(diasDeTexto('')).toEqual([]);
    });

    it('el día de la semana es el de Ecuador, no el de UTC', () => {
      expect(diaSemanaEcuador(miercoles('13:00'))).toBe(3);
      // 02:00 UTC del jueves = 21:00 del miércoles en Ecuador.
      expect(diaSemanaEcuador(new Date('2026-10-29T02:00:00Z'))).toBe(3);
      // Domingo = 7.
      expect(diaSemanaEcuador(new Date('2026-11-01T15:00:00Z'))).toBe(7);
    });
  });

  describe('dentroDelHorario', () => {
    it('incluye el minuto de inicio y excluye el de fin', () => {
      expect(dentroDelHorario(oficina, miercoles('13:00'))).toBe(true);
      expect(dentroDelHorario(oficina, miercoles('12:59'))).toBe(false);
      expect(dentroDelHorario(oficina, miercoles('21:59'))).toBe(true);
      expect(dentroDelHorario(oficina, miercoles('22:00'))).toBe(false);
    });

    it('no registra los días que no están en el horario', () => {
      expect(dentroDelHorario(oficina, new Date('2026-10-31T15:00:00Z'))).toBe(
        false,
      );
      expect(dentroDelHorario(oficina, new Date('2026-11-01T15:00:00Z'))).toBe(
        false,
      );
    });

    it('usa la hora de Ecuador: las 20:00 de Guayaquil ya son del día siguiente en UTC', () => {
      const noche: Horario = { dias: [3], inicio: '19:00', fin: '21:00' };
      // 01:00 UTC del jueves = 20:00 del miércoles en Ecuador.
      expect(dentroDelHorario(noche, new Date('2026-10-29T01:00:00Z'))).toBe(
        true,
      );
    });
  });

  describe('normalizarDominio', () => {
    it('deja solo el dominio en minúsculas y sin www', () => {
      expect(normalizarDominio('WWW.Banco.com')).toBe('banco.com');
      expect(normalizarDominio('mail.google.com')).toBe('mail.google.com');
      expect(normalizarDominio('ejemplo.com.')).toBe('ejemplo.com');
    });

    it('rechaza una dirección completa: nunca se guarda la ruta ni los parámetros', () => {
      expect(normalizarDominio('https://ejemplo.com/cuenta?id=1')).toBeNull();
      expect(normalizarDominio('ejemplo.com/cuenta')).toBeNull();
      expect(normalizarDominio('ejemplo.com:8080')).toBeNull();
      expect(normalizarDominio('usuario@ejemplo.com')).toBeNull();
    });

    it('rechaza lo que no es un dominio de internet', () => {
      expect(normalizarDominio('localhost')).toBeNull();
      expect(normalizarDominio('192.168.0.1')).toBeNull();
      expect(normalizarDominio('chrome://extensions')).toBeNull();
      expect(normalizarDominio('')).toBeNull();
      expect(normalizarDominio(`${'a'.repeat(100)}.com`)).toBeNull();
      expect(normalizarDominio(42)).toBeNull();
      expect(normalizarDominio(undefined)).toBeNull();
    });
  });

  describe('validarTramos', () => {
    // Ahora = miércoles 11:00 en Ecuador (16:00 UTC); todo lo de abajo cae dentro del horario.
    const ahora = miercoles('16:00');
    const tramo = (parcial: Record<string, unknown> = {}) => ({
      dominio: 'ejemplo.com',
      inicio: '2026-10-28T15:00:00Z',
      minutos: 5,
      ...parcial,
    });

    it('acepta un tramo bien formado y lo deja en el minuto exacto', () => {
      const r = validarTramos(
        [tramo({ inicio: '2026-10-28T15:00:41Z' })],
        oficina,
        null,
        ahora,
      );
      expect(r.descartados).toBe(0);
      expect(r.validos).toEqual([
        {
          dominio: 'ejemplo.com',
          inicio: new Date('2026-10-28T15:00:00Z'),
          minutos: 5,
        },
      ]);
    });

    it('descarta lo mal formado sin romper el resto', () => {
      const r = validarTramos(
        [
          tramo(),
          tramo({ dominio: 'https://ejemplo.com/x' }),
          tramo({ dominio: '10.0.0.1' }),
          tramo({ inicio: 'mañana' }),
          tramo({ inicio: undefined }),
          tramo({ minutos: 0 }),
          tramo({ minutos: 2.5 }),
          tramo({ minutos: TRAMO_MAXIMO_MINUTOS + 1 }),
          null,
          'texto',
        ],
        oficina,
        null,
        ahora,
      );
      expect(r.validos).toHaveLength(1);
      expect(r.descartados).toBe(9);
    });

    it('descarta lo que cae fuera del horario, aunque solo sea el último minuto del tramo', () => {
      // 16:58 a 17:02 de Ecuador… en UTC: 21:58 + 5 min cruza el fin (22:00 UTC).
      const tarde = miercoles('22:30');
      const cruza = tramo({ inicio: '2026-10-28T21:58:00Z', minutos: 5 });
      expect(validarTramos([cruza], oficina, null, tarde).validos).toHaveLength(
        0,
      );
      const dentro = tramo({ inicio: '2026-10-28T21:55:00Z', minutos: 5 });
      expect(
        validarTramos([dentro], oficina, null, tarde).validos,
      ).toHaveLength(1);
      const madrugada = tramo({ inicio: '2026-10-28T11:00:00Z', minutos: 1 });
      expect(
        validarTramos([madrugada], oficina, null, ahora).validos,
      ).toHaveLength(0);
    });

    it('descarta lo futuro y lo muy viejo', () => {
      const futuro = tramo({ inicio: '2026-10-28T17:00:00Z' });
      const viejo = tramo({ inicio: '2026-10-25T15:00:00Z' });
      const r = validarTramos([futuro, viejo], oficina, null, ahora);
      expect(r.validos).toHaveLength(0);
      expect(r.descartados).toBe(2);
    });

    it('descarta lo anterior al momento en que se activó la hoja', () => {
      const activadaDespues = new Date('2026-10-28T15:30:00Z');
      const antes = tramo({ inicio: '2026-10-28T15:00:00Z', minutos: 5 });
      const despues = tramo({ inicio: '2026-10-28T15:30:00Z', minutos: 5 });
      const r = validarTramos(
        [antes, despues],
        oficina,
        activadaDespues,
        ahora,
      );
      expect(r.validos).toHaveLength(1);
      expect(r.validos[0].inicio).toEqual(new Date('2026-10-28T15:30:00Z'));
    });

    it('no repite el mismo sitio en el mismo minuto', () => {
      const r = validarTramos(
        [tramo(), tramo(), tramo({ dominio: 'www.ejemplo.com' })],
        oficina,
        null,
        ahora,
      );
      expect(r.validos).toHaveLength(1);
      expect(r.descartados).toBe(2);
    });

    it('acepta como mucho los tramos de una petición y cuenta el resto como descartado', () => {
      const muchos = Array.from({ length: TRAMOS_POR_PETICION + 5 }, (_, i) =>
        tramo({ dominio: `sitio${i}.com` }),
      );
      const r = validarTramos(muchos, oficina, null, ahora);
      expect(r.validos).toHaveLength(TRAMOS_POR_PETICION);
      expect(r.descartados).toBe(5);
    });

    it('algo que no es una lista no guarda nada', () => {
      expect(validarTramos({ x: 1 }, oficina, null, ahora)).toEqual({
        validos: [],
        descartados: 0,
      });
      expect(validarTramos(undefined, oficina, null, ahora).validos).toEqual(
        [],
      );
    });
  });

  describe('externalIdDeTramo', () => {
    it('es estable: reenviar el mismo tramo da el mismo identificador', () => {
      const t = {
        dominio: 'ejemplo.com',
        inicio: new Date('2026-10-28T15:00:00Z'),
        minutos: 5,
      };
      expect(externalIdDeTramo(7, t)).toBe(
        '7|ejemplo.com|2026-10-28T15:00:00.000Z',
      );
      expect(externalIdDeTramo(7, t)).toBe(externalIdDeTramo(7, { ...t }));
      expect(externalIdDeTramo(8, t)).not.toBe(externalIdDeTramo(7, t));
    });
  });

  describe('código y token', () => {
    it('el código tiene el formato XXXX-XXXX sin caracteres confusos', () => {
      for (let i = 0; i < 50; i++) {
        expect(generarCodigo()).toMatch(
          /^[A-HJKMNP-Z2-9]{4}-[A-HJKMNP-Z2-9]{4}$/,
        );
      }
    });

    it('acepta el código en minúsculas, con espacio o sin guion', () => {
      expect(normalizarCodigo('k7m2-9qxp')).toBe('K7M29QXP');
      expect(normalizarCodigo(' K7M2 9QXP ')).toBe('K7M29QXP');
      expect(normalizarCodigo('K7M29QXP')).toBe('K7M29QXP');
    });

    it('rechaza códigos de largo o caracteres que no existen', () => {
      expect(normalizarCodigo('K7M2-9QX')).toBeNull();
      expect(normalizarCodigo('K7M2-9QXPP')).toBeNull();
      expect(normalizarCodigo('K7M2-9QX0')).toBeNull(); // el 0 no está en el alfabeto
      expect(normalizarCodigo(12345678)).toBeNull();
      expect(normalizarCodigo(undefined)).toBeNull();
    });

    it('vale 10 minutos', () => {
      expect(CODIGO_VIGENCIA_MS).toBe(10 * 60_000);
    });

    it('el token empieza con bx_, es distinto cada vez y solo se guarda su hash', () => {
      const a = generarToken();
      const b = generarToken();
      expect(a).toMatch(/^bx_[A-Za-z0-9_-]{40,}$/);
      expect(a).not.toBe(b);
      expect(hashear(a)).toMatch(/^[0-9a-f]{64}$/);
      expect(hashear(a)).toBe(hashear(a));
      expect(hashear(a)).not.toContain(a);
    });
  });

  describe('tokenDeCabecera', () => {
    const token = generarToken();

    it('saca el token de «Bearer …»', () => {
      expect(tokenDeCabecera(`Bearer ${token}`)).toBe(token);
    });

    it('no acepta otra forma ni un token que no sea de la extensión', () => {
      expect(tokenDeCabecera(token)).toBeNull();
      expect(tokenDeCabecera('Bearer eyJhbGciOiJIUzI1NiJ9.abc.def')).toBeNull();
      expect(tokenDeCabecera('Bearer bx_corto')).toBeNull();
      expect(tokenDeCabecera(undefined)).toBeNull();
      expect(tokenDeCabecera(['Bearer x'])).toBeNull();
    });
  });
});
