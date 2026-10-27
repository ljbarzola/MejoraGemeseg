/**
 * Piezas puras del registro de acciones: qué peticiones cuentan como "acción de
 * la persona" y cómo se saca el nombre del registro sin guardar su contenido.
 */

/** Rutas (sin el prefijo /api) que nunca se anotan. */
const PREFIJOS_EXCLUIDOS = [
  '/auth',
  '/bitacora',
  '/notifications',
  '/users/me/preferences',
  '/public',
  '/health',
];

/** Solo cuentan las peticiones que cambian algo: leer una pantalla o consultar la campanita no es una acción. */
export const ACCION_POR_METODO: Record<string, string> = {
  POST: 'CREAR',
  PUT: 'EDITAR',
  PATCH: 'EDITAR',
  DELETE: 'ELIMINAR',
};

// Campos que, si vienen en la respuesta, se toman como "nombre del registro".
// Es una lista corta a propósito: nunca descripciones, textos largos ni datos
// de contacto.
const CLAVES_NOMBRE = [
  'title',
  'titulo',
  'name',
  'nombre',
  'fullName',
  'razonSocial',
  'companyName',
  'code',
  'codigo',
];
const MAX_NOMBRE = 150;

/** `/api/tasks/:id/status` → `/tasks/:id/status`. Sin ruta o fuera del API → null. */
export function normalizarRuta(path: string | undefined): string | null {
  if (!path) return null;
  const sinPrefijo = path.replace(/^\/api(?=\/|$)/, '');
  return sinPrefijo.startsWith('/') && sinPrefijo.length > 1
    ? sinPrefijo
    : null;
}

export function esRutaExcluida(ruta: string): boolean {
  return PREFIJOS_EXCLUIDOS.some((p) => ruta === p || ruta.startsWith(`${p}/`));
}

/** Módulo = primer tramo de la ruta (`/ventas/oportunidades/:id` → `ventas`). */
export function moduloDeRuta(ruta: string): string {
  return ruta.split('/')[1] ?? 'otros';
}

/** Id numérico del registro afectado, si la ruta lo trae (`:id` primero, si no el primer número). */
export function idDeParams(
  params: Record<string, string> | undefined,
): number | null {
  if (!params) return null;
  const candidatos = [params.id, ...Object.values(params)];
  for (const c of candidatos) {
    if (c !== undefined && /^\d+$/.test(c)) {
      const n = Number(c);
      if (Number.isSafeInteger(n) && n <= 2_147_483_647) return n;
    }
  }
  return null;
}

/** Id del registro recién creado, si la respuesta lo trae (al crear, el id de la ruta es el del padre). */
export function idDeRespuesta(respuesta: unknown): number | null {
  if (!respuesta || typeof respuesta !== 'object' || Array.isArray(respuesta)) {
    return null;
  }
  const id = (respuesta as Record<string, unknown>).id;
  return typeof id === 'number' &&
    Number.isSafeInteger(id) &&
    id > 0 &&
    id <= 2_147_483_647
    ? id
    : null;
}

/** Nombre del registro a partir de la respuesta del servidor (solo campos de la lista corta). */
export function nombreDeRespuesta(respuesta: unknown): string | null {
  if (!respuesta || typeof respuesta !== 'object' || Array.isArray(respuesta)) {
    return null;
  }
  const obj = respuesta as Record<string, unknown>;
  for (const clave of CLAVES_NOMBRE) {
    const valor = obj[clave];
    if (typeof valor === 'string' && valor.trim()) {
      const limpio = valor.trim().replace(/\s+/g, ' ');
      return limpio.length > MAX_NOMBRE
        ? `${limpio.slice(0, MAX_NOMBRE - 1)}…`
        : limpio;
    }
  }
  return null;
}
