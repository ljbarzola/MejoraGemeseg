// Ubicación de una oportunidad en la lista de Oportunidades y el puente con el mapa del Dashboard.
//
// El mapa agrupa por provincia y ciudad comparando nombres sin tildes ni mayúsculas (`ventas-mapa.util.ts`): la
// lista usa la MISMA clave, para que el número de una burbuja o de una provincia sea el de las filas a las que
// lleva su botón «Ver en oportunidades».

import type { Oportunidad } from '../services/ventas.service';

/** Valor del filtro Ciudad para las oportunidades con punto en el mapa pero sin ciudad (el mapa las junta por provincia). */
export const SIN_CIUDAD = 'sin-ciudad';
/** Valor del filtro Provincia para una ubicación sin provincia (no debería pasar: el servidor la completa). */
export const SIN_PROVINCIA = 'sin-provincia';
/** Valor del filtro Origen = lo que cuenta el mapa: todo menos las renovaciones y los clientes que ya contrataban. */
export const ORIGEN_VENTAS_NUEVAS = 'NUEVAS';

/** 'Guayaquil', 'GUAYAQUIL ' y 'guayaquil' son la misma ciudad; «Los Ríos» = «los rios». */
export const claveTexto = (s: string | null | undefined): string =>
  (s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

/** Clave de provincia de la oportunidad, o null si no tiene ubicación. */
export const claveProvincia = (o: Pick<Oportunidad, 'ubicacion'>): string | null =>
  o.ubicacion ? claveTexto(o.ubicacion.province) || SIN_PROVINCIA : null;

/** Clave de ciudad de la oportunidad, o null si no tiene ubicación. */
export const claveCiudad = (o: Pick<Oportunidad, 'ubicacion'>): string | null =>
  o.ubicacion ? claveTexto(o.ubicacion.city) || SIN_CIUDAD : null;

/** «Ciudad, Provincia»; si solo hay una, esa; si no hay ninguna, el nombre del lugar; si no hay nada, ''. */
export const textoUbicacion = (o: Pick<Oportunidad, 'ubicacion'>): string => {
  const u = o.ubicacion;
  if (!u) return '';
  const partes = [u.city, u.province].map((p) => (p ?? '').trim()).filter(Boolean);
  return partes.length > 0 ? partes.join(', ') : (u.name ?? '').trim();
};

export type EstadoLista = '' | 'abiertas' | 'cotizadas' | 'aceptadas' | 'perdidas';
export const ESTADOS_LISTA: { value: Exclude<EstadoLista, ''>; label: string }[] = [
  { value: 'abiertas', label: 'Abiertas' },
  { value: 'cotizadas', label: 'Con cotización' },
  { value: 'aceptadas', label: 'Aceptadas' },
  { value: 'perdidas', label: 'Perdidas' },
];

/** Las mismas cinco «vistas» del mapa (todas / abiertas / cotizadas / aceptadas / perdidas) aplicadas a una fila de la lista. */
export function cumpleEstado(
  o: Pick<Oportunidad, 'abierta' | 'outcome' | 'quotedAmount' | 'quotedAt'>,
  estado: EstadoLista,
): boolean {
  if (estado === 'abiertas') return o.abierta;
  if (estado === 'aceptadas') return o.outcome === 'GANADA';
  if (estado === 'perdidas') return o.outcome === 'PERDIDA';
  if (estado === 'cotizadas') return o.quotedAmount != null || !!o.quotedAt;
  return true;
}

/** Los estados de la lista («Abiertas», «Con cotización»…) que cumple una oportunidad: una puede cumplir varios. */
export const estadosDeOportunidad = (
  o: Pick<Oportunidad, 'abierta' | 'outcome' | 'quotedAmount' | 'quotedAt'>,
): { valor: string; etiqueta: string }[] =>
  ESTADOS_LISTA.filter((e) => cumpleEstado(o, e.value)).map((e) => ({ valor: e.value, etiqueta: e.label }));

/** «Venta nueva» = lo que cuenta el mapa: ni renovación ni cliente que ya contrataba antes del sistema. */
export const esVentaNueva = (o: Pick<Oportunidad, 'originType'>): boolean =>
  o.originType !== 'HISTORICO' && o.originType !== 'RENOVACION';

export const esEstadoLista = (v: string | null): v is Exclude<EstadoLista, ''> =>
  ESTADOS_LISTA.some((e) => e.value === v);

/**
 * Enlace a la lista de Oportunidades con lo que el mapa estaba contando: alcance, periodo, vista y,
 * siempre, el origen «Ventas nuevas» (el mapa no cuenta renovaciones ni clientes históricos).
 */
export function urlOportunidadesDelMapa(p: {
  provincia?: string | null;
  /** null = «sin ciudad» (solo tiene sentido con provincia). undefined = no filtrar por ciudad. */
  ciudad?: string | null;
  oportunidadId?: number | null;
  alcance?: string;
  desde?: string;
  hasta?: string;
  vista?: string;
}): string {
  const q = new URLSearchParams();
  if (p.oportunidadId) q.set('oportunidad', String(p.oportunidadId));
  if (p.provincia) q.set('provincia', p.provincia);
  if (p.ciudad !== undefined && !p.oportunidadId) q.set('ciudad', p.ciudad ?? SIN_CIUDAD);
  if (p.alcance) q.set('responsable', p.alcance);
  if (p.desde) q.set('desde', p.desde);
  if (p.hasta) q.set('hasta', p.hasta);
  if (esEstadoLista(p.vista ?? null)) q.set('estado', p.vista === 'cotizadas' ? 'cotizadas' : (p.vista as string));
  q.set('origen', ORIGEN_VENTAS_NUEVAS);
  return `/ventas/oportunidades?${q.toString()}`;
}
