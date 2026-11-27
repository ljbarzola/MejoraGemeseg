import {
  cerrarUsuariosSinPermisos,
  MIGRACION_PERMISOS_USUARIOS,
  SQL_CERRAR_USUARIOS_SIN_PERMISOS,
  SQL_ENCENDER_QUEJAS_ENCUESTAS,
} from './permisos-usuarios.schema';

function montar(filasMarcadas: number) {
  const ejecutadas: { sql: string; valores: unknown[] }[] = [];
  const ejecutor = {
    $executeRawUnsafe: jest.fn((sql: string, ...valores: unknown[]) => {
      ejecutadas.push({ sql, valores });
      return Promise.resolve(
        sql.includes('INSERT INTO "MigracionDatos"') ? filasMarcadas : 0,
      );
    }),
    $transaction: jest.fn(),
  };
  ejecutor.$transaction.mockImplementation(
    (fn: (tx: typeof ejecutor) => Promise<boolean>) => fn(ejecutor),
  );
  return { ejecutor, ejecutadas };
}

type Prisma = Parameters<typeof cerrarUsuariosSinPermisos>[0];
const TODAS = ['DASHBOARD', 'PROJECTS', 'ADMIN', 'VENTAS', 'QUEJAS', 'ENCUESTAS', 'RRHH'];

describe('cerrarUsuariosSinPermisos', () => {
  it('la primera vez enciende Quejas/Encuestas y cierra a los usuarios sin filas (sin las secciones fijas)', async () => {
    const { ejecutor, ejecutadas } = montar(1);
    await expect(cerrarUsuariosSinPermisos(ejecutor as unknown as Prisma, TODAS)).resolves.toBe(true);

    const sqls = ejecutadas.map((e) => e.sql);
    expect(sqls).toContain(SQL_ENCENDER_QUEJAS_ENCUESTAS);
    const cierre = ejecutadas.find((e) => e.sql === SQL_CERRAR_USUARIOS_SIN_PERMISOS);
    expect(cierre?.valores).toEqual([['ADMIN', 'VENTAS', 'RRHH']]);
    const marca = ejecutadas.find((e) => e.sql.includes('INSERT INTO "MigracionDatos"'));
    expect(marca?.valores).toEqual([MIGRACION_PERMISOS_USUARIOS]);
  });

  it('si ya se hizo, no toca nada', async () => {
    const { ejecutor, ejecutadas } = montar(0);
    await expect(cerrarUsuariosSinPermisos(ejecutor as unknown as Prisma, TODAS)).resolves.toBe(false);
    const sqls = ejecutadas.map((e) => e.sql);
    expect(sqls).not.toContain(SQL_ENCENDER_QUEJAS_ENCUESTAS);
    expect(sqls).not.toContain(SQL_CERRAR_USUARIOS_SIN_PERMISOS);
  });

  it('no toca administradores, usuarios inactivos ni a quien ya tiene filas', () => {
    expect(SQL_CERRAR_USUARIOS_SIN_PERMISOS).toMatch(/"role" <> 'ADMIN'/);
    expect(SQL_CERRAR_USUARIOS_SIN_PERMISOS).toMatch(/"isActive" = true/);
    expect(SQL_CERRAR_USUARIOS_SIN_PERMISOS).toMatch(/NOT EXISTS \(SELECT 1 FROM "UserPermission"/);
  });
});
