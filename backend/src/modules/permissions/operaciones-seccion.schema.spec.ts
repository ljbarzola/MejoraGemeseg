import {
  asegurarSeccionOperaciones,
  MIGRACION_OPERACIONES,
  SQL_EMPRESAS_OPERACIONES,
  SQL_PERMISOS_OPERACIONES,
} from './operaciones-seccion.schema';

function montar(filasMarcadas: number) {
  const ejecutadas: { sql: string; valores: unknown[] }[] = [];
  const ejecutor = {
    $executeRawUnsafe: jest.fn((sql: string, ...valores: unknown[]) => {
      ejecutadas.push({ sql, valores });
      return Promise.resolve(sql.includes('INSERT INTO "MigracionDatos"') ? filasMarcadas : 0);
    }),
    $transaction: jest.fn(),
  };
  ejecutor.$transaction.mockImplementation((fn: (tx: typeof ejecutor) => Promise<boolean>) => fn(ejecutor));
  return { ejecutor, ejecutadas };
}

describe('asegurarSeccionOperaciones', () => {
  it('la primera vez enciende OPERACIONES donde estaba Contratación Pública y copia los permisos', async () => {
    const { ejecutor, ejecutadas } = montar(1);
    await expect(asegurarSeccionOperaciones(ejecutor)).resolves.toBe(true);

    const sqls = ejecutadas.map((e) => e.sql);
    expect(sqls).toContain(SQL_EMPRESAS_OPERACIONES);
    expect(sqls).toContain(SQL_PERMISOS_OPERACIONES);
    const marca = ejecutadas.find((e) => e.sql.includes('INSERT INTO "MigracionDatos"'));
    expect(marca?.valores).toEqual([MIGRACION_OPERACIONES]);
  });

  it('si ya se hizo, no toca nada más (un administrador puede haberla apagado después)', async () => {
    const { ejecutor, ejecutadas } = montar(0);
    await expect(asegurarSeccionOperaciones(ejecutor)).resolves.toBe(false);

    const sqls = ejecutadas.map((e) => e.sql);
    expect(sqls).not.toContain(SQL_EMPRESAS_OPERACIONES);
    expect(sqls).not.toContain(SQL_PERMISOS_OPERACIONES);
  });

  it('solo inserta filas nuevas: nunca modifica ni borra', () => {
    for (const sql of [SQL_EMPRESAS_OPERACIONES, SQL_PERMISOS_OPERACIONES]) {
      expect(sql).toMatch(/ON CONFLICT .* DO NOTHING/);
      expect(sql).not.toMatch(/UPDATE|DELETE/i);
    }
  });
});
