/**
 * Crea la tabla "AuthAttempt" si no existe.
 *
 * Cuenta los intentos fallidos de entrar (o de pedir un código, o de cambiar la
 * contraseña) por clave, para bloquear un rato a quien prueba contraseñas sin
 * freno. Está en la base y no en memoria porque en Cloud Run hay varias
 * instancias que se reciclan, y Redis está apagado en producción.
 *
 * Tabla aparte, creada al arrancar, por la misma razón que
 * session-cutoff.schema.ts: el despliegue NO corre migraciones. Cada sentencia
 * es idempotente y se manda una por llamada.
 */
export const AUTH_ATTEMPT_DDL: string[] = [
  `CREATE TABLE IF NOT EXISTS "AuthAttempt" (
    "key" TEXT NOT NULL,
    "count" INTEGER NOT NULL,
    "windowStart" TIMESTAMP(3) NOT NULL,
    "lockedUntil" TIMESTAMP(3),
    CONSTRAINT "AuthAttempt_pkey" PRIMARY KEY ("key")
  )`,
];
