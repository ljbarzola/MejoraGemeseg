import {
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import axios from 'axios';
import {
  estaEnEcuador,
  normalizarProvincia,
  provinciaMasCercana,
  type UbicacionOportunidad,
} from './ubicacion.util';

// Buscador de lugares para la Ubicación de las oportunidades (2026-10-19). Usa Nominatim, el buscador
// gratuito de OpenStreetMap. Su política de uso exige: un User-Agent que identifique la aplicación, a lo
// sumo 1 consulta por segundo, sin autocompletar mientras se escribe, y guardar resultados repetidos.
// Por eso las consultas pasan por el servidor (no por el navegador de cada persona): aquí se espacian, se
// guardan en memoria y llevan el identificador de la aplicación.
// https://operations.osmfoundation.org/policies/nominatim/

const URL_NOMINATIM =
  process.env.NOMINATIM_URL || 'https://nominatim.openstreetmap.org';
const USER_AGENT =
  process.env.NOMINATIM_USER_AGENT || 'GEMESEG-CRM/1.0 (app.gemeseg.com)';
const ESPERA_MIN_MS = 1100;
const TIMEOUT_MS = 8000;
const CACHE_MAX = 500;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_CONSULTA = 150;

interface ItemNominatim {
  osm_type?: string;
  osm_id?: number | string;
  lat?: string;
  lon?: string;
  display_name?: string;
  name?: string;
  address?: Record<string, string>;
}

@Injectable()
export class VentasUbicacionesService {
  private readonly logger = new Logger(VentasUbicacionesService.name);
  private ultimaConsulta = 0;
  // Fila de espera: cada consulta espera a la anterior para respetar el ritmo de 1 por segundo.
  private cola: Promise<unknown> = Promise.resolve();
  private readonly cache = new Map<string, { hasta: number; valor: unknown }>();

  // Convierte una respuesta de Nominatim en una ubicación lista para mostrar (o null si no sirve).
  static aUbicacion(item: ItemNominatim): UbicacionOportunidad | null {
    const lat = Number(item.lat);
    const lng = Number(item.lon);
    if (!estaEnEcuador(lat, lng)) return null;
    const a = item.address ?? {};
    const ciudad =
      a.city ||
      a.town ||
      a.village ||
      a.municipality ||
      a.city_district ||
      a.county ||
      null;
    const direccion = (item.display_name ?? '').trim() || null;
    const nombre =
      (item.name ?? '').trim() || direccion?.split(',')[0]?.trim() || null;
    return {
      name: nombre,
      address: direccion,
      lat,
      lng,
      city: ciudad,
      province: normalizarProvincia(a.state) ?? provinciaMasCercana(lat, lng),
      osmId:
        item.osm_type && item.osm_id ? `${item.osm_type}/${item.osm_id}` : null,
    };
  }

  private delCache<T>(clave: string): T | null {
    const e = this.cache.get(clave);
    if (!e) return null;
    if (e.hasta < Date.now()) {
      this.cache.delete(clave);
      return null;
    }
    return e.valor as T;
  }

  private guardarEnCache(clave: string, valor: unknown) {
    if (this.cache.size >= CACHE_MAX) {
      // Sale la más antigua (un Map conserva el orden de inserción).
      for (const vieja of this.cache.keys()) {
        this.cache.delete(vieja);
        break;
      }
    }
    this.cache.set(clave, { hasta: Date.now() + CACHE_TTL_MS, valor });
  }

  // Ejecuta `fn` respetando la espera mínima entre consultas a Nominatim.
  private espaciada<T>(fn: () => Promise<T>): Promise<T> {
    const turno = this.cola.then(async () => {
      const falta = this.ultimaConsulta + ESPERA_MIN_MS - Date.now();
      if (falta > 0) await new Promise((r) => setTimeout(r, falta));
      this.ultimaConsulta = Date.now();
      return fn();
    });
    // La cola sigue aunque una consulta falle.
    this.cola = turno.catch(() => undefined);
    return turno;
  }

  private async pedir<T>(
    ruta: string,
    params: Record<string, string | number>,
  ): Promise<T> {
    try {
      const r = await axios.get<T>(`${URL_NOMINATIM}${ruta}`, {
        params: {
          format: 'jsonv2',
          addressdetails: 1,
          'accept-language': 'es',
          ...params,
        },
        headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
        timeout: TIMEOUT_MS,
      });
      return r.data;
    } catch (err) {
      this.logger.warn(`Nominatim no respondió: ${(err as Error).message}`);
      throw new ServiceUnavailableException(
        'El buscador de mapas no respondió. Intenta de nuevo en unos segundos o marca el punto directamente en el mapa.',
      );
    }
  }

  async buscar(consulta: string | undefined): Promise<UbicacionOportunidad[]> {
    const q = (consulta ?? '').trim().replace(/\s+/g, ' ');
    if (q.length < 3)
      throw new BadRequestException(
        'Escribe al menos 3 letras para buscar un lugar.',
      );
    if (q.length > MAX_CONSULTA)
      throw new BadRequestException('La búsqueda es demasiado larga.');
    const clave = `b:${q.toLowerCase()}`;
    const guardado = this.delCache<UbicacionOportunidad[]>(clave);
    if (guardado) return guardado;
    const items = await this.espaciada(() =>
      this.pedir<ItemNominatim[]>('/search', {
        q,
        countrycodes: 'ec',
        limit: 8,
        dedupe: 1,
      }),
    );
    const lista = (Array.isArray(items) ? items : [])
      .map((i) => VentasUbicacionesService.aUbicacion(i))
      .filter((u): u is UbicacionOportunidad => u !== null);
    this.guardarEnCache(clave, lista);
    return lista;
  }

  // Dirección de un punto marcado a mano en el mapa.
  async inversa(
    latRaw: string | undefined,
    lngRaw: string | undefined,
  ): Promise<UbicacionOportunidad> {
    const lat = Number(latRaw);
    const lng = Number(lngRaw);
    if (!estaEnEcuador(lat, lng)) {
      throw new BadRequestException(
        'Ese punto no está en Ecuador. Marca un lugar dentro del país.',
      );
    }
    // Redondear a 5 decimales (~1 m) hace que clics casi iguales compartan la respuesta guardada.
    const clave = `i:${lat.toFixed(5)},${lng.toFixed(5)}`;
    const guardado = this.delCache<UbicacionOportunidad>(clave);
    if (guardado) return guardado;
    let item: ItemNominatim | null = null;
    try {
      item = await this.espaciada(() =>
        this.pedir<ItemNominatim>('/reverse', { lat, lon: lng, zoom: 18 }),
      );
    } catch (err) {
      // Sin dirección igual se puede guardar el punto: la provincia sale de la posición.
      if (!(err instanceof ServiceUnavailableException)) throw err;
    }
    const base = item
      ? VentasUbicacionesService.aUbicacion({
          ...item,
          lat: String(lat),
          lon: String(lng),
        })
      : null;
    const resultado: UbicacionOportunidad = base ?? {
      name: null,
      address: null,
      lat,
      lng,
      city: null,
      province: provinciaMasCercana(lat, lng),
      osmId: null,
    };
    // Un punto marcado a mano no es «el lugar» de OpenStreetMap: se conserva solo la dirección.
    resultado.osmId = null;
    if (item) this.guardarEnCache(clave, resultado);
    return resultado;
  }
}
