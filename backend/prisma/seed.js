const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const bcrypt = require('bcryptjs');

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/gemeseg?schema=public';
const adapter = new PrismaPg({ connectionString: DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log('Limpiando datos existentes...');
  await prisma.chatMessage.deleteMany();
  await prisma.conversation.deleteMany();
  await prisma.aiLog.deleteMany();
  await prisma.agent.deleteMany();
  await prisma.projectMember.deleteMany();
  await prisma.task.deleteMany();
  await prisma.projectMember.deleteMany();
  await prisma.project.deleteMany();
  await prisma.user.deleteMany();
  await prisma.department.deleteMany();
  await prisma.role.deleteMany();

  console.log('Creando departamentos...');
  const deptTI = await prisma.department.create({ data: { name: 'Tecnología e Innovación', description: 'Desarrollo y soporte TI' } });
  const deptMKT = await prisma.department.create({ data: { name: 'Marketing', description: 'Marketing digital y comunicaciones' } });
  const deptFinance = await prisma.department.create({ data: { name: 'Finanzas', description: 'Contabilidad y finanzas' } });
  const deptRRHH = await prisma.department.create({ data: { name: 'Recursos Humanos', description: 'Gestión de talento humano' } });

  console.log('Creando roles organizacionales...');
  const roleAdmin = await prisma.role.create({ data: { name: 'Director', description: 'Director general' } });
  const roleGerente = await prisma.role.create({ data: { name: 'Gerente', description: 'Gerente de área' } });
  const roleAnalyst = await prisma.role.create({ data: { name: 'Analista', description: 'Analista senior' } });

  const password = await bcrypt.hash('gemeseg2026', 10);

  console.log('Creando usuarios...');
  const admin = await prisma.user.create({
    data: {
      fullName: 'Sistemas GEMESEG',
      email: 'admin@gemeseg.com',
      password,
      role: 'ADMIN',
      documentNumber: '1700000001',
      position: 'Administrador del Sistema',
      departmentId: deptTI.id,
      roleId: roleAdmin.id,
    },
  });

  const hugo = await prisma.user.create({
    data: {
      fullName: 'Hugo Melo',
      email: 'hugo@gemeseg.com',
      password,
      role: 'MANAGER',
      documentNumber: '1700000002',
      position: 'Gerente General',
      departmentId: deptFinance.id,
      roleId: roleGerente.id,
    },
  });

  const david = await prisma.user.create({
    data: {
      fullName: 'David Izurieta',
      email: 'david@gemeseg.com',
      password,
      role: 'EMPLOYEE',
      documentNumber: '1733322211',
      position: 'Analista de Marketing Digital',
      departmentId: deptMKT.id,
      roleId: roleAnalyst.id,
    },
  });

  const nayelli = await prisma.user.create({
    data: {
      fullName: 'Nayelli',
      email: 'nayelli@gemeseg.com',
      password,
      role: 'EMPLOYEE',
      documentNumber: '1744455566',
      position: 'Analista de Recursos Humanos',
      departmentId: deptRRHH.id,
    },
  });

  const leidy = await prisma.user.create({
    data: {
      fullName: 'Leidy Barzola',
      email: 'sistemas@gemeseg.com',
      password,
      role: 'EMPLOYEE',
      documentNumber: '1755566677',
      position: 'Analista de Sistemas',
      departmentId: deptTI.id,
    },
  });

  console.log('Creando proyectos...');

  const projectLandings = await prisma.project.create({
    data: {
      name: 'Landings',
      description: 'Diseño y desarrollo de landings pages para campañas de marketing digital.',
      status: 'ACTIVE',
      startDate: new Date('2026-07-01'),
      endDate: new Date('2026-09-30'),
      createdById: david.id,
      members: {
        create: [
          { userId: david.id, role: 'OWNER' },
          { userId: admin.id, role: 'OWNER' },
        ],
      },
    },
  });

  const projectMejora = await prisma.project.create({
    data: {
      name: 'Mejora GEMESEG',
      description: 'Mejoras continuas a la plataforma GEMESEG.',
      status: 'ACTIVE',
      startDate: new Date('2026-07-01'),
      endDate: new Date('2026-12-31'),
      createdById: admin.id,
      members: {
        create: [
          { userId: admin.id, role: 'OWNER' },
          { userId: hugo.id, role: 'MEMBER' },
          { userId: david.id, role: 'MEMBER' },
        ],
      },
    },
  });

  const projectCotizador = await prisma.project.create({
    data: {
      name: 'Cotizador',
      description: 'Sistema de cotización de servicios y productos.',
      status: 'ACTIVE',
      startDate: new Date('2026-07-15'),
      endDate: new Date('2026-10-31'),
      createdById: admin.id,
      members: {
        create: [
          { userId: admin.id, role: 'OWNER' },
          { userId: hugo.id, role: 'MEMBER' },
          { userId: david.id, role: 'VIEWER' },
        ],
      },
    },
  });

  const projectPlataforma = await prisma.project.create({
    data: {
      name: 'Plataforma GEMESEG v2',
      description: 'Rediseño completo de la plataforma de gestión interna con nuevas funcionalidades de IA.',
      status: 'ACTIVE',
      startDate: new Date('2026-07-01'),
      endDate: new Date('2026-12-31'),
      createdById: admin.id,
      members: {
        create: [
          { userId: admin.id, role: 'OWNER' },
          { userId: david.id, role: 'MEMBER' },
        ],
      },
    },
  });

  const projectMigracion = await prisma.project.create({
    data: {
      name: 'Migración a Google Cloud',
      description: 'Migración de infraestructura on-premise a GCP con Cloud Run y Cloud SQL.',
      status: 'ON_HOLD',
      startDate: new Date('2026-08-01'),
      endDate: new Date('2027-02-28'),
      createdById: admin.id,
      members: {
        create: [
          { userId: admin.id, role: 'OWNER' },
          { userId: hugo.id, role: 'MANAGER' },
        ],
      },
    },
  });

  console.log('Creando tareas...');
  await prisma.task.createMany({
    data: [
      { title: 'Diseñar landings para campaña Q3', status: 'IN_PROGRESS', priority: 'HIGH', projectId: projectLandings.id, assigneeId: david.id, estimatedHours: 20 },
      { title: 'Configurar tracking GA4 en landings', status: 'TODO', priority: 'MEDIUM', projectId: projectLandings.id, estimatedHours: 8 },
      { title: 'Implementar OAuth en plataforma', status: 'IN_PROGRESS', priority: 'URGENT', projectId: projectMejora.id, estimatedHours: 16 },
      { title: 'Documentar API REST', status: 'TODO', priority: 'LOW', projectId: projectMejora.id, estimatedHours: 10 },
      { title: 'Módulo de cotizaciones PDF', status: 'TODO', priority: 'HIGH', projectId: projectCotizador.id, assigneeId: hugo.id, estimatedHours: 24 },
      { title: 'Diseñar interfaz del cotizador', status: 'IN_REVIEW', priority: 'MEDIUM', projectId: projectCotizador.id, estimatedHours: 12 },
      { title: 'Dashboard con métricas en tiempo real', status: 'DONE', priority: 'HIGH', projectId: projectPlataforma.id, assigneeId: david.id, estimatedHours: 20 },
      { title: 'Pipeline CI/CD en GitHub Actions', status: 'TODO', priority: 'MEDIUM', projectId: projectPlataforma.id, estimatedHours: 12 },
      { title: 'Evaluar costos GCP', status: 'TODO', priority: 'MEDIUM', projectId: projectMigracion.id, assigneeId: hugo.id, estimatedHours: 8 },
    ],
  });

  console.log('\n========================================');
  console.log('  SEED COMPLETADO EXITOSAMENTE');
  console.log('========================================\n');

  console.log('USUARIOS (contraseña: gemeseg2026):');
  console.log('─────────────────────────────────────────');
  console.log(`ADMIN:     ${admin.email}  (Sistemas GEMESEG)`);
  console.log(`MANAGER:   ${hugo.email}  (Hugo Melo - Gerente General)`);
  console.log(`EMPLOYEE:  ${david.email}  (David Izurieta - Marketing Digital)`);
  console.log(`EMPLOYEE:  ${nayelli.email}  (Nayelli - Recursos Humanos)`);
  console.log(`EMPLOYEE:  ${leidy.email}  (Leidy Barzola - Sistemas)`);
  console.log('\nPROYECTOS:');
  console.log('─────────────────────────────────────────');
  console.log(`1. ${projectLandings.name} [ACTIVE] → David (OWNER), Admin (OWNER)`);
  console.log(`2. ${projectMejora.name} [ACTIVE] → Admin (OWNER), Hugo (MEMBER), David (MEMBER)`);
  console.log(`3. ${projectCotizador.name} [ACTIVE] → Admin (OWNER), Hugo (MEMBER), David (VIEWER)`);
  console.log(`4. ${projectPlataforma.name} [ACTIVE] → Admin (OWNER), David (MEMBER)`);
  console.log(`5. ${projectMigracion.name} [ON_HOLD] → Admin (OWNER), Hugo (MANAGER)`);
}

main()
  .catch((e) => {
    console.error('Error en seed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
