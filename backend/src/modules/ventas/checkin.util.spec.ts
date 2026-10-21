import { DISTANCIA_MAXIMA_CHECKIN_M, distanciaMetros, evaluarCheckIn, puntoValido } from './checkin.util';

// Parque La Carolina (Quito) y un punto a ~330 m al norte, a ~2,4 km y en Guayaquil.
const CAROLINA = { lat: -0.1807, lng: -78.4678 };
const A_330_M = { lat: -0.1777, lng: -78.4678 };
const A_2_4_KM = { lat: -0.2024, lng: -78.4678 };
const GUAYAQUIL = { lat: -2.1894, lng: -79.8891 };

describe('distanciaMetros', () => {
  it('es 0 entre un punto y él mismo', () => {
    expect(distanciaMetros(CAROLINA, CAROLINA)).toBe(0);
  });

  it('calcula metros razonables a corta distancia', () => {
    expect(distanciaMetros(CAROLINA, A_330_M)).toBeGreaterThan(300);
    expect(distanciaMetros(CAROLINA, A_330_M)).toBeLessThan(360);
    expect(distanciaMetros(CAROLINA, A_2_4_KM)).toBeGreaterThan(2300);
    expect(distanciaMetros(CAROLINA, A_2_4_KM)).toBeLessThan(2500);
  });

  it('Quito–Guayaquil son unos 270 km', () => {
    const km = distanciaMetros(CAROLINA, GUAYAQUIL) / 1000;
    expect(km).toBeGreaterThan(260);
    expect(km).toBeLessThan(290);
  });
});

describe('puntoValido', () => {
  it('descarta lo que no es un punto real', () => {
    expect(puntoValido(null)).toBe(false);
    expect(puntoValido({})).toBe(false);
    expect(puntoValido({ lat: null, lng: null })).toBe(false);
    expect(puntoValido({ lat: NaN, lng: 1 })).toBe(false);
    expect(puntoValido({ lat: 91, lng: 0 })).toBe(false);
    expect(puntoValido({ lat: 0, lng: 0 })).toBe(false);
  });

  it('acepta un punto de Ecuador', () => {
    expect(puntoValido(CAROLINA)).toBe(true);
  });
});

describe('evaluarCheckIn', () => {
  it('en el mismo sitio: EN_SITIO', () => {
    expect(evaluarCheckIn(CAROLINA, CAROLINA)).toEqual({ resultado: 'EN_SITIO', distanciaM: 0 });
  });

  it('a menos de 500 m: EN_SITIO', () => {
    const r = evaluarCheckIn(A_330_M, CAROLINA);
    expect(r.resultado).toBe('EN_SITIO');
    expect(r.distanciaM).toBeLessThanOrEqual(DISTANCIA_MAXIMA_CHECKIN_M);
  });

  it('a 2,4 km: FUERA_DEL_SITIO con la distancia', () => {
    const r = evaluarCheckIn(A_2_4_KM, CAROLINA);
    expect(r.resultado).toBe('FUERA_DEL_SITIO');
    expect(r.distanciaM).toBeGreaterThan(2300);
  });

  it('en otra ciudad: FUERA_DEL_SITIO', () => {
    expect(evaluarCheckIn(GUAYAQUIL, CAROLINA).resultado).toBe('FUERA_DEL_SITIO');
  });

  it('sin ubicación del navegador: SIN_GPS, y nunca verificado', () => {
    expect(evaluarCheckIn(null, CAROLINA)).toEqual({ resultado: 'SIN_GPS', distanciaM: null });
    expect(evaluarCheckIn({ lat: 0, lng: 0 }, CAROLINA).resultado).toBe('SIN_GPS');
  });

  it('la visita sin lugar definido: SIN_UBICACION', () => {
    expect(evaluarCheckIn(CAROLINA, null)).toEqual({ resultado: 'SIN_UBICACION', distanciaM: null });
    expect(evaluarCheckIn(CAROLINA, { lat: null, lng: null }).resultado).toBe('SIN_UBICACION');
  });

  it('sin GPS gana sobre sin lugar: falta lo primero que hay que arreglar', () => {
    expect(evaluarCheckIn(null, null).resultado).toBe('SIN_GPS');
  });
});
