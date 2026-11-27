import {
  MIGRACION_DATOS_DDL,
  SQL_MARCAR_MIGRACION,
} from './operaciones-seccion.schema';

/**
 * Sistemas deja de ser un módulo «de siempre» y pasa a activarse por empresa (2026-11-26).
 *
 * Sistemas es la pantalla interna de TI de Gemeseg (herramientas con claves de licencia, agentes,
 * base de conocimiento, tickets). Estando siempre activo, cualquier empresa cliente lo tenía a un
 * permiso de distancia. Ahora nace apagado como Cacao o Ventas, y un super administrador lo
 * enciende a quien corresponda.
 *
 * Como el despliegue no corre migraciones, hace falta este paso para que el equipo que hoy lo usa
 * no lo pierda. UNA SOLA VEZ (lo anota en `MigracionDatos`; si después alguien lo enciende o lo
 * apaga a mano, no se vuelve a tocar):
 *   1. Enciende SISTEMAS en la empresa interna (slug `gemeseg`).
 *   2. Apaga SISTEMAS en todas las demás: borra su fila de `CompanySection`. Hace falta borrarla y
 *      no solo dejar de crearla, porque una fila suelta mantiene la sección activa para esa empresa.
 *
 * No toca `UserPermission`: los permisos de cada persona se conservan y vuelven a valer si la
 * empresa recupera Sistemas. Si la empresa interna no existe todavía (base nueva, antes del seed),
 * no hace nada y NO se marca como hecha: lo intentará en el próximo arranque.
 */
export const MIGRACION_SISTEMAS = 'sistemas-por-empresa-2026-11';
export const SLUG_EMPRESA_INTERNA = 'gemeseg';

export const SQL_EMPRESA_INTERNA = `SELECT "id" FROM "Company" WHERE "slug" = $1`;

export const SQL_ENCENDER_SISTEMAS_INTERNA = `INSERT INTO "CompanySection" ("companyId", "section")
  SELECT "id", 'SISTEMAS' FROM "Company" WHERE "slug" = $1
  ON CONFLICT ("companyId", "section") DO NOTHING`;

export const SQL_APAGAR_SISTEMAS_DEMAS = `DELETE FROM "CompanySection"
  WHERE "section" = 'SISTEMAS'
    AND "companyId" NOT IN (SELECT "id" FROM "Company" WHERE "slug" = $1)`;

interface PrismaCrudo {
  $executeRawUnsafe(sql: string, ...valores: unknown[]): Promise<number>;
  $queryRawUnsafe<T = unknown>(sql: string, ...valores: unknown[]): Promise<T>;
  $transaction<T>(fn: (tx: PrismaCrudo) => Promise<T>): Promise<T>;
}

/** Devuelve true si el cambio se hizo ahora, false si ya estaba hecho o aún no se puede. */
export async function asegurarSistemasPorEmpresa(
  prisma: PrismaCrudo,
): Promise<boolean> {
  await prisma.$executeRawUnsafe(MIGRACION_DATOS_DDL);
  return prisma.$transaction(async (tx) => {
    const interna = await tx.$queryRawUnsafe<{ id: number }[]>(
      SQL_EMPRESA_INTERNA,
      SLUG_EMPRESA_INTERNA,
    );
    if (!interna?.length) return false;

    const marcadas = await tx.$executeRawUnsafe(
      SQL_MARCAR_MIGRACION,
      MIGRACION_SISTEMAS,
    );
    if (marcadas === 0) return false;

    await tx.$executeRawUnsafe(
      SQL_ENCENDER_SISTEMAS_INTERNA,
      SLUG_EMPRESA_INTERNA,
    );
    await tx.$executeRawUnsafe(SQL_APAGAR_SISTEMAS_DEMAS, SLUG_EMPRESA_INTERNA);
    return true;
  });
}
