import { Prisma } from '@prisma/client';
import type { PrismaService } from '../../prisma/prisma.service';

/**
 * Filtros del Dashboard comercial (2026-11-17, pedido del asesor comercial): ver las cifras de un
 * «segmento» — por tipo de negocio y público/privado de la empresa o persona (campos fijos del
 * Directorio, guardados en SalesClient.extra), por servicio y por provincia/ciudad de la OPORTUNIDAD
 * (la ubicación es del lugar del servicio, no de la empresa; decisión de Leidy).
 *
 * Se aplican sobre el alcance de siempre (mías / toda la empresa / un vendedor), nunca lo amplían.
 */
export interface FiltrosSegmento {
  tipoNegocio?: string;
  sector?: string;
  servicioId?: number;
  provincia?: string;
  ciudad?: string;
}

/** Valor especial de los filtros de tipo/sector: «Otro» = escrito a mano (no es ninguna opción de la lista). */
export const VALOR_OTRO = '__OTRO__';
/** Valor especial: la empresa o persona no tiene el dato. */
export const VALOR_SIN_DATO = '__SIN__';

const texto = (v: unknown, max = 120): string | undefined => {
  if (typeof v !== 'string') return undefined;
  const t = v.trim().slice(0, max);
  return t || undefined;
};

/**
 * Lee los filtros de la query (?tipoNegocio=&sector=&servicioId=&provincia=&ciudad=). Lo que no es válido se
 * ignora. `servicioId` y no `servicio`: la pestaña Embudo ya usa `servicio` (un nombre) para lo suyo.
 */
export function leerFiltros(q: Record<string, unknown> | undefined): FiltrosSegmento {
  if (!q) return {};
  const servicio = Number(q.servicioId);
  return {
    tipoNegocio: texto(q.tipoNegocio),
    sector: texto(q.sector),
    servicioId: Number.isInteger(servicio) && servicio > 0 ? servicio : undefined,
    provincia: texto(q.provincia),
    ciudad: texto(q.ciudad),
  };
}

export const hayFiltros = (f?: FiltrosSegmento): boolean =>
  !!f && !!(f.tipoNegocio || f.sector || f.servicioId || f.provincia || f.ciudad);

const hayFiltrosDeCliente = (f: FiltrosSegmento) => !!(f.tipoNegocio || f.sector);
const hayFiltrosDeOportunidad = (f: FiltrosSegmento) => !!(f.servicioId || f.provincia || f.ciudad);

/** ¿El valor guardado de un campo de lista cumple el filtro? (clave de opción, «Otro» o «sin dato»). */
export function cumpleCampo(guardado: unknown, filtro: string | undefined, clavesLista: Set<string>): boolean {
  if (!filtro) return true;
  const v = typeof guardado === 'string' ? guardado.trim() : '';
  if (filtro === VALOR_SIN_DATO) return v === '';
  if (filtro === VALOR_OTRO) return v !== '' && !clavesLista.has(v);
  return v === filtro;
}

/** Condiciones de la OPORTUNIDAD (servicio y lugar). Sin filtros, objeto vacío. */
function whereLugarYServicio(f: FiltrosSegmento): Prisma.SalesOpportunityWhereInput {
  const w: Prisma.SalesOpportunityWhereInput = {};
  if (f.servicioId) w.services = { some: { serviceId: f.servicioId } };
  if (f.provincia) w.locationProvince = { equals: f.provincia, mode: 'insensitive' };
  if (f.ciudad) w.locationCity = { equals: f.ciudad, mode: 'insensitive' };
  return w;
}

export interface Segmento {
  activo: boolean;
  /** Empresas o personas que cumplen los filtros (null = sin filtros: todas). */
  clientes: number[] | null;
  /** Para añadir con AND a cualquier consulta de oportunidades. */
  oportunidad: Prisma.SalesOpportunityWhereInput;
}

/**
 * Arma el segmento. Tipo de negocio y público/privado se comparan en memoria (son pocas empresas y así
 * «Otro» = cualquier texto que no está en la lista funciona igual que en la tabla del Directorio).
 */
export async function armarSegmento(
  prisma: PrismaService,
  companyId: number,
  f: FiltrosSegmento | undefined,
): Promise<Segmento> {
  if (!f || !hayFiltros(f)) return { activo: false, clientes: null, oportunidad: {} };

  let clientes: number[] | null = null;
  if (hayFiltrosDeCliente(f)) {
    const [filas, campos] = await Promise.all([
      prisma.salesClient.findMany({ where: { companyId }, select: { id: true, extra: true } }),
      prisma.salesClientField.findMany({
        where: { companyId, key: { in: ['tipo_negocio', 'sector'] } },
        select: { key: true, options: true },
      }),
    ]);
    const clavesDe = (key: string) =>
      new Set(
        ((campos.find((c) => c.key === key)?.options ?? []) as { key?: unknown }[])
          .map((o) => (typeof o?.key === 'string' ? o.key : ''))
          .filter(Boolean),
      );
    const clavesTipo = clavesDe('tipo_negocio');
    const clavesSector = clavesDe('sector');
    clientes = filas
      .filter((c) => {
        const extra = (c.extra ?? {}) as Record<string, unknown>;
        return cumpleCampo(extra.tipo_negocio, f.tipoNegocio, clavesTipo) && cumpleCampo(extra.sector, f.sector, clavesSector);
      })
      .map((c) => c.id);
  }

  const lugar = whereLugarYServicio(f);
  if (hayFiltrosDeOportunidad(f)) {
    // Para las cifras por empresa (cartera, retención, motivos): las que tienen alguna oportunidad así.
    const conOpp = await prisma.salesOpportunity.findMany({
      where: { companyId, ...lugar, ...(clientes ? { salesClientId: { in: clientes } } : {}) },
      select: { salesClientId: true },
      distinct: ['salesClientId'],
    });
    clientes = conOpp.map((o) => o.salesClientId);
  }

  return {
    activo: true,
    clientes,
    oportunidad: {
      ...lugar,
      ...(hayFiltrosDeCliente(f) && clientes ? { salesClientId: { in: clientes } } : {}),
    },
  };
}

/** Intersección de dos listas de ids (null = sin restricción). */
export function intersectar(a: number[] | null, b: number[] | null): number[] | null {
  if (a === null) return b;
  if (b === null) return a;
  const s = new Set(b);
  return a.filter((x) => s.has(x));
}
