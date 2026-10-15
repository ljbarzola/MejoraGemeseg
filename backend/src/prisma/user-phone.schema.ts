// El despliegue no corre migraciones, y Prisma pide TODAS las columnas del modelo en
// cada consulta de User: si `phone` está en schema.prisma pero no en la base, falla
// el inicio de sesión de todo el mundo. Por eso esta columna se asegura aquí, antes
// de que arranque cualquier otro módulo, y es solo aditiva (opcional, sin datos
// previos): un deploy anterior sigue funcionando con la columna ya creada.
export const USER_PHONE_DDL = [
  'ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "phone" TEXT',
];
