import {
  MIGRACION_DATOS_DDL,
  SQL_MARCAR_MIGRACION,
} from './operaciones-seccion.schema';

/**
 * Cierra a los usuarios que nunca tuvieron permisos guardados y asigna Quejas y Encuestas (2026-11-26).
 *
 * Contexto: en las secciones «normales», que una persona no tenga fila en `UserPermission` significa
 * «puede entrar». Eso venía de cuando todo era abierto por omisión y hoy deja a usuarios antiguos viendo
 * todos los módulos de su empresa. El modelo nuevo es: un usuario normal nace solo con Inicio y Proyectos
 * y su administrador le va dando el resto.
 *
 * UNA SOLA VEZ (queda anotada en `MigracionDatos`):
 *   1. Quejas y Encuestas dejan de verse siempre y las asigna el super administrador por empresa. Para no
 *      romper lo que hoy funciona, se encienden en las empresas que ya tienen Recursos Humanos (donde se
 *      gestionan); el resto queda sin ellas hasta que se las asignen.
 *   2. Cada usuario ACTIVO con empresa, que no sea administrador y no tenga NINGUNA fila de permisos,
 *      recibe filas «denegado» en todas las secciones salvo las fijas. El Gerente conserva la vista de
 *      Administración y Mi Empresa (la tenía por su rol y ahora es una casilla editable).
 *
 * Los administradores no se tocan (conservan todo) y a quien ya tiene filas tampoco.
 */
export const MIGRACION_PERMISOS_USUARIOS = 'permisos-usuarios-cerrados-2026-11';

const SECCIONES_FIJAS_POR_CODIGO = ['DASHBOARD', 'PROJECTS', 'QUEJAS', 'ENCUESTAS'];

export const SQL_ENCENDER_QUEJAS_ENCUESTAS = `INSERT INTO "CompanySection" ("companyId", "section")
  SELECT cs."companyId", s.key
  FROM "CompanySection" cs, (VALUES ('QUEJAS'), ('ENCUESTAS')) AS s(key)
  WHERE cs."section" = 'RRHH'
  ON CONFLICT ("companyId", "section") DO NOTHING`;

/** $1 = lista de todas las secciones que existen (se pasa desde el código para no duplicarla aquí). */
export const SQL_CERRAR_USUARIOS_SIN_PERMISOS = `INSERT INTO "UserPermission" ("userId", "section", "canView", "canWrite")
  SELECT u."id", s.key,
         (u."role" = 'MANAGER' AND s.key IN ('ADMIN', 'COMPANY_SETTINGS')),
         false
  FROM "User" u
  CROSS JOIN unnest($1::text[]) AS s(key)
  WHERE u."companyId" IS NOT NULL
    AND u."isActive" = true
    AND u."role" <> 'ADMIN'
    AND NOT EXISTS (SELECT 1 FROM "UserPermission" p WHERE p."userId" = u."id")
    AND NOT EXISTS (
      SELECT 1 FROM "CompanySection" c
      WHERE c."companyId" = u."companyId" AND c."section" = s.key AND c."fixedForAll" = true
    )
  ON CONFLICT ("userId", "section") DO NOTHING`;

interface PrismaCrudo {
  $executeRawUnsafe(sql: string, ...valores: unknown[]): Promise<number>;
  $transaction<T>(fn: (tx: PrismaCrudo) => Promise<T>): Promise<T>;
}

/** Devuelve true si el cambio se hizo ahora, false si ya estaba hecho. */
export async function cerrarUsuariosSinPermisos(
  prisma: PrismaCrudo,
  todasLasSecciones: string[],
): Promise<boolean> {
  await prisma.$executeRawUnsafe(MIGRACION_DATOS_DDL);
  const aCerrar = todasLasSecciones.filter((s) => !SECCIONES_FIJAS_POR_CODIGO.includes(s));
  return prisma.$transaction(async (tx) => {
    const marcadas = await tx.$executeRawUnsafe(
      SQL_MARCAR_MIGRACION,
      MIGRACION_PERMISOS_USUARIOS,
    );
    if (marcadas === 0) return false;
    await tx.$executeRawUnsafe(SQL_ENCENDER_QUEJAS_ENCUESTAS);
    await tx.$executeRawUnsafe(SQL_CERRAR_USUARIOS_SIN_PERMISOS, aCerrar);
    return true;
  });
}
