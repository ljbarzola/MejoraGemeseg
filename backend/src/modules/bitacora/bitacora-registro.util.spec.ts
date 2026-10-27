import {
  esRutaExcluida,
  idDeParams,
  idDeRespuesta,
  moduloDeRuta,
  nombreDeRespuesta,
  normalizarRuta,
} from './bitacora-registro.util';

describe('bitacora-registro.util', () => {
  describe('normalizarRuta', () => {
    it('quita el prefijo /api', () => {
      expect(normalizarRuta('/api/tasks/:id/status')).toBe('/tasks/:id/status');
    });

    it('deja igual una ruta sin prefijo', () => {
      expect(normalizarRuta('/tasks')).toBe('/tasks');
    });

    it('no confunde /apix con el prefijo', () => {
      expect(normalizarRuta('/apix/foo')).toBe('/apix/foo');
    });

    it.each([undefined, '', '/api', '/api/'])('devuelve null para %p', (r) => {
      expect(normalizarRuta(r)).toBeNull();
    });
  });

  describe('esRutaExcluida', () => {
    it.each([
      '/auth/login',
      '/bitacora/equipo',
      '/bitacora/activaciones/:userId',
      '/notifications/read-all',
      '/users/me/preferences/columnas:tabla',
      '/public/surveys/:token',
    ])('excluye %s', (r) => {
      expect(esRutaExcluida(r)).toBe(true);
    });

    it.each(['/tasks/:id', '/users/me', '/authors', '/ventas/oportunidades'])(
      'no excluye %s',
      (r) => {
        expect(esRutaExcluida(r)).toBe(false);
      },
    );
  });

  it('moduloDeRuta toma el primer tramo', () => {
    expect(moduloDeRuta('/ventas/oportunidades/:id')).toBe('ventas');
    expect(moduloDeRuta('/tasks')).toBe('tasks');
  });

  describe('idDeParams', () => {
    it('prefiere :id', () => {
      expect(idDeParams({ projectId: '3', id: '7' })).toBe(7);
    });

    it('si no hay :id toma el primer número', () => {
      expect(idDeParams({ projectId: '3' })).toBe(3);
    });

    it.each([undefined, {}, { id: 'abc' }, { id: '99999999999' }])(
      'devuelve null para %p',
      (p) => {
        expect(idDeParams(p)).toBeNull();
      },
    );
  });

  describe('idDeRespuesta', () => {
    it('toma el id numérico de la respuesta', () => {
      expect(idDeRespuesta({ id: 12, title: 'x' })).toBe(12);
    });

    it.each([
      null,
      undefined,
      'texto',
      [{ id: 1 }],
      { id: '12' },
      { id: 0 },
      { id: 3_000_000_000 },
    ])('devuelve null para %p', (r) => {
      expect(idDeRespuesta(r)).toBeNull();
    });
  });

  describe('nombreDeRespuesta', () => {
    it('toma el título', () => {
      expect(nombreDeRespuesta({ id: 1, title: 'Informe de custodias' })).toBe(
        'Informe de custodias',
      );
    });

    it('el título gana sobre el nombre', () => {
      expect(nombreDeRespuesta({ name: 'B', title: 'A' })).toBe('A');
    });

    it('limpia espacios repetidos', () => {
      expect(nombreDeRespuesta({ name: '  Ana   Pérez ' })).toBe('Ana Pérez');
    });

    it('recorta los nombres muy largos a 150 caracteres con puntos suspensivos', () => {
      const nombre = nombreDeRespuesta({ title: 'x'.repeat(400) });
      expect(nombre).toHaveLength(150);
      expect(nombre?.endsWith('…')).toBe(true);
    });

    it('nunca toma descripciones, contraseñas ni campos fuera de la lista corta', () => {
      expect(
        nombreDeRespuesta({
          description: 'texto largo',
          password: 'secreto',
          email: 'a@b.c',
        }),
      ).toBeNull();
    });

    it.each([null, undefined, 'texto', 5, [{ title: 'x' }]])(
      'devuelve null para %p',
      (r) => {
        expect(nombreDeRespuesta(r)).toBeNull();
      },
    );
  });
});
