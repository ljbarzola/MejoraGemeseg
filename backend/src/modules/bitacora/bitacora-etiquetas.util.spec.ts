import {
  describirAccion,
  describirEvento,
  EventoDescribible,
  moduloEtiqueta,
} from './bitacora-etiquetas.util';

const app = (parcial: Partial<EventoDescribible>): EventoDescribible => ({
  fuente: 'APP',
  modulo: 'tasks',
  accion: 'EDITAR',
  ruta: '/tasks/:id',
  nombre: null,
  ...parcial,
});

describe('bitacora-etiquetas.util', () => {
  describe('acciones de la app', () => {
    it('crear: usa el recurso de la ruta y el nombre del registro', () => {
      expect(
        describirEvento(
          app({
            modulo: 'projects',
            accion: 'CREAR',
            ruta: '/projects/:projectId/tasks',
            nombre: 'Informe de custodias',
          }),
        ),
      ).toBe('Creó tarea: «Informe de custodias»');
    });

    it('editar y eliminar', () => {
      expect(describirAccion(app({}))).toBe('Editó tarea');
      expect(describirAccion(app({ accion: 'ELIMINAR' }))).toBe(
        'Eliminó tarea',
      );
    });

    it('un tramo final que es verbo cambia el texto y el recurso es el tramo anterior', () => {
      expect(describirAccion(app({ ruta: '/tasks/:id/status' }))).toBe(
        'Cambió el estado de tarea',
      );
    });

    it('recursos de Ventas', () => {
      expect(
        describirAccion(
          app({ modulo: 'ventas', ruta: '/ventas/oportunidades/:id' }),
        ),
      ).toBe('Editó oportunidad');
    });

    it('un módulo desconocido se escribe legible, sin romperse', () => {
      expect(
        describirAccion(
          app({ modulo: 'foo-bar', accion: 'CREAR', ruta: '/foo-bar' }),
        ),
      ).toBe('Creó foo bar');
    });

    it('el inicio de sesión en app.gemeseg', () => {
      expect(
        describirAccion(
          app({ modulo: 'auth', accion: 'SESION', ruta: '/auth/login' }),
        ),
      ).toBe('Inició sesión en app.gemeseg');
    });

    it('sin nombre, no agrega los dos puntos', () => {
      expect(describirEvento(app({}))).toBe('Editó tarea');
    });
  });

  describe('eventos de Google', () => {
    const google = (accion: string, nombre: string | null = null) =>
      app({ fuente: 'GOOGLE', modulo: 'drive', accion, ruta: null, nombre });

    it('inicio de sesión', () => {
      expect(describirEvento(google('login_success'))).toBe(
        'Inició sesión en Google',
      );
    });

    it('archivos de Drive con su nombre', () => {
      expect(describirEvento(google('edit', 'Contrato ACME'))).toBe(
        'Editó un archivo en Drive: «Contrato ACME»',
      );
      expect(describirAccion(google('view'))).toBe('Abrió un archivo en Drive');
    });

    it('un evento que no conocemos no se pierde', () => {
      expect(describirAccion(google('share'))).toBe(
        'Actividad en Google (share)',
      );
    });
  });

  describe('sitios web de la extensión', () => {
    const web = (
      parcial: Partial<EventoDescribible> = {},
    ): EventoDescribible => ({
      fuente: 'EXTENSION',
      modulo: 'web',
      accion: 'SITIO',
      ruta: null,
      nombre: 'ejemplo.com',
      minutos: 5,
      ...parcial,
    });

    it('dice el dominio y los minutos, sin comillas de nombre de registro', () => {
      expect(describirEvento(web())).toBe('Sitio web: ejemplo.com (5 min)');
      expect(describirAccion(web())).toBe('Sitio web');
    });

    it('más de una hora se escribe en horas y minutos', () => {
      expect(describirEvento(web({ minutos: 60 }))).toBe(
        'Sitio web: ejemplo.com (1 h)',
      );
      expect(describirEvento(web({ minutos: 95 }))).toBe(
        'Sitio web: ejemplo.com (1 h 35 min)',
      );
    });

    it('sin minutos o sin nombre no inventa nada', () => {
      expect(describirEvento(web({ minutos: null }))).toBe(
        'Sitio web: ejemplo.com',
      );
      expect(describirEvento(web({ nombre: null, minutos: null }))).toBe(
        'Sitio web',
      );
    });
  });

  describe('moduloEtiqueta', () => {
    it('el navegador tiene su propia etiqueta', () => {
      expect(moduloEtiqueta('web')).toBe('Navegador');
    });

    it('módulos conocidos y desconocidos', () => {
      expect(moduloEtiqueta('ventas')).toBe('Ventas y CRM');
      expect(moduloEtiqueta('auth')).toBe('Sesión');
      expect(moduloEtiqueta('nuevo-modulo')).toBe('Nuevo modulo');
    });
  });
});
