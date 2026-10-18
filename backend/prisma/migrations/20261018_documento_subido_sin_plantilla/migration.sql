-- Documentación: un documento puede subirse ya hecho (sin plantilla).
-- Solo referencia: el mismo SQL se aplica solo al arrancar (sales-agreement.schema.ts).
ALTER TABLE "SalesContract" ALTER COLUMN "templateId" DROP NOT NULL;
