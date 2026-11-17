/**
 * Tablas del módulo Contabilidad, creadas al arrancar (2026-11-16).
 *
 * Mismo motivo y patrón que bitacora.schema.ts: el despliegue no corre migraciones, así que las
 * tablas se aseguran solas. Son TABLAS NUEVAS (nadie más las lee), por lo que un servidor anterior
 * sigue funcionando sin ellas. No tienen modelo de Prisma: se leen y escriben con SQL directo.
 *
 * `ContabTarifaCustodia`: cuánto se paga POR PERSONA a quien participa en un viaje de custodia,
 * según el tipo (HACIENDA, PUERTO, VIP). Antes eran tres números escritos en el código ($20, $10,
 * $23). Cada cambio es una FILA NUEVA con su fecha de vigencia: un viaje se paga con la tarifa
 * vigente el día del viaje, así subir una tarifa no recalcula las nóminas de meses pasados.
 */
import {
  MIGRACION_DATOS_DDL,
  SQL_MARCAR_MIGRACION,
} from '../permissions/operaciones-seccion.schema';

export const CONTABILIDAD_DDL: string[] = [
  `CREATE TABLE IF NOT EXISTS "ContabTarifaCustodia" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "tipo" TEXT NOT NULL,
    "valorPorPersona" DECIMAL(12,2) NOT NULL,
    "vigenteDesde" DATE NOT NULL,
    "creadaPorId" INTEGER,
    "creadaEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ContabTarifaCustodia_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "ContabTarifaCustodia_companyId_tipo_vigenteDesde_key"
     ON "ContabTarifaCustodia"("companyId", "tipo", "vigenteDesde")`,
  `DO $$ BEGIN
    ALTER TABLE "ContabTarifaCustodia" ADD CONSTRAINT "ContabTarifaCustodia_companyId_fkey"
      FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  EXCEPTION
    WHEN duplicate_object THEN NULL;
  END $$`,
  // Ajustes (2026-11-16): lo que se suma (EXTRA: p. ej. se le paga un poco más a un chofer) o se resta (DESCUENTO)
  // a una persona al liquidar, fuera de la tarifa. Pueden ir ligados a un viaje (`custodiaId`) o sueltos en una
  // fecha. `monto` siempre es positivo: el signo lo da `tipo`. Si se borra el viaje, el ajuste queda suelto
  // (conserva el número de guía como texto).
  `CREATE TABLE IF NOT EXISTS "ContabAjusteCustodia" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "tipo" TEXT NOT NULL,
    "cedula" TEXT NOT NULL DEFAULT '',
    "persona" TEXT NOT NULL,
    "fecha" DATE NOT NULL,
    "monto" DECIMAL(12,2) NOT NULL,
    "concepto" TEXT NOT NULL,
    "custodiaId" INTEGER,
    "numeroGuia" TEXT,
    "creadoPorId" INTEGER,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ContabAjusteCustodia_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE INDEX IF NOT EXISTS "ContabAjusteCustodia_companyId_fecha_idx"
     ON "ContabAjusteCustodia"("companyId", "fecha")`,
  `DO $$ BEGIN
    ALTER TABLE "ContabAjusteCustodia" ADD CONSTRAINT "ContabAjusteCustodia_companyId_fkey"
      FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  EXCEPTION
    WHEN duplicate_object THEN NULL;
  END $$`,
  `DO $$ BEGIN
    ALTER TABLE "ContabAjusteCustodia" ADD CONSTRAINT "ContabAjusteCustodia_custodiaId_fkey"
      FOREIGN KEY ("custodiaId") REFERENCES "Custodia"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  EXCEPTION
    WHEN duplicate_object THEN NULL;
  END $$`,
  // Pagos registrados (2026-11-16): «ya se le pagó a esta persona por este viaje». UNA FILA POR PAGO (viaje + rol),
  // con el monto congelado al momento de registrarlo (tarifa, ajuste y total): si luego se corrige una tarifa, lo
  // ya pagado no cambia. Deshacer el pago borra la fila. Un viaje con pagos registrados no se elimina ni cambia de
  // tipo o de personal hasta deshacerlos.
  `CREATE TABLE IF NOT EXISTS "ContabPagoCustodia" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "custodiaId" INTEGER NOT NULL,
    "rol" TEXT NOT NULL,
    "clave" TEXT NOT NULL,
    "persona" TEXT NOT NULL,
    "cedula" TEXT NOT NULL DEFAULT '',
    "monto" DECIMAL(12,2) NOT NULL,
    "ajuste" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(12,2) NOT NULL,
    "pagadoEn" DATE NOT NULL,
    "referencia" TEXT,
    "creadoPorId" INTEGER,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ContabPagoCustodia_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "ContabPagoCustodia_custodiaId_rol_key"
     ON "ContabPagoCustodia"("custodiaId", "rol")`,
  `CREATE INDEX IF NOT EXISTS "ContabPagoCustodia_companyId_idx" ON "ContabPagoCustodia"("companyId")`,
  `DO $$ BEGIN
    ALTER TABLE "ContabPagoCustodia" ADD CONSTRAINT "ContabPagoCustodia_companyId_fkey"
      FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  EXCEPTION
    WHEN duplicate_object THEN NULL;
  END $$`,
  `DO $$ BEGIN
    ALTER TABLE "ContabPagoCustodia" ADD CONSTRAINT "ContabPagoCustodia_custodiaId_fkey"
      FOREIGN KEY ("custodiaId") REFERENCES "Custodia"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  EXCEPTION
    WHEN duplicate_object THEN NULL;
  END $$`,
];

