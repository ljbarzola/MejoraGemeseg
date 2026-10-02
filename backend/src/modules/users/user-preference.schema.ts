/**
 * Crea la tabla "UserPreference" si no existe.
 *
 * Por qué existe: el despliegue (cloudbuild.yaml + Dockerfile) NO corre
 * migraciones, así que una tabla nueva solo aparece en producción si alguien
 * aplica el SQL a mano ANTES de desplegar. Con la migración 20261002 eso no
 * pasó y las columnas elegidas en Clientes no se podían guardar en la cuenta.
 * Esta función hace que el servicio se arregle solo al arrancar.
 *
 * Es el MISMO SQL de prisma/migrations/20261002_user_preferences/migration.sql
 * (queda como registro/para quien aplique migraciones a mano): cada sentencia
 * es idempotente, así que correrla en cada arranque, o a la vez desde varias
 * instancias de Cloud Run, no daña nada. Una sentencia por llamada porque el
 * adaptador de Prisma no garantiza varias sentencias en una sola consulta.
 *
 * No es un mecanismo general de migraciones: solo esta tabla. Si se vuelve a
 * necesitar algo parecido, lo correcto es un paso de migración en el
 * despliegue, no copiar este patrón.
 */
export const USER_PREFERENCE_DDL: string[] = [
  `CREATE TABLE IF NOT EXISTS "UserPreference" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "UserPreference_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "UserPreference_userId_key_key" ON "UserPreference"("userId", "key")`,
  `DO $$ BEGIN
    ALTER TABLE "UserPreference" ADD CONSTRAINT "UserPreference_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  EXCEPTION
    WHEN duplicate_object THEN NULL;
  END $$`,
];
