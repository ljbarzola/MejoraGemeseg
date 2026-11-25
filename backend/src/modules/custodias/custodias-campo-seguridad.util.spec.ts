import {
  claveFirma,
  claveFoto,
  decodificarBase64,
  errorDeHora,
  esCedulaConPin,
  esJpeg,
  esPinValido,
  esPng,
  generarPin,
  generarTokenCelular,
  generarTokenSesion,
  hashearPin,
  inicioDiaEcuador,
  latitud,
  normalizarCedula,
  tokenCelularDeCabecera,
  tokenSesionDeCabecera,
  verificarPin,
} from './custodias-campo-seguridad.util';

describe('custodias-campo-seguridad.util', () => {
  describe('tokens', () => {
    it('el token del celular y el de la sesión llevan su prefijo y se reconocen en la cabecera', () => {
      const celular = generarTokenCelular();
      const sesion = generarTokenSesion();
      expect(celular.startsWith('cd_')).toBe(true);
      expect(sesion.startsWith('cs_')).toBe(true);
      expect(tokenCelularDeCabecera(`Bearer ${celular}`)).toBe(celular);
      expect(tokenCelularDeCabecera(`Bearer ${sesion}`)).toBeNull();
      expect(tokenCelularDeCabecera('Basic abc')).toBeNull();
      expect(tokenSesionDeCabecera(sesion)).toBe(sesion);
      expect(tokenSesionDeCabecera(celular)).toBeNull();
      expect(tokenSesionDeCabecera(undefined)).toBeNull();
    });
  });

  describe('PIN', () => {
    it('genera PIN de 4 dígitos y los valida', () => {
      for (let i = 0; i < 50; i++) expect(esPinValido(generarPin())).toBe(true);
      expect(esPinValido('123')).toBe(false);
      expect(esPinValido('12345')).toBe(false);
      expect(esPinValido('12a4')).toBe(false);
      expect(esPinValido(1234)).toBe(false);
    });

    it('guarda el PIN con sal (dos hashes del mismo PIN difieren) y solo el PIN correcto coincide', async () => {
      const a = await hashearPin('0427');
      const b = await hashearPin('0427');
      expect(a).not.toBe(b);
      expect(a).toMatch(/^[0-9a-f]{32}:[0-9a-f]{64}$/);
      expect(await verificarPin('0427', a)).toBe(true);
      expect(await verificarPin('0428', a)).toBe(false);
      expect(await verificarPin('0427', 'basura')).toBe(false);
    });
  });

  describe('cédula', () => {
    it('acepta cédula de 10 dígitos o pasaporte y rechaza las claves internas', () => {
      expect(esCedulaConPin('0912345678')).toBe(true);
      expect(esCedulaConPin(' ab 123456 ')).toBe(true);
      expect(esCedulaConPin('ID-1AbCdEfGh')).toBe(false);
      expect(esCedulaConPin('SC-1234')).toBe(false);
      expect(esCedulaConPin('TEMP-9')).toBe(false);
      expect(esCedulaConPin('')).toBe(false);
      expect(esCedulaConPin('123')).toBe(false);
    });

    it('normaliza a mayúsculas y sin espacios', () => {
      expect(normalizarCedula(' ab 123 456 ')).toBe('AB123456');
    });
  });

  describe('hora', () => {
    const creado = new Date('2026-11-24T12:00:00Z');
    const ahora = new Date('2026-11-24T15:00:00Z');
    it('no acepta más de 5 minutos en el futuro ni antes de que el viaje existiera (menos un día)', () => {
      expect(errorDeHora(new Date('2026-11-24T14:00:00Z'), creado, ahora)).toBeNull();
      expect(errorDeHora(new Date('2026-11-24T15:04:00Z'), creado, ahora)).toBeNull();
      expect(errorDeHora(new Date('2026-11-24T15:06:00Z'), creado, ahora)).not.toBeNull();
      expect(errorDeHora(new Date('2026-11-23T13:00:00Z'), creado, ahora)).toBeNull();
      expect(errorDeHora(new Date('2026-11-23T11:00:00Z'), creado, ahora)).not.toBeNull();
    });
  });

  describe('archivos', () => {
    it('reconoce JPEG y PNG por su cabecera real', () => {
      expect(esJpeg(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00]))).toBe(true);
      expect(esJpeg(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]))).toBe(false);
      expect(esPng(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]))).toBe(true);
      expect(esPng(Buffer.from('GIF89a......'))).toBe(false);
    });

    it('decodifica base64 estricto y respeta el tamaño máximo', () => {
      const dato = Buffer.alloc(100, 7);
      expect(decodificarBase64(dato.toString('base64'), 200)?.length).toBe(100);
      expect(decodificarBase64(dato.toString('base64'), 50)).toBeNull();
      expect(decodificarBase64('data:image/png;base64,AAAA', 200)).toBeNull();
      expect(decodificarBase64('', 200)).toBeNull();
      expect(decodificarBase64(123, 200)).toBeNull();
    });

    it('arma las claves de almacenamiento', () => {
      expect(claveFoto(2, 15, 'abc-123', false)).toBe('custodias/2/15/fotos/abc-123.jpg');
      expect(claveFoto(2, 15, 'abc-123', true)).toBe('custodias/2/15/fotos/abc-123-min.jpg');
      expect(claveFirma(2, 15, 'abc-123')).toBe('custodias/2/15/firmas/abc-123.png');
    });
  });

  describe('coordenadas y fechas', () => {
    it('descarta coordenadas imposibles', () => {
      expect(latitud(-2.17)).toBe(-2.17);
      expect(latitud(95)).toBeNull();
      expect(latitud('x')).toBeNull();
      expect(latitud(NaN)).toBeNull();
    });

    it('el día de la limpieza empieza a las 00:00 de Ecuador (05:00 UTC)', () => {
      expect(inicioDiaEcuador('2026-11-24')?.toISOString()).toBe('2026-11-24T05:00:00.000Z');
      expect(inicioDiaEcuador('2026-02-30')).toBeNull();
      expect(inicioDiaEcuador('24/11/2026')).toBeNull();
      expect(inicioDiaEcuador(undefined)).toBeNull();
    });
  });
});
