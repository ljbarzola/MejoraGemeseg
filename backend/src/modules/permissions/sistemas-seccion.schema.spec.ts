import {
  asegurarSistemasPorEmpresa,
  MIGRACION_SISTEMAS,
  SLUG_EMPRESA_INTERNA,
  SQL_APAGAR_SISTEMAS_DEMAS,
  SQL_ENCENDER_SISTEMAS_INTERNA,
} from './sistemas-seccion.schema';

function montar(opts: { existeInterna: boolean; filasMarcadas: number }) {
  const ejecutadas: { sql: string; valores: unknown[] }[] = [];
  const ejecutor = {
    $executeRawUnsafe: jest.fn((sql: string, ...valores: unknown[]) => {
      ejecutadas.push({ sql, valores });
      return Promise.resolve(
        sql.includes('INSERT INTO "MigracionDatos"') ? opts.filasMarcadas : 0,
      );
    }),
    $queryRawUnsafe: jest.fn(() =>
      Promise.resolve(opts.existeInterna ? [{ id: 1 }] : []),
    ),
    $transaction: jest.fn(),
  };
  ejecutor.$transaction.mockImplementation(
    (fn: (tx: typeof ejecutor) => Promise<boolean>) => fn(ejecutor),
  );
  return { ejecutor, ejecutadas };
}

type Prisma = Parameters<typeof asegurarSistemasPorEmpresa>[0];
const correr = (e: unknown) => asegurarSistemasPorEmpresa(e as Prisma);

describe('asegurarSistemasPorEmpresa', () => {
  it('la primera vez deja Sistemas encendido en gemeseg y lo apaga en las demás', async () => {
    const { ejecutor, ejecutadas } = montar({ existeInterna: true, filasMarcadas: 1 });
    await expect(correr(ejecutor)).resolves.toBe(true);

    const sqls = ejecutadas.map((e) => e.sql);
    expect(sqls).toContain(SQL_ENCENDER_SISTEMAS_INTERNA);
    expect(sqls).toContain(SQL_APAGAR_SISTEMAS_DEMAS);
    const marca = ejecutadas.find((e) => e.sql.includes('INSERT INTO "MigracionDatos"'));
    expect(marca?.valores).toEqual([MIGRACION_SISTEMAS]);
    const apagar = ejecutadas.find((e) => e.sql === SQL_APAGAR_SISTEMAS_DEMAS);
    expect(apagar?.valores).toEqual([SLUG_EMPRESA_INTERNA]);
  });

  it('si ya se hizo, no toca nada más (un super admin puede haberlo activado después)', async () => {
    const { ejecutor, ejecutadas } = montar({ existeInterna: true, filasMarcadas: 0 });
    await expect(correr(ejecutor)).resolves.toBe(false);

    const sqls = ejecutadas.map((e) => e.sql);
    expect(sqls).not.toContain(SQL_ENCENDER_SISTEMAS_INTERNA);
    expect(sqls).not.toContain(SQL_APAGAR_SISTEMAS_DEMAS);
  });

  it('si la empresa interna aún no existe no apaga nada ni se marca como hecha', async () => {
    const { ejecutor, ejecutadas } = montar({ existeInterna: false, filasMarcadas: 1 });
    await expect(correr(ejecutor)).resolves.toBe(false);

    const sqls = ejecutadas.map((e) => e.sql);
    expect(sqls).not.toContain(SQL_APAGAR_SISTEMAS_DEMAS);
    expect(sqls.some((s) => s.includes('INSERT INTO "MigracionDatos"'))).toBe(false);
  });

  it('solo borra filas de SISTEMAS de empresas: nunca toca permisos de personas', () => {
    expect(SQL_APAGAR_SISTEMAS_DEMAS).toMatch(/DELETE FROM "CompanySection"/);
    expect(SQL_APAGAR_SISTEMAS_DEMAS).toMatch(/"section" = 'SISTEMAS'/);
    expect(SQL_APAGAR_SISTEMAS_DEMAS).not.toMatch(/UserPermission/);
  });
});
