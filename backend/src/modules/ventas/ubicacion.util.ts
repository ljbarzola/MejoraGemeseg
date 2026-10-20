import { BadRequestException } from '@nestjs/common';

// Ubicación (opcional) de una oportunidad: el lugar al que va el servicio, elegido en un mapa de
// OpenStreetMap (2026-10-19). Vive en la OPORTUNIDAD, no en la persona o empresa: una misma empresa
// puede cotizar sedes distintas. Todo es opcional y nulo por defecto; sirve para el mapa del Dashboard.

export interface UbicacionInput {
  name?: string | null;
  address?: string | null;
  lat: number;
  lng: number;
  city?: string | null;
  province?: string | null;
  osmId?: string | null;
}

export interface UbicacionOportunidad {
  name: string | null;
  address: string | null;
  lat: number;
  lng: number;
  city: string | null;
  province: string | null;
  osmId: string | null;
}

// Las 24 provincias con un centro aproximado (sirve para completar la provincia cuando el buscador no la
// trae: se toma la más cercana, y para ubicar las provincias en el mapa).
export const PROVINCIAS_EC: { nombre: string; lat: number; lng: number }[] = [
  { nombre: 'Azuay', lat: -2.9, lng: -79.0 },
  { nombre: 'Bolívar', lat: -1.6, lng: -79.0 },
  { nombre: 'Cañar', lat: -2.55, lng: -78.93 },
  { nombre: 'Carchi', lat: 0.81, lng: -77.72 },
  { nombre: 'Chimborazo', lat: -1.67, lng: -78.65 },
  { nombre: 'Cotopaxi', lat: -0.93, lng: -78.62 },
  { nombre: 'El Oro', lat: -3.26, lng: -79.96 },
  { nombre: 'Esmeraldas', lat: 0.96, lng: -79.65 },
  { nombre: 'Galápagos', lat: -0.74, lng: -90.31 },
  { nombre: 'Guayas', lat: -2.19, lng: -79.89 },
  { nombre: 'Imbabura', lat: 0.35, lng: -78.12 },
  { nombre: 'Loja', lat: -3.99, lng: -79.2 },
  { nombre: 'Los Ríos', lat: -1.8, lng: -79.53 },
  { nombre: 'Manabí', lat: -1.05, lng: -80.45 },
  { nombre: 'Morona Santiago', lat: -2.31, lng: -78.12 },
  { nombre: 'Napo', lat: -0.99, lng: -77.81 },
  { nombre: 'Orellana', lat: -0.46, lng: -76.99 },
  { nombre: 'Pastaza', lat: -1.49, lng: -78.0 },
  { nombre: 'Pichincha', lat: -0.18, lng: -78.47 },
  { nombre: 'Santa Elena', lat: -2.23, lng: -80.86 },
  { nombre: 'Santo Domingo de los Tsáchilas', lat: -0.25, lng: -79.17 },
  { nombre: 'Sucumbíos', lat: 0.09, lng: -76.89 },
  { nombre: 'Tungurahua', lat: -1.24, lng: -78.62 },
  { nombre: 'Zamora Chinchipe', lat: -4.07, lng: -78.95 },
];

// Rectángulo que cubre Ecuador continental y Galápagos. Fuera de él se rechaza: el mapa del Dashboard es
// de Ecuador y un punto perdido en otro país (o en el mar) lo deformaría.
const LAT_MIN = -5.2;
const LAT_MAX = 1.8;
const LNG_MIN = -92.5;
const LNG_MAX = -74.9;

export function estaEnEcuador(lat: number, lng: number): boolean {
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= LAT_MIN &&
    lat <= LAT_MAX &&
    lng >= LNG_MIN &&
    lng <= LNG_MAX
  );
}

const sinTildes = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

// «Provincia del Guayas», «Guayas», «guayas» -> «Guayas». Devuelve null si no es una provincia conocida.
export function normalizarProvincia(raw?: string | null): string | null {
  if (!raw) return null;
  const limpio = sinTildes(raw)
    .replace(/^provincia\s+(de(l)?\s+)?/, '')
    .replace(/^de(l)?\s+/, '')
    .trim();
  if (!limpio) return null;
  const exacta = PROVINCIAS_EC.find((p) => sinTildes(p.nombre) === limpio);
  if (exacta) return exacta.nombre;
  if (limpio.startsWith('santo domingo'))
    return 'Santo Domingo de los Tsáchilas';
  if (limpio.startsWith('zamora')) return 'Zamora Chinchipe';
  if (limpio.startsWith('galapagos')) return 'Galápagos';
  return null;
}

export function provinciaMasCercana(lat: number, lng: number): string {
  let mejor = PROVINCIAS_EC[0];
  let menor = Infinity;
  for (const p of PROVINCIAS_EC) {
    const d = (p.lat - lat) ** 2 + (p.lng - lng) ** 2;
    if (d < menor) {
      menor = d;
      mejor = p;
    }
  }
  return mejor.nombre;
}

function texto(v: unknown, max: number): string | null {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return t ? t.slice(0, max) : null;
}

// Valida lo que llega del cuadro del mapa y lo deja listo para guardar. Lanza un mensaje claro en español
// si el punto no es válido o no está en Ecuador.
export function limpiarUbicacion(u: UbicacionInput): UbicacionOportunidad {
  const lat = Number(u.lat);
  const lng = Number(u.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    throw new BadRequestException(
      'La ubicación no tiene un punto válido en el mapa.',
    );
  }
  if (!estaEnEcuador(lat, lng)) {
    throw new BadRequestException(
      'La ubicación tiene que estar en Ecuador. Elige otro punto en el mapa o deja la ubicación vacía.',
    );
  }
  return {
    name: texto(u.name, 150),
    address: texto(u.address, 300),
    // 6 decimales ≈ 10 cm: de sobra y evita guardar ruido.
    lat: Math.round(lat * 1e6) / 1e6,
    lng: Math.round(lng * 1e6) / 1e6,
    city: texto(u.city, 100),
    // Sin provincia reconocible se toma la más cercana: el mapa agrupa por provincia.
    province: normalizarProvincia(u.province) ?? provinciaMasCercana(lat, lng),
    osmId: texto(u.osmId, 40),
  };
}

// Campos de SalesOpportunity para guardar (o borrar, con null) la ubicación.
export function columnasDeUbicacion(u: UbicacionOportunidad | null) {
  return {
    locationName: u?.name ?? null,
    locationAddress: u?.address ?? null,
    locationLat: u?.lat ?? null,
    locationLng: u?.lng ?? null,
    locationCity: u?.city ?? null,
    locationProvince: u?.province ?? null,
    locationOsmId: u?.osmId ?? null,
  };
}

// Ubicación de una fila de oportunidad (o null si no tiene punto).
export function ubicacionDeFila(o: {
  locationName?: string | null;
  locationAddress?: string | null;
  locationLat?: number | null;
  locationLng?: number | null;
  locationCity?: string | null;
  locationProvince?: string | null;
  locationOsmId?: string | null;
}): UbicacionOportunidad | null {
  if (o.locationLat == null || o.locationLng == null) return null;
  return {
    name: o.locationName ?? null,
    address: o.locationAddress ?? null,
    lat: o.locationLat,
    lng: o.locationLng,
    city: o.locationCity ?? null,
    province: o.locationProvince ?? null,
    osmId: o.locationOsmId ?? null,
  };
}
