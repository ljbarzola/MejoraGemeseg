/**
 * Tablas del inventario de Operaciones (uniformes, implementos, municiones y armas).
 *
 * Mismo mecanismo que bitacoras.schema.ts: el despliegue no corre migraciones, así que
 * OperacionesInventarioModule lo ejecuta al arrancar. Es el MISMO SQL de
 * prisma/migrations/20261106_operaciones_inventario/migration.sql. Cada sentencia es
 * idempotente y va en su propia llamada. Todas las tablas son nuevas: nada previo las lee.
 */
export const INVENTARIO_DDL: string[] = [
  `CREATE TABLE IF NOT EXISTS "InvArticulo" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "tipo" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "variante" TEXT NOT NULL DEFAULT '',
    "unidad" TEXT NOT NULL DEFAULT 'unidad',
    "stockMinimo" INTEGER NOT NULL DEFAULT 0,
    "stockMaximo" INTEGER,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "InvArticulo_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "InvArticulo_companyId_tipo_nombre_variante_key" ON "InvArticulo"("companyId", "tipo", "nombre", "variante")`,
  `CREATE INDEX IF NOT EXISTS "InvArticulo_companyId_tipo_idx" ON "InvArticulo"("companyId", "tipo")`,

  `CREATE TABLE IF NOT EXISTS "InvMovimiento" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "articuloId" INTEGER NOT NULL,
    "tipo" TEXT NOT NULL,
    "cantidad" INTEGER NOT NULL,
    "fecha" DATE NOT NULL,
    "puestoId" INTEGER,
    "puestoNombre" TEXT,
    "guardiaCedula" TEXT,
    "guardiaNombre" TEXT,
    "estadoDevuelto" TEXT,
    "motivo" TEXT,
    "documento" TEXT,
    "porId" INTEGER NOT NULL,
    "porNombre" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "InvMovimiento_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "InvMovimiento_articuloId_fkey" FOREIGN KEY ("articuloId") REFERENCES "InvArticulo"("id") ON DELETE CASCADE ON UPDATE CASCADE
  )`,
  `CREATE INDEX IF NOT EXISTS "InvMovimiento_companyId_fecha_idx" ON "InvMovimiento"("companyId", "fecha")`,
  `CREATE INDEX IF NOT EXISTS "InvMovimiento_articuloId_idx" ON "InvMovimiento"("articuloId")`,

  `CREATE TABLE IF NOT EXISTS "InvArma" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "serie" TEXT NOT NULL,
    "clase" TEXT NOT NULL DEFAULT 'PISTOLA',
    "marca" TEXT,
    "modelo" TEXT,
    "calibre" TEXT,
    "estado" TEXT NOT NULL DEFAULT 'DISPONIBLE',
    "puestoId" INTEGER,
    "puestoNombre" TEXT,
    "guardiaCedula" TEXT,
    "guardiaNombre" TEXT,
    "asignadaAt" TIMESTAMP(3),
    "permisoNumero" TEXT,
    "permisoVence" DATE,
    "notas" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "InvArma_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "InvArma_companyId_serie_key" ON "InvArma"("companyId", "serie")`,
  `CREATE INDEX IF NOT EXISTS "InvArma_companyId_estado_idx" ON "InvArma"("companyId", "estado")`,

  `CREATE TABLE IF NOT EXISTS "InvArmaEvento" (
    "id" SERIAL NOT NULL,
    "armaId" INTEGER NOT NULL,
    "tipo" TEXT NOT NULL,
    "detalle" TEXT,
    "puestoNombre" TEXT,
    "guardiaNombre" TEXT,
    "porNombre" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "InvArmaEvento_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "InvArmaEvento_armaId_fkey" FOREIGN KEY ("armaId") REFERENCES "InvArma"("id") ON DELETE CASCADE ON UPDATE CASCADE
  )`,
  `CREATE INDEX IF NOT EXISTS "InvArmaEvento_armaId_idx" ON "InvArmaEvento"("armaId")`,
];
