// Cambio de turno de la hoja (guardia saliente y entrante, tal como los escribió la hoja) en CPBitacora, tabla
// que producción ya tiene y que Prisma pide completa en cada consulta. El despliegue no corre migraciones: se
// asegura al arrancar (ver user-phone.schema.ts). Solo aditivo y nulo: un despliegue anterior sigue funcionando.
export const CP_BITACORA_TURNO_DDL = [
  'ALTER TABLE "CPBitacora" ADD COLUMN IF NOT EXISTS "guardiaSaliente" TEXT',
  'ALTER TABLE "CPBitacora" ADD COLUMN IF NOT EXISTS "guardiaEntrante" TEXT',
];
