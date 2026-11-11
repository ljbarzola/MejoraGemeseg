/**
 * Alta de la sección OPERACIONES para lo que ya existía (2026-11-05).
 *
 * Contratos, Horarios y Bitácoras salieron de Contratación Pública a un módulo propio, Operaciones.
 * Como una sección nueva nace apagada para cada empresa (`alwaysEnabled: false`) y el despliegue no
 * corre migraciones, sin este paso las personas que hoy trabajan esas pantallas dejarían de verlas
 * hasta que un super administrador la encendiera a mano.
 *
 * Qué hace, UNA SOLA VEZ (lo anota en `MigracionDatos`; después, si alguien apaga la sección, no
 * se vuelve a encender sola):
 *   1. Enciende OPERACIONES en cada empresa que tenía CONTRATACION_PUBLICA (con su marca «fija
 *      para todos», si la tenía).
 *   2. Copia a OPERACIONES la fila de permiso de cada persona que tenía una para
 *      CONTRATACION_PUBLICA, para que quien estaba restringido siga igual de restringido.
 *
 * Es aditivo: solo inserta filas nuevas (`ON CONFLICT DO NOTHING`) y no toca ninguna existente.
 */
export const MIGRACION_OPERACIONES = 'operaciones-seccion-2026-11';

export const MIGRACION_DATOS_DDL = `CREATE TABLE IF NOT EXISTS "MigracionDatos" (
  "clave" TEXT NOT NULL,
  "aplicadaAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MigracionDatos_pkey" PRIMARY KEY ("clave")
)`;

export const SQL_MARCAR_MIGRACION = `INSERT INTO "MigracionDatos" ("clave") VALUES ($1) ON CONFLICT ("clave") DO NOTHING`;

export const SQL_EMPRESAS_OPERACIONES = `INSERT INTO "CompanySection" ("companyId", "section", "fixedForAll")
  SELECT "companyId", 'OPERACIONES', "fixedForAll"
  FROM "CompanySection"
  WHERE "section" = 'CONTRATACION_PUBLICA'
  ON CONFLICT ("companyId", "section") DO NOTHING`;

export const SQL_PERMISOS_OPERACIONES = `INSERT INTO "UserPermission" ("userId", "section", "canView", "canWrite")
  SELECT "userId", 'OPERACIONES', "canView", "canWrite"
  FROM "UserPermission"
  WHERE "section" = 'CONTRATACION_PUBLICA'
  ON CONFLICT ("userId", "section") DO NOTHING`;

interface PrismaCrudo {
  $executeRawUnsafe(sql: string, ...valores: unknown[]): Promise<number>;
  $transaction<T>(fn: (tx: PrismaCrudo) => Promise<T>): Promise<T>;
}

/** Devuelve true si la copia se hizo ahora, false si ya estaba hecha. */
export async function asegurarSeccionOperaciones(
  prisma: PrismaCrudo,
): Promise<boolean> {
  await prisma.$executeRawUnsafe(MIGRACION_DATOS_DDL);
  return prisma.$transaction(async (tx) => {
    const marcadas = await tx.$executeRawUnsafe(
      SQL_MARCAR_MIGRACION,
      MIGRACION_OPERACIONES,
    );
    if (marcadas === 0) return false;
    await tx.$executeRawUnsafe(SQL_EMPRESAS_OPERACIONES);
    await tx.$executeRawUnsafe(SQL_PERMISOS_OPERACIONES);
    return true;
  });
}
