require('dotenv/config');
const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');

// Corrige el bug de permisos para usuarios YA existentes: hoy, un usuario sin
// ninguna fila UserPermission queda "permitido en todo" por defecto (ver el
// comentario en section-permission.guard.ts). Este script les crea filas
// explícitas, con la misma regla que ahora aplica UsersService.create() a los
// usuarios nuevos: Employee/Manager quedan denegados en todo lo que no sea
// fijo para su empresa; Admin queda con permiso explícito (para que
// /admin/user-permissions deje de mostrarlos como "sin nada marcado" cuando
// en realidad tienen todo).
//
// Uso:
//   node prisma/backfill-user-permissions.js            (dry-run, no escribe nada)
//   node prisma/backfill-user-permissions.js --dry-run  (igual, explícito)
//   node prisma/backfill-user-permissions.js --apply    (aplica los cambios)

const DATABASE_URL =
  process.env.DATABASE_URL ||
  'postgresql://postgres:postgres@localhost:5432/gemeseg?schema=public';
const isRemote =
  DATABASE_URL.includes('cloudsql') || DATABASE_URL.includes('pooler');
const adapter = new PrismaPg({
  connectionString: DATABASE_URL,
  ...(isRemote ? { ssl: { rejectUnauthorized: false } } : {}),
});
const prisma = new PrismaClient({ adapter });

// Espejo de ALL_SECTIONS / SECCIONES_SIEMPRE_VISIBLES en
// backend/src/modules/permissions/permissions.service.ts — este script es JS
// plano (no pasa por ts-node), así que no puede importar el módulo TS
// directamente. Si se agrega/quita una sección allá, actualizar también acá.
const ALL_SECTION_KEYS = [
  'DASHBOARD',
  'PROJECTS',
  'ADMIN',
  'TOOLS',
  'CACAO',
  'COMPANY_SETTINGS',
  'COMPANIES',
  'CUSTODIAS',
  'RRHH',
  'VENTAS',
  'CONTRATACION_PUBLICA',
  'SISTEMAS',
];
const SECCIONES_SIEMPRE_VISIBLES = ['DASHBOARD', 'PROJECTS'];

const APPLY = process.argv.includes('--apply');

async function main() {
  console.log(
    APPLY
      ? 'Modo APLICAR: se van a crear filas de permisos.'
      : 'Modo DRY-RUN: solo se va a reportar, no se escribe nada. Usa --apply para ejecutar de verdad.',
  );

  const users = await prisma.user.findMany({
    where: { companyId: { not: null } },
    select: {
      id: true,
      email: true,
      fullName: true,
      role: true,
      companyId: true,
      _count: { select: { permissions: true } },
    },
  });

  const withoutRows = users.filter((u) => u._count.permissions === 0);
  const admins = withoutRows.filter((u) => u.role === 'ADMIN');
  const nonAdmins = withoutRows.filter((u) => u.role !== 'ADMIN');

  console.log(`Usuarios de empresa escaneados: ${users.length}`);
  console.log(`Sin ninguna fila de permisos: ${withoutRows.length}`);
  console.log(`  -> Admin (quedarán con acceso explícito completo): ${admins.length}`);
  console.log(`  -> Employee/Manager (quedarán denegados por defecto): ${nonAdmins.length}`);

  if (withoutRows.length > 0) {
    console.log('\nMuestra (máx. 20):');
    for (const u of withoutRows.slice(0, 20)) {
      console.log(`  - [${u.role}] ${u.fullName} <${u.email}> (companyId=${u.companyId})`);
    }
  }

  if (!APPLY) {
    console.log('\nNada escrito (dry-run). Corre con --apply para aplicar.');
    return;
  }

  const fixedByCompany = new Map();
  async function getFixedSections(companyId) {
    if (fixedByCompany.has(companyId)) return fixedByCompany.get(companyId);
    const rows = await prisma.companySection.findMany({
      where: { companyId, fixedForAll: true },
      select: { section: true },
    });
    const fixed = new Set([
      ...SECCIONES_SIEMPRE_VISIBLES,
      ...rows.map((r) => r.section),
    ]);
    fixedByCompany.set(companyId, fixed);
    return fixed;
  }

  let created = 0;
  for (const u of withoutRows) {
    const fixed = await getFixedSections(u.companyId);
    const applicableSections = ALL_SECTION_KEYS.filter((key) => !fixed.has(key));
    if (applicableSections.length === 0) continue;

    const allow = u.role === 'ADMIN';
    await prisma.userPermission.createMany({
      data: applicableSections.map((key) => ({
        userId: u.id,
        section: key,
        canView: allow,
        canWrite: allow,
      })),
      skipDuplicates: true,
    });
    created++;
  }

  console.log(`\nListo. Filas de permisos creadas para ${created} usuarios.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
