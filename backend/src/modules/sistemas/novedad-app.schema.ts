/**
 * Crea la tabla "NovedadApp" si no existe.
 *
 * Por qué existe: el despliegue (cloudbuild.yaml + Dockerfile) NO corre
 * migraciones, así que una tabla nueva solo aparece si alguien aplica el SQL a
 * mano ANTES de desplegar. Mismo problema y mismo arreglo que "UserPreference"
 * (ver users/user-preference.schema.ts): el servicio se arregla solo al
 * arrancar.
 *
 * Es el MISMO SQL de prisma/migrations/20261002_novedades_app/migration.sql
 * (queda como registro/para quien aplique migraciones a mano). Cada sentencia
 * es idempotente, así que correrla en cada arranque, o a la vez desde varias
 * instancias de Cloud Run, no daña nada. Una sentencia por llamada porque el
 * adaptador de Prisma no garantiza varias sentencias en una sola consulta.
 *
 * No es un mecanismo general de migraciones. Lo correcto a mediano plazo es un
 * paso de migración en el despliegue; mientras no exista, no copiar este
 * patrón para tablas que no lo necesiten.
 */
export const NOVEDAD_APP_DDL: string[] = [
  `CREATE TABLE IF NOT EXISTS "NovedadApp" (
    "id" SERIAL NOT NULL,
    "titulo" TEXT NOT NULL,
    "descripcion" TEXT NOT NULL,
    "secciones" TEXT[],
    "createdById" INTEGER NOT NULL,
    "createdByNombre" TEXT NOT NULL,
    "destinatarios" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "NovedadApp_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE INDEX IF NOT EXISTS "NovedadApp_createdAt_idx" ON "NovedadApp"("createdAt")`,
];