/**
 * UNA SOLA VEZ: a cada empresa que ya tenía custodias registradas le deja las tres tarifas que se
 * pagaban hasta hoy (Hacienda $20, Puerto $10, VIP $23, vigentes desde el 2020-01-01), para que su
 * nómina siga dando lo mismo. Las empresas SIN custodias empiezan sin tarifas: cada una las define
 * en Contabilidad (línea blanca: nada de una empresa escrito para las demás).
 */
export const MIGRACION_TARIFAS_CUSTODIA = 'contabilidad-tarifas-custodia-2026-11';

export const SQL_SEMBRAR_TARIFAS_EXISTENTES = `INSERT INTO "ContabTarifaCustodia" ("companyId", "tipo", "valorPorPersona", "vigenteDesde")
  SELECT c."companyId", t."tipo", t."valor", DATE '2020-01-01'
  FROM (SELECT DISTINCT "companyId" FROM "Custodia") c
  CROSS JOIN (VALUES ('HACIENDA', 20.00), ('PUERTO', 10.00), ('VIP', 23.00)) AS t("tipo", "valor")
  ON CONFLICT ("companyId", "tipo", "vigenteDesde") DO NOTHING`;

interface PrismaCrudo {
  $executeRawUnsafe(sql: string, ...valores: unknown[]): Promise<number>;
  $transaction<T>(fn: (tx: PrismaCrudo) => Promise<T>): Promise<T>;
}

/** Crea las tablas y hace la siembra única. Devuelve true si la siembra se hizo ahora. */
export async function asegurarContabilidad(prisma: PrismaCrudo): Promise<boolean> {
  for (const sql of CONTABILIDAD_DDL) {
    await prisma.$executeRawUnsafe(sql);
  }
  await prisma.$executeRawUnsafe(MIGRACION_DATOS_DDL);
  return prisma.$transaction(async (tx) => {
    const marcadas = await tx.$executeRawUnsafe(
      SQL_MARCAR_MIGRACION,
      MIGRACION_TARIFAS_CUSTODIA,
    );
    if (marcadas === 0) return false;
    await tx.$executeRawUnsafe(SQL_SEMBRAR_TARIFAS_EXISTENTES);
    return true;
  });
}
