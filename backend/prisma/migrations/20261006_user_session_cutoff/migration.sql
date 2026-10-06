-- Cierre de sesiones al cambiar o restablecer la contraseña.
-- Se aplica sola al arrancar el backend (auth/session-cutoff.schema.ts); este
-- archivo queda como registro y para quien aplique migraciones a mano.

CREATE TABLE IF NOT EXISTS "UserSessionCutoff" (
    "userId" INTEGER NOT NULL,
    "validAfter" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "UserSessionCutoff_pkey" PRIMARY KEY ("userId")
);

DO $$ BEGIN
  ALTER TABLE "UserSessionCutoff" ADD CONSTRAINT "UserSessionCutoff_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
