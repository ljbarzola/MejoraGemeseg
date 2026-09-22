-- Recuperación de contraseña con código por correo (2026-09-22).
--
-- Cierra un agujero grave: hasta ahora POST /auth/forgot-password recibía
-- correo + contraseña nueva y la cambiaba SIN verificar nada, así que
-- cualquiera que supiera un correo se apoderaba de esa cuenta, incluidas las
-- de administrador.
--
-- El código se guarda hasheado (nunca en claro), caduca, se invalida al usarse
-- y limita los intentos: son 6 dígitos y sin tope se podrían probar todos.
--
-- Aditiva y sin pérdida de datos.
CREATE TABLE IF NOT EXISTS "PasswordResetCode" (
  "id"        SERIAL PRIMARY KEY,
  "userId"    INTEGER NOT NULL,
  "codeHash"  TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "usedAt"    TIMESTAMP(3),
  "attempts"  INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PasswordResetCode_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "PasswordResetCode_userId_idx" ON "PasswordResetCode"("userId");
