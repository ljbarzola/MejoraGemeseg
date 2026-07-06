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
  const admin = await prisma.user.create({
    data: {
      fullName: 'Leidy Ponce',
      email: 'leidy@gemeseg.com',
      password,
      role: 'ADMIN',
      documentNumber: '1712345678',
      position: 'Directora General',
      departmentId: deptTI.id,
      roleId: roleAdmin.id,
    },
  });

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

  console.log('Creando proyectos de prueba...');
  const project1 = await prisma.project.create({
    data: {
      name: 'Plataforma GEMESEG v2',
      description: 'Rediseño completo de la plataforma de gestión interna con nuevas funcionalidades de IA y automatización.',
      status: 'ACTIVE',
      startDate: new Date('2026-07-01'),
      endDate: new Date('2026-12-31'),
      createdById: admin.id,
      members: {
        create: [
          { userId: admin.id, role: 'OWNER' },
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
      createdById: admin.id,
      members: {
        create: [
          { userId: admin.id, role: 'OWNER' },
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

  console.log('Creando tareas de prueba...');
  const task1 = await prisma.task.create({
    data: {
      title: 'Diseñar nueva interfaz del dashboard',
      description: 'Crear mockups y prototipos del nuevo dashboard principal con métricas en tiempo real.',
      status: 'DONE',
      priority: 'HIGH',
      dueDate: new Date('2026-07-15'),
      estimatedHours: 24,
      projectId: project1.id,
      assigneeId: employee.id,
    },
  });

  const task2 = await prisma.task.create({
    data: {
      title: 'Implementar módulo de autenticación OAuth',
      description: 'Integrar login con Google y Microsoft usando OAuth 2.0.',
      status: 'IN_PROGRESS',
      priority: 'URGENT',
      dueDate: new Date('2026-07-20'),
      estimatedHours: 16,
      projectId: project1.id,
      assigneeId: employee.id,
    },
  });

  const task3 = await prisma.task.create({
    data: {
      title: 'Configurar pipeline CI/CD',
      description: 'Setup de GitHub Actions para build, test y deploy automático a Cloud Run.',
      status: 'TODO',
      priority: 'MEDIUM',
      dueDate: new Date('2026-07-25'),
      estimatedHours: 12,
      projectId: project1.id,
    },
  });

  const task4 = await prisma.task.create({
    data: {
      title: 'Escribir documentación API',
      description: 'Documentar todos los endpoints REST con Swagger/OpenAPI.',
      status: 'IN_REVIEW',
      priority: 'LOW',
      dueDate: new Date('2026-08-01'),
      estimatedHours: 8,
      projectId: project1.id,
      assigneeId: employee.id,
    },
  });

  const task5 = await prisma.task.create({
    data: {
      title: 'Crear campaña Instagram Q3',
      description: 'Diseñar contenido visual y calendario de publicaciones para Instagram.',
      status: 'IN_PROGRESS',
      priority: 'HIGH',
      dueDate: new Date('2026-07-18'),
      estimatedHours: 20,
      projectId: project2.id,
      assigneeId: employee2.id,
    },
  });

  const task6 = await prisma.task.create({
    data: {
      title: 'Analizar métricas SEO del sitio',
      description: 'Revisar posicionamiento actual y proponer mejoras técnicas de SEO.',
      status: 'TODO',
      priority: 'MEDIUM',
      dueDate: new Date('2026-07-22'),
      estimatedHours: 10,
      projectId: project2.id,
    },
  });

  const task7 = await prisma.task.create({
    data: {
      title: 'Diseñar presupuesto publicitario',
      description: 'Definir distribución del presupuesto en campañas pagadas de Google Ads y Meta.',
      status: 'DONE',
      priority: 'HIGH',
      dueDate: new Date('2026-07-10'),
      estimatedHours: 6,
      projectId: project2.id,
      assigneeId: employee2.id,
    },
  });

  console.log('\n========================================');
  console.log('  SEED COMPLETADO EXITOSAMENTE');
  console.log('========================================\n');

  console.log('USUARIOS CREADOS (todos: contraseña = gemeseg2026):');
  console.log('─────────────────────────────────────────');
  console.log(`ADMIN:   ${admin.email}  (Leidy Ponce - Directora General)`);
  console.log(`MANAGER: ${manager.email}  (Carlos Mendoza - Gerente Marketing)`);
  console.log(`EMPLOYEE: ${employee.email}  (Andrea Vera - Dev Senior)`);
  console.log(`EMPLOYEE: ${employee2.email}  (Miguel Torres - Analista Marketing)`);
  console.log('\nPROYECTOS CREADOS:');
  console.log('─────────────────────────────────────────');
  console.log(`1. ${project1.name} [ACTIVE] → Leidy (OWNER), Andrea (MEMBER)`);
  console.log(`2. ${project2.name} [ACTIVE] → Carlos (OWNER), Miguel (MEMBER)`);
  console.log(`3. ${project3.name} [ON_HOLD] → Leidy (OWNER), Andrea (MANAGER)`);
  console.log(`4. ${project4.name} [COMPLETED] → Carlos (OWNER), Andrea (MEMBER), Miguel (VIEWER)`);
  console.log(`5. ${project5.name} [ACTIVE] → Carlos (OWNER), Miguel (MEMBER)`);
  console.log('\nTAREAS CREADAS:');
  console.log('─────────────────────────────────────────');
  console.log(`1. ${task1.title} [DONE] → Andrea`);
  console.log(`2. ${task2.title} [IN_PROGRESS] → Andrea`);
  console.log(`3. ${task3.title} [TODO] → Sin asignar`);
  console.log(`4. ${task4.title} [IN_REVIEW] → Andrea`);
  console.log(`5. ${task5.title} [IN_PROGRESS] → Miguel`);
  console.log(`6. ${task6.title} [TODO] → Sin asignar`);
  console.log(`7. ${task7.title} [DONE] → Miguel`);
}

main()
  .catch((e) => {
    console.error('Error en seed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
