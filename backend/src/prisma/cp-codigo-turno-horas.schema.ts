// Horario del turno (horaInicio/horaFin) en CPCodigoTurno, tabla que producción ya tiene y
// que Prisma pide completa en cada consulta (horarios, códigos de turno, bitácoras). El
// despliegue no corre migraciones: se asegura al arrancar, igual que user-phone.schema.ts,
// y es solo aditivo y opcional (un despliegue anterior sigue funcionando con las columnas
// creadas). Mismo SQL que prisma/migrations/20261020_cp_bitacoras/migration.sql.
export const CP_CODIGO_TURNO_HORAS_DDL = [
  'ALTER TABLE "CPCodigoTurno" ADD COLUMN IF NOT EXISTS "horaInicio" TEXT',
  'ALTER TABLE "CPCodigoTurno" ADD COLUMN IF NOT EXISTS "horaFin" TEXT',
];
