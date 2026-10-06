/**
 * Crea la tabla "UserSessionCutoff" si no existe.
 *
 * Guarda, por usuario, desde qué momento valen sus sesiones: un token emitido
 * ANTES de `validAfter` deja de servir. Se escribe solo cuando la persona
 * cambia o restablece su contraseña (así se cierran las sesiones abiertas en
 * otros dispositivos); mientras no lo haga, la sesión sigue abierta.
 *
 * Es una tabla aparte, y no una columna en "User", a propósito: el despliegue
 * (cloudbuild.yaml + Dockerfile) NO corre migraciones, y una columna nueva en
 * "User" haría fallar TODA consulta a usuarios en producción hasta que alguien
 * aplicara el SQL a mano. Con una tabla aparte, si no existe, solo se pierde el
 * cierre de sesiones (ver SessionCutoffService: falla abierto).
 *
 * Mismo patrón y misma advertencia que user-preference.schema.ts: cada
 * sentencia es idempotente, una por llamada, y es el MISMO SQL de
 * prisma/migrations/20261006_user_session_cutoff/migration.sql.
 */
export const USER_SESSION_CUTOFF_DDL: string[] = [
  `CREATE TABLE IF NOT EXISTS "UserSessionCutoff" (
    "userId" INTEGER NOT NULL,
    "validAfter" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "UserSessionCutoff_pkey" PRIMARY KEY ("userId")
  )`,
  `DO $$ BEGIN
    ALTER TABLE "UserSessionCutoff" ADD CONSTRAINT "UserSessionCutoff_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  EXCEPTION
    WHEN duplicate_object THEN NULL;
  END $$`,
];
