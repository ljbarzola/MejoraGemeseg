-- Solo de referencia (el deploy no corre migraciones): la columna se asegura al arrancar desde
-- src/prisma/cot-product-minprice.schema.ts y la tabla desde src/modules/ventas/cotizador.schema.ts.
-- Avisos de precio bajo del Cotizador, 2026-11-12.
ALTER TABLE "CotProduct" ADD COLUMN IF NOT EXISTS "minPrice" DECIMAL(15,4);
CREATE TABLE IF NOT EXISTS "CotLimites" (
  "companyId" INTEGER NOT NULL,
  "maxDescuentoPct" DECIMAL(6,2),
  "maxDescuentoServiciosPct" DECIMAL(6,2),
  "minGananciaPct" DECIMAL(6,2),
  "updatedBy" INTEGER,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CotLimites_pkey" PRIMARY KEY ("companyId")
);
ALTER TABLE "CotLimites" ADD CONSTRAINT "CotLimites_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CotLimites" ADD CONSTRAINT "CotLimites_updatedBy_fkey" FOREIGN KEY ("updatedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
