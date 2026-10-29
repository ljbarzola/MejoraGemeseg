import { PROVINCIAS_EC } from './ubicacion.util';

// Mapa de Ecuador del Dashboard (2026-10-19): agrupa las oportunidades que tienen ubicación por ciudad
// y por provincia, para ver dónde se cotiza más y qué zonas faltan. Es puro (sin base de datos).

export type VistaMapa =
  'todas' | 'abiertas' | 'cotizadas' | 'aceptadas' | 'perdidas';
export const VISTAS_MAPA: VistaMapa[] = [
  'todas',
  'abiertas',
  'cotizadas',
  'aceptadas',
  'perdidas',
];

export interface FilaMapa {
  // Opcional: cuando viene, cada oportunidad del mapa de puntos puede llevar directo a su fila en la lista.
  id?: number;
  locationName: string | null;
  locationLat: number | null;
  locationLng: number | null;
  locationCity: string | null;
  locationProvince: string | null;
  quotedAmount: number | null;
  outcome: string | null;
  closedAt: Date | null;
}

export interface PuntoMapa {
  lat: number;
  lng: number;
  ciudad: string | null;
  provincia: string;
  total: number;
  aceptadas: number;
  perdidas: number;
  abiertas: number;
  montoCotizado: number;
  lugares: string[];
}

// Una oportunidad con ubicación, tal cual (para el mapa de calor y los puntos sueltos).
export interface OportunidadMapa {
  id: number | null;
  lat: number;
  lng: number;
  monto: number;
  lugar: string | null;
  ciudad: string | null;
  provincia: string;
  estado: 'abierta' | 'aceptada' | 'perdida';
}

export interface ProvinciaMapa {
  provincia: string;
  total: number;
  montoCotizado: number;
}

export interface ResumenMapa {
  total: number;
  conUbicacion: number;
  sinUbicacion: number;
  puntos: PuntoMapa[];
  // Cada oportunidad con ubicación por separado (máx. MAX_OPORTUNIDADES_MAPA): alimenta el mapa de calor.
  oportunidades: OportunidadMapa[];
  provincias: ProvinciaMapa[];
  provinciasSinOportunidades: string[];
}

const MAX_OPORTUNIDADES_MAPA = 5000;

export function vistaValida(raw?: string): VistaMapa {
  return VISTAS_MAPA.includes(raw as VistaMapa) ? (raw as VistaMapa) : 'todas';
}

const sinTildes = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

export function agruparMapa(filas: FilaMapa[]): ResumenMapa {
  const conPunto = filas.filter(
    (f) => f.locationLat !== null && f.locationLng !== null,
  );
  const grupos = new Map<
    string,
    { latSuma: number; lngSuma: number; punto: Omit<PuntoMapa, 'lat' | 'lng'> }
  >();
  const porProvincia = new Map<string, ProvinciaMapa>(
    PROVINCIAS_EC.map((p) => [
      p.nombre,
      { provincia: p.nombre, total: 0, montoCotizado: 0 },
    ]),
  );

  for (const f of conPunto) {
    const lat = f.locationLat as number;
    const lng = f.locationLng as number;
    const provincia = f.locationProvince ?? 'Sin provincia';
    const ciudad = f.locationCity?.trim() || null;
    const monto = f.quotedAmount ?? 0;
    // Con ciudad se agrupa por ciudad; sin ella, todas las de esa provincia juntas («sin ciudad»). Así el número
    // de cada burbuja es el mismo que da el filtro Provincia + Ciudad de la lista de Oportunidades (antes se
    // partía en cuadros de ~1 km, y ningún filtro de la lista podía reproducir ese corte).
    const clave = `${provincia}|${ciudad ? sinTildes(ciudad) : ''}`;
    let g = grupos.get(clave);
    if (!g) {
      g = {
        latSuma: 0,
        lngSuma: 0,
        punto: {
          ciudad,
          provincia,
          total: 0,
          aceptadas: 0,
          perdidas: 0,
          abiertas: 0,
          montoCotizado: 0,
          lugares: [],
        },
      };
      grupos.set(clave, g);
    }
    g.latSuma += lat;
    g.lngSuma += lng;
    g.punto.total += 1;
    g.punto.montoCotizado += monto;
    if (f.outcome === 'GANADA') g.punto.aceptadas += 1;
    else if (f.outcome === 'PERDIDA') g.punto.perdidas += 1;
    else if (f.closedAt === null) g.punto.abiertas += 1;
    const lugar = f.locationName?.trim();
    if (lugar && g.punto.lugares.length < 3 && !g.punto.lugares.includes(lugar))
      g.punto.lugares.push(lugar);

    const p = porProvincia.get(provincia) ?? {
      provincia,
      total: 0,
      montoCotizado: 0,
    };
    p.total += 1;
    p.montoCotizado += monto;
    porProvincia.set(provincia, p);
  }

  const redondear = (n: number) => Math.round(n * 100) / 100;
  const puntos = [...grupos.values()]
    .map((g) => ({
      ...g.punto,
      lat: g.latSuma / g.punto.total,
      lng: g.lngSuma / g.punto.total,
      montoCotizado: redondear(g.punto.montoCotizado),
    }))
    .sort(
      (a, b) =>
        b.total - a.total ||
        (a.ciudad ?? '').localeCompare(b.ciudad ?? '', 'es'),
    );
  const provincias = [...porProvincia.values()]
    .map((p) => ({ ...p, montoCotizado: redondear(p.montoCotizado) }))
    .sort(
      (a, b) =>
        b.total - a.total || a.provincia.localeCompare(b.provincia, 'es'),
    );

  const oportunidades: OportunidadMapa[] = conPunto.slice(0, MAX_OPORTUNIDADES_MAPA).map((f) => ({
    id: f.id ?? null,
    lat: f.locationLat as number,
    lng: f.locationLng as number,
    monto: f.quotedAmount ?? 0,
    lugar: f.locationName?.trim() || null,
    ciudad: f.locationCity?.trim() || null,
    provincia: f.locationProvince ?? 'Sin provincia',
    estado: f.outcome === 'GANADA' ? 'aceptada' : f.outcome === 'PERDIDA' ? 'perdida' : 'abierta',
  }));

  return {
    total: filas.length,
    conUbicacion: conPunto.length,
    sinUbicacion: filas.length - conPunto.length,
    puntos,
    oportunidades,
    provincias: provincias.filter((p) => p.total > 0),
    provinciasSinOportunidades: provincias
      .filter((p) => p.total === 0)
      .map((p) => p.provincia),
  };
}
