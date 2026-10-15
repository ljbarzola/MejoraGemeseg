import {
  modeloVertex,
  vertexLocation,
  vertexUrl,
} from './vertex-endpoint.util';

const VARIABLES = [
  'GOOGLE_VERTEX_LOCATION',
  'GOOGLE_VERTEX_MODEL',
  'GOOGLE_VERTEX_CHAT_MODEL',
  'GOOGLE_VERTEX_MODEL_FUERTE',
  'GOOGLE_VERTEX_MODEL_LIGERO',
] as const;

describe('vertex-endpoint.util', () => {
  const guardadas: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const v of VARIABLES) {
      guardadas[v] = process.env[v];
      delete process.env[v];
    }
  });

  afterEach(() => {
    for (const v of VARIABLES) {
      if (guardadas[v] === undefined) delete process.env[v];
      else process.env[v] = guardadas[v];
    }
  });

  describe('vertexUrl', () => {
    it('global: el host NO lleva prefijo de región', () => {
      expect(vertexUrl('proy', 'global', 'gemini-3.8-flash')).toBe(
        'https://aiplatform.googleapis.com/v1/projects/proy/locations/global/publishers/google/models/gemini-3.8-flash:generateContent',
      );
    });

    it('regional: el host lleva el prefijo de la región', () => {
      expect(vertexUrl('proy', 'us-central1', 'gemini-2.5-flash')).toBe(
        'https://us-central1-aiplatform.googleapis.com/v1/projects/proy/locations/us-central1/publishers/google/models/gemini-2.5-flash:generateContent',
      );
    });
  });

  describe('vertexLocation', () => {
    it('sin variable usa global', () => {
      expect(vertexLocation()).toBe('global');
    });

    it('respeta GOOGLE_VERTEX_LOCATION', () => {
      process.env.GOOGLE_VERTEX_LOCATION = 'us-central1';
      expect(vertexLocation()).toBe('us-central1');
    });
  });

  describe('modeloVertex', () => {
    it('por defecto en global: fuerte = 3.8-flash, ligero = 3.5-flash-lite', () => {
      expect(modeloVertex('fuerte')).toBe('gemini-3.8-flash');
      expect(modeloVertex('ligero')).toBe('gemini-3.5-flash-lite');
    });

    it('la variable del nivel manda sobre todo lo demás', () => {
      process.env.GOOGLE_VERTEX_MODEL_FUERTE = 'modelo-fuerte';
      process.env.GOOGLE_VERTEX_MODEL_LIGERO = 'modelo-ligero';
      process.env.GOOGLE_VERTEX_MODEL = 'viejo-rrhh';
      process.env.GOOGLE_VERTEX_CHAT_MODEL = 'viejo-chat';

      expect(modeloVertex('fuerte', 'rrhh')).toBe('modelo-fuerte');
      expect(modeloVertex('ligero', 'chat')).toBe('modelo-ligero');
    });

    it('sin variable de nivel cae a la variable anterior de cada área', () => {
      process.env.GOOGLE_VERTEX_MODEL = 'viejo-rrhh';
      process.env.GOOGLE_VERTEX_CHAT_MODEL = 'viejo-chat';

      expect(modeloVertex('fuerte', 'rrhh')).toBe('viejo-rrhh');
      expect(modeloVertex('ligero', 'chat')).toBe('viejo-chat');
    });

    it('en una región distinta de global, sin variables, queda en 2.5-flash (los 3.x darían 404)', () => {
      process.env.GOOGLE_VERTEX_LOCATION = 'us-central1';

      expect(modeloVertex('fuerte')).toBe('gemini-2.5-flash');
      expect(modeloVertex('ligero', 'chat')).toBe('gemini-2.5-flash');
    });
  });
});
