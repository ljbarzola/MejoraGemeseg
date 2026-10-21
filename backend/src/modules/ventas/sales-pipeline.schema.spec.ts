import { SALES_PIPELINE_BACKFILL } from './sales-pipeline.schema';

// El relleno de oportunidades «MIGRADA» corre en cada arranque del servidor. Solo puede actuar la primera
// vez; si no, cada reposo de Cloud Run le inventaba una oportunidad a toda empresa o persona del Directorio
// guardada solo con datos (que no tiene oportunidad a propósito).
describe('SALES_PIPELINE_BACKFILL', () => {
  const crearOportunidades = SALES_PIPELINE_BACKFILL[0];

  it('crea oportunidades MIGRADA solo para clientes que no tienen ninguna', () => {
    expect(crearOportunidades).toContain(`INSERT INTO "SalesOpportunity"`);
    expect(crearOportunidades).toContain(`'MIGRADA'`);
    expect(crearOportunidades).toContain(
      `NOT EXISTS (SELECT 1 FROM "SalesOpportunity" o WHERE o."salesClientId" = c."id")`,
    );
  });

  it('solo actúa cuando la tabla de oportunidades está vacía (la primera vez)', () => {
    expect(crearOportunidades).toContain(`AND NOT EXISTS (SELECT 1 FROM "SalesOpportunity")`);
  });
});
