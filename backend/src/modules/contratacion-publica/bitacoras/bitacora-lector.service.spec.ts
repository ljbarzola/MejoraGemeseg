import {
  BitacoraLectorService,
  LecturaBitacoraError,
} from './bitacora-lector.service';
import { buildBitacoraPrompt } from './bitacora-prompt.util';
import { CATEGORIAS_NOVEDAD } from './bitacora.util';

describe('buildBitacoraPrompt', () => {
  const prompt = buildBitacoraPrompt({
    hoy: '2026-10-18',
    instruccionesDeLaEmpresa: '',
  });

  it('pide solo transcribir y no conoce el horario ni a los guardias', () => {
    expect(prompt).toContain('TRANSCRIBIR');
    expect(prompt).toContain('No corrijas');
    // Si el lector viera el horario, "arreglaría" un nombre equivocado.
    expect(prompt.toLowerCase()).not.toContain('horario del puesto');
  });

  it('lista todas las categorías y la fecha de hoy', () => {
    for (const c of CATEGORIAS_NOVEDAD) expect(prompt).toContain(c);
    expect(prompt).toContain('2026-10-18');
  });

  it('agrega las instrucciones propias de la empresa sin tocar las reglas', () => {
    const p = buildBitacoraPrompt({
      hoy: '2026-10-18',
      instruccionesDeLaEmpresa: 'Las columnas son A, B y C.',
    });
    expect(p).toContain('INSTRUCCIONES PROPIAS DE ESTA EMPRESA');
    expect(p).toContain('Las columnas son A, B y C.');
    expect(p).toContain('TRANSCRIBIR');
  });

  it('no repite las instrucciones propias cuando no hay', () => {
    expect(prompt).not.toContain('INSTRUCCIONES PROPIAS');
  });
});

describe('BitacoraLectorService', () => {
  const auth = { getAccessToken: jest.fn().mockResolvedValue('token') };
  const servicio = () => new BitacoraLectorService(auth as any);
  const realFetch = global.fetch;
  const respuesta = (texto: string, ok = true, status = 200) =>
    ({
      ok,
      status,
      json: () =>
        Promise.resolve({
          candidates: [{ content: { parts: [{ text: texto }] } }],
          usageMetadata: { promptTokenCount: 1200, candidatesTokenCount: 300 },
        }),
      text: () => Promise.resolve(texto),
    }) as unknown as Response;

  const OLD_ENV = process.env;
  beforeEach(() => {
    process.env = {
      ...OLD_ENV,
      GOOGLE_VERTEX_PROJECT: 'proyecto-x',
      GOOGLE_VERTEX_LOCATION: 'global',
    };
  });
  afterEach(() => {
    process.env = OLD_ENV;
    global.fetch = realFetch;
  });

  it('no está configurado sin proyecto de Vertex', () => {
    process.env.GOOGLE_VERTEX_PROJECT = '';
    expect(servicio().estaConfigurado()).toBe(false);
  });

  it('lee la foto, limpia la respuesta y devuelve el uso', async () => {
    const json = JSON.stringify({
      esBitacora: true,
      puesto: 'Garita norte',
      fechas: ['2026-10-12'],
      registros: [
        {
          fecha: '2026-10-12',
          guardia: 'Juan Pérez',
          horaEntrada: '7',
          horaSalida: '19:00',
          legible: true,
        },
      ],
      novedades: [
        {
          fecha: '2026-10-12',
          hora: '09:15',
          texto: 'Ingresa camión',
          categoria: 'VEHICULOS',
        },
      ],
    });
    const fetchMock = jest
      .fn()
      .mockResolvedValue(respuesta('```json\n' + json + '\n```'));
    global.fetch = fetchMock as any;

    const r = await servicio().leer(Buffer.from('imagen'), 'image/jpeg', '');

    expect(r.lectura.registros[0]).toMatchObject({
      guardia: 'Juan Pérez',
      horaEntrada: '07:00',
    });
    expect(r.tokensEntrada).toBe(1200);
    expect(r.tokensSalida).toBe(300);
    const cuerpo = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(cuerpo.contents[0].parts[0].inlineData.mimeType).toBe('image/jpeg');
    expect(cuerpo.generationConfig.temperature).toBe(0);
    expect(fetchMock.mock.calls[0][0]).toContain('aiplatform.googleapis.com');
  });

  it('un error de Vertex llega como mensaje que se le puede mostrar a la persona', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValue(respuesta('boom', false, 503)) as any;
    await expect(
      servicio().leer(Buffer.from('x'), 'image/png', ''),
    ).rejects.toBeInstanceOf(LecturaBitacoraError);
  });

  it('una respuesta que no es JSON no se guarda como si fuera una lectura', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValue(respuesta('lo siento, no puedo')) as any;
    await expect(
      servicio().leer(Buffer.from('x'), 'image/png', ''),
    ).rejects.toThrow(/No se pudo entender/);
  });

  it('un fallo de red también se explica', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('ECONNRESET')) as any;
    await expect(
      servicio().leer(Buffer.from('x'), 'image/png', ''),
    ).rejects.toThrow(/No se pudo conectar/);
  });
});
