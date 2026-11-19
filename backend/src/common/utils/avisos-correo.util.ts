import type { PrismaService } from '../../prisma/prisma.service';

/**
 * Cómo quiere cada persona recibir los avisos de la app (2026-11-18). Cada tipo de aviso
 * es una preferencia propia en `UserPreference` (clave `notificaciones:<tipo>`, valor
 * `['correo']` = app + correo, `['solo-notificaciones']` = solo la app). POR DEFECTO, sin
 * nada guardado, solo llega la notificación en la app: el correo hay que pedirlo.
 * Los avisos esenciales (cambio de contraseña) no pasan por aquí: siempre llegan.
 * La lista que ve la persona en su Perfil está en `frontend/src/pages/profile/ProfilePage.tsx`.
 */
export const AVISOS_CLAVES = {
  TAREAS: 'notificaciones:tareas-avisos',
  RECORDATORIOS_TAREAS: 'notificaciones:recordatorios-tareas',
  CONTRATACION_PUBLICA: 'notificaciones:contratacion-publica',
  OPERACIONES: 'notificaciones:operaciones-resumen',
} as const;

/** Valor guardado cuando la persona pide el aviso también por correo. */
export const VALOR_CORREO = 'correo';

/** ¿Lo guardado dice que quiere correo? Solo un `correo` explícito lo enciende. */
export function quiereCorreo(valorGuardado: unknown): boolean {
  return Array.isArray(valorGuardado) && valorGuardado.includes(VALOR_CORREO);
}

/**
 * Personas, de entre `userIds`, que pidieron este aviso también por correo. Si la consulta
 * falla se asume que ninguna: la notificación en la app siempre sale, el correo es extra.
 */
export async function personasConCorreo(
  prisma: PrismaService,
  userIds: number[],
  clave: string,
): Promise<Set<number>> {
  if (userIds.length === 0) return new Set();
  try {
    const filas = await prisma.userPreference.findMany({
      where: { key: clave, userId: { in: userIds } },
      select: { userId: true, value: true },
    });
    return new Set(filas.filter((f) => quiereCorreo(f.value)).map((f) => f.userId));
  } catch {
    return new Set();
  }
}
