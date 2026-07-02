const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const bcrypt = require('bcryptjs');

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/gemeseg?schema=public';
const adapter = new PrismaPg({ connectionString: DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log('Limpiando datos existentes...');
  await prisma.task.deleteMany();
  await prisma.projectMember.deleteMany();
  await prisma.project.deleteMany();
  await prisma.user.deleteMany();
  await prisma.department.deleteMany();
  await prisma.role.deleteMany();

  console.log('Creando departamentos...');
  const deptTI = await prisma.department.create({ data: { name: 'Tecnología e Innovación', description: 'Desarrollo y soporte TI' } });
  const deptMKT = await prisma.department.create({ data: { name: 'Marketing', description: 'Marketing digital y comunicaciones' } });
  const deptRRHH = await prisma.department.create({ data: { name: 'Recursos Humanos', description: 'Gestión de talento humano' } });

  console.log('Creando roles organizacionales...');
  const roleAdmin = await prisma.role.create({ data: { name: 'Director', description: 'Director general' } });
  const roleManager = await prisma.role.create({ data: { name: 'Gerente', description: 'Gerente de área' } });
  const roleEmployee = await prisma.role.create({ data: { name: 'Analista', description: 'Analista senior' } });

  const password = await bcrypt.hash('gemeseg2026', 10);

  console.log('Creando usuarios de prueba...');
  const manager = await prisma.user.create({
    data: {
      fullName: 'Carlos Mendoza',
      email: 'carlos@gemeseg.com',
      password,
      role: 'MANAGER',
      documentNumber: '1798765432',
      position: 'Gerente de Marketing',
      departmentId: deptMKT.id,
      roleId: roleManager.id,
    },
  });

  const employee = await prisma.user.create({
    data: {
      fullName: 'Andrea Vera',
      email: 'andrea@gemeseg.com',
      password,
      role: 'EMPLOYEE',
      documentNumber: '1755566677',
      position: 'Desarrolladora Senior',
      departmentId: deptTI.id,
      roleId: roleEmployee.id,
    },
  });

  const employee2 = await prisma.user.create({
    data: {
      fullName: 'Miguel Torres',
      email: 'miguel@gemeseg.com',
      password,
      role: 'EMPLOYEE',
      documentNumber: '1744433322',
      position: 'Analista de Marketing',
      departmentId: deptMKT.id,
      roleId: roleEmployee.id,
    },
  });

  const sistemas = await prisma.user.create({
    data: {
      fullName: 'Leidy Barzola',
      email: 'sistemas@gemeseg.com',
      password,
      role: 'ADMIN',
      documentNumber: '1700000000',
      position: 'Directora de Sistemas',
      departmentId: deptTI.id,
      roleId: roleAdmin.id,
    },
  });

  console.log('Creando proyectos de prueba...');
  const project1 = await prisma.project.create({
    data: {
      name: 'Plataforma GEMESEG v2',
      description: 'Rediseño completo de la plataforma de gestión interna con nuevas funcionalidades de IA y automatización.',
      status: 'ACTIVE',
      startDate: new Date('2026-07-01'),
      endDate: new Date('2026-12-31'),
      createdById: sistemas.id,
      members: {
        create: [
          { userId: sistemas.id, role: 'OWNER' },
          { userId: employee.id, role: 'MEMBER' },
        ],
      },
    },
  });

  const project2 = await prisma.project.create({
    data: {
      name: 'Campaña Marketing Q3 2026',
      description: 'Estrategia de marketing digital para el tercer trimestre, incluyendo redes sociales, SEO y campañas pagadas.',
      status: 'ACTIVE',
      startDate: new Date('2026-07-01'),
      endDate: new Date('2026-09-30'),
      createdById: manager.id,
      members: {
        create: [
          { userId: manager.id, role: 'OWNER' },
          { userId: employee2.id, role: 'MEMBER' },
        ],
      },
    },
  });

  const project3 = await prisma.project.create({
    data: {
      name: 'Migración a Google Cloud',
      description: 'Migración de infraestructura on-premise a GCP con Cloud Run y Cloud SQL.',
      status: 'ON_HOLD',
      startDate: new Date('2026-08-01'),
      endDate: new Date('2027-02-28'),
      createdById: sistemas.id,
      members: {
        create: [
          { userId: sistemas.id, role: 'OWNER' },
          { userId: employee.id, role: 'MANAGER' },
        ],
      },
    },
  });

  const project4 = await prisma.project.create({
    data: {
      name: 'Portal de Clientes CRM',
      description: 'Desarrollo de portal web para que los clientes puedan consultar estado de proyectos y facturación.',
      status: 'COMPLETED',
      startDate: new Date('2026-01-15'),
      endDate: new Date('2026-06-30'),
      createdById: manager.id,
      members: {
        create: [
          { userId: manager.id, role: 'OWNER' },
          { userId: employee.id, role: 'MEMBER' },
          { userId: employee2.id, role: 'VIEWER' },
        ],
      },
    },
  });

  const project5 = await prisma.project.create({
    data: {
      name: 'Capacitación en Herramientas Digitales',
      description: 'Programa de capacitación para todo el personal en nuevas herramientas digitales y flujos de trabajo.',
      status: 'ACTIVE',
      startDate: new Date('2026-07-15'),
      endDate: new Date('2026-10-15'),
      createdById: manager.id,
      members: {
        create: [
          { userId: manager.id, role: 'OWNER' },
          { userId: employee2.id, role: 'MEMBER' },
        ],
      },
    },
  });

  console.log('\n========================================');
  console.log('  SEED COMPLETADO EXITOSAMENTE');
  console.log('========================================\n');

  console.log('USUARIOS CREADOS (todos: contraseña = gemeseg2026):');
  console.log('─────────────────────────────────────────');
  console.log(`ADMIN:    ${sistemas.email}  (Leidy Barzola - Directora de Sistemas)`);
  console.log(`MANAGER: ${manager.email}  (Carlos Mendoza - Gerente Marketing)`);
  console.log(`EMPLOYEE: ${employee.email}  (Andrea Vera - Dev Senior)`);
  console.log(`EMPLOYEE: ${employee2.email}  (Miguel Torres - Analista Marketing)`);
  console.log('\nPROYECTOS CREADOS:');
  console.log('─────────────────────────────────────────');
  console.log(`1. ${project1.name} [ACTIVE] → Leidy Barzola (OWNER), Andrea (MEMBER)`);
  console.log(`2. ${project2.name} [ACTIVE] → Carlos (OWNER), Miguel (MEMBER)`);
  console.log(`3. ${project3.name} [ON_HOLD] → Leidy Barzola (OWNER), Andrea (MANAGER)`);
  console.log(`4. ${project4.name} [COMPLETED] → Carlos (OWNER), Andrea (MEMBER), Miguel (VIEWER)`);
  console.log(`5. ${project5.name} [ACTIVE] → Carlos (OWNER), Miguel (MEMBER)`);

  console.log('\nCreando tareas de prueba...');
  await prisma.task.createMany({
    data: [
      { title: 'Configurar base de datos PostgreSQL', description: 'Crear schemas, indices y usuarios de BD', priority: 'HIGH', status: 'DONE', projectId: project1.id, assigneeId: employee.id, dueDate: new Date('2026-07-15'), estimatedHours: 8 },
      { title: 'Diseñar schema de Prisma', description: 'Definir modelos User, Project, Task, enums', priority: 'HIGH', status: 'DONE', projectId: project1.id, assigneeId: employee.id, dueDate: new Date('2026-07-10'), estimatedHours: 6 },
      { title: 'Implementar autenticacion JWT', description: 'Login, register, guards, bcrypt', priority: 'HIGH', status: 'DONE', projectId: project1.id, assigneeId: employee.id, dueDate: new Date('2026-07-20'), estimatedHours: 12 },
      { title: 'Crear modulo de proyectos CRUD', description: 'Create, read, update con guards por rol', priority: 'MEDIUM', status: 'DONE', projectId: project1.id, assigneeId: employee.id, dueDate: new Date('2026-07-25'), estimatedHours: 16 },
      { title: 'Implementar tablero Kanban', description: 'Vista drag-and-drop con columnas por estado', priority: 'MEDIUM', status: 'IN_PROGRESS', projectId: project1.id, assigneeId: employee.id, dueDate: new Date('2026-08-01'), estimatedHours: 20 },
      { title: 'Integrar Claude API para sugerencias', description: 'Usar IA para sugerir asignacion de tareas', priority: 'LOW', status: 'TODO', projectId: project1.id, dueDate: new Date('2026-08-15'), estimatedHours: 24 },
      { title: 'Deploy a GCP Cloud Run', description: 'Configurar Dockerfile, Cloud Build y Cloud SQL', priority: 'URGENT', status: 'TODO', projectId: project1.id, dueDate: new Date('2026-09-01'), estimatedHours: 16 },
      { title: 'Definir estrategia de contenido Q3', description: 'Calendario editorial para redes sociales', priority: 'HIGH', status: 'IN_PROGRESS', projectId: project2.id, assigneeId: employee2.id, dueDate: new Date('2026-07-15'), estimatedHours: 10 },
      { title: 'Crear landing page campana', description: 'Diseno y desarrollo de landing page promocional', priority: 'MEDIUM', status: 'TODO', projectId: project2.id, assigneeId: employee2.id, dueDate: new Date('2026-07-30'), estimatedHours: 14 },
      { title: 'Configurar campañas Google Ads', description: 'Setup de campanas SEM y remarketing', priority: 'MEDIUM', status: 'TODO', projectId: project2.id, assigneeId: employee2.id, dueDate: new Date('2026-08-05'), estimatedHours: 8 },
      { title: 'Analisis de metricas Q2', description: 'Reporte de KPIs del segundo trimestre', priority: 'LOW', status: 'IN_REVIEW', projectId: project2.id, assigneeId: employee2.id, dueDate: new Date('2026-07-10'), estimatedHours: 6 },
      { title: 'Evaluacion de servicios GCP', description: 'Comparar Cloud Run vs Cloud Functions vs GKE', priority: 'HIGH', status: 'TODO', projectId: project3.id, assigneeId: employee.id, dueDate: new Date('2026-08-15'), estimatedHours: 12 },
      { title: 'Crear infraestructura IaC', description: 'Terraform/Pulumi para recursos GCP', priority: 'MEDIUM', status: 'TODO', projectId: project3.id, dueDate: new Date('2026-09-01'), estimatedHours: 20 },
    ],
  });

  console.log('13 tareas creadas (Proyecto 1: 7, Proyecto 2: 4, Proyecto 3: 2)');
}

main()
  .catch((e) => {
    console.error('Error en seed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
