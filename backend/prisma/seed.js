require('dotenv/config');
const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const bcrypt = require('bcryptjs');

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/gemeseg?schema=public';
const isRemote = DATABASE_URL.includes('supabase') || DATABASE_URL.includes('pooler');
const adapter = new PrismaPg({
  connectionString: DATABASE_URL,
  ...(isRemote ? { ssl: { rejectUnauthorized: false } } : {}),
});
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log('Verificando datos existentes (modo idempotente)...');

  console.log('Creando departamentos...');
  const deptTIData = { name: 'Tecnología e Innovación', description: 'Desarrollo y soporte TI' };
  const deptTI = await prisma.department.findFirst({ where: { name: deptTIData.name } }) || await prisma.department.create({ data: deptTIData });

  const deptMKTData = { name: 'Marketing', description: 'Marketing digital y comunicaciones' };
  const deptMKT = await prisma.department.findFirst({ where: { name: deptMKTData.name } }) || await prisma.department.create({ data: deptMKTData });

  const deptFinanceData = { name: 'Finanzas', description: 'Contabilidad y finanzas' };
  const deptFinance = await prisma.department.findFirst({ where: { name: deptFinanceData.name } }) || await prisma.department.create({ data: deptFinanceData });

  const deptRRHHData = { name: 'Recursos Humanos', description: 'Gestión de talento humano' };
  const deptRRHH = await prisma.department.findFirst({ where: { name: deptRRHHData.name } }) || await prisma.department.create({ data: deptRRHHData });

  console.log('Creando roles organizacionales...');
  const roleAdminData = { name: 'Director', description: 'Director general' };
  const roleAdmin = await prisma.role.findFirst({ where: { name: roleAdminData.name } }) || await prisma.role.create({ data: roleAdminData });

  const roleGerenteData = { name: 'Gerente', description: 'Gerente de área' };
  const roleGerente = await prisma.role.findFirst({ where: { name: roleGerenteData.name } }) || await prisma.role.create({ data: roleGerenteData });

  const roleAnalystData = { name: 'Analista', description: 'Analista senior' };
  const roleAnalyst = await prisma.role.findFirst({ where: { name: roleAnalystData.name } }) || await prisma.role.create({ data: roleAnalystData });

  const password = await bcrypt.hash('gemeseg2026', 10);

  console.log('Creando usuarios...');
  const admin = await prisma.user.findFirst({ where: { email: 'admin@gemeseg.com' } }) || await prisma.user.create({
    data: {
      fullName: 'Administración GEMESEG',
      email: 'admin@gemeseg.com',
      password,
      role: 'ADMIN',
      documentNumber: '1700000001',
      position: 'Administrador del Sistema',
      departmentId: deptTI.id,
      roleId: roleAdmin.id,
    },
  });

  const hugo = await prisma.user.findFirst({ where: { email: 'hugo@gemeseg.com' } }) || await prisma.user.create({
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

  const david = await prisma.user.findFirst({ where: { email: 'marketing@gemeseg.com' } }) || await prisma.user.create({
    data: {
      fullName: 'David Izurieta',
      email: 'marketing@gemeseg.com',
      password,
      role: 'EMPLOYEE',
      documentNumber: '1733322211',
      position: 'Analista de Marketing Digital',
      departmentId: deptMKT.id,
      roleId: roleAnalyst.id,
    },
  });

  const nayelli = await prisma.user.findFirst({ where: { email: 'nayelli@gemeseg.com' } }) || await prisma.user.create({
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

  const leidy = await prisma.user.findFirst({ where: { email: 'sistemas@gemeseg.com' } }) || await prisma.user.create({
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

  const projectLandings = await prisma.project.findFirst({ where: { name: 'Landings' } }) || await prisma.project.create({
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
          { userId: leidy.id, role: 'MEMBER' },
          { userId: hugo.id, role: 'MEMBER' },
        ],
      },
    },
  });

  const projectMejora = await prisma.project.findFirst({ where: { name: 'Mejora GEMESEG' } }) || await prisma.project.create({
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
          { userId: leidy.id, role: 'OWNER' },
        ],
      },
    },
  });

  const projectCotizador = await prisma.project.findFirst({ where: { name: 'Cotizador' } }) || await prisma.project.create({
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
          { userId: hugo.id, role: 'OWNER' },
          { userId: leidy.id, role: 'MEMBER' },
        ],
      },
    },
  });

  const projectPlataforma = await prisma.project.findFirst({ where: { name: 'Plataforma GEMESEG' } }) || await prisma.project.create({
    data: {
      name: 'Plataforma GEMESEG',
      description: 'Rediseño completo de la plataforma de gestión interna con nuevas funcionalidades de IA.',
      status: 'ACTIVE',
      startDate: new Date('2026-07-01'),
      endDate: new Date('2026-12-31'),
      createdById: admin.id,
      members: {
        create: [
          { userId: admin.id, role: 'OWNER' },
          { userId: leidy.id, role: 'OWNER' },
          { userId: hugo.id, role: 'MEMBER' },
        ],
      },
    },
  });

  const projectMigracion = await prisma.project.findFirst({ where: { name: 'Migración a Google Cloud' } }) || await prisma.project.create({
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
          { userId: leidy.id, role: 'OWNER' },
          { userId: hugo.id, role: 'MEMBER' },
        ],
      },
    },
  });

  console.log('Creando tareas...');
  const task1 = await prisma.task.findFirst({ where: { title: 'Diseñar landings para campaña Q3', projectId: projectLandings.id } }) || await prisma.task.create({ data: { title: 'Diseñar landings para campaña Q3', status: 'IN_PROGRESS', priority: 'HIGH', projectId: projectLandings.id, estimatedHours: 20 } });
  const task2 = await prisma.task.findFirst({ where: { title: 'Configurar tracking GA4 en landings', projectId: projectLandings.id } }) || await prisma.task.create({ data: { title: 'Configurar tracking GA4 en landings', status: 'TODO', priority: 'MEDIUM', projectId: projectLandings.id, estimatedHours: 8 } });
  const task3 = await prisma.task.findFirst({ where: { title: 'Implementar OAuth en plataforma', projectId: projectMejora.id } }) || await prisma.task.create({ data: { title: 'Implementar OAuth en plataforma', status: 'IN_PROGRESS', priority: 'URGENT', projectId: projectMejora.id, estimatedHours: 16 } });
  const task4 = await prisma.task.findFirst({ where: { title: 'Documentar API REST', projectId: projectMejora.id } }) || await prisma.task.create({ data: { title: 'Documentar API REST', status: 'TODO', priority: 'LOW', projectId: projectMejora.id, estimatedHours: 10 } });
  const task5 = await prisma.task.findFirst({ where: { title: 'Módulo de cotizaciones PDF', projectId: projectCotizador.id } }) || await prisma.task.create({ data: { title: 'Módulo de cotizaciones PDF', status: 'TODO', priority: 'HIGH', projectId: projectCotizador.id, estimatedHours: 24 } });
  const task6 = await prisma.task.findFirst({ where: { title: 'Diseñar interfaz del cotizador', projectId: projectCotizador.id } }) || await prisma.task.create({ data: { title: 'Diseñar interfaz del cotizador', status: 'IN_REVIEW', priority: 'MEDIUM', projectId: projectCotizador.id, estimatedHours: 12 } });
  const task7 = await prisma.task.findFirst({ where: { title: 'Dashboard con métricas en tiempo real', projectId: projectPlataforma.id } }) || await prisma.task.create({ data: { title: 'Dashboard con métricas en tiempo real', status: 'DONE', priority: 'HIGH', projectId: projectPlataforma.id, estimatedHours: 20 } });
  const task8 = await prisma.task.findFirst({ where: { title: 'Pipeline CI/CD en GitHub Actions', projectId: projectPlataforma.id } }) || await prisma.task.create({ data: { title: 'Pipeline CI/CD en GitHub Actions', status: 'TODO', priority: 'MEDIUM', projectId: projectPlataforma.id, estimatedHours: 12 } });
  const task9 = await prisma.task.findFirst({ where: { title: 'Evaluar costos GCP', projectId: projectMigracion.id } }) || await prisma.task.create({ data: { title: 'Evaluar costos GCP', status: 'TODO', priority: 'MEDIUM', projectId: projectMigracion.id, estimatedHours: 8 } });

  console.log('Asignando usuarios a tareas...');
  const assignees = [
    { taskId: task1.id, userId: david.id },
    { taskId: task3.id, userId: hugo.id },
    { taskId: task3.id, userId: david.id },
    { taskId: task5.id, userId: hugo.id },
    { taskId: task7.id, userId: david.id },
    { taskId: task9.id, userId: hugo.id },
  ];
  for (const a of assignees) {
    const exists = await prisma.taskAssignee.findFirst({ where: { taskId: a.taskId, userId: a.userId } });
    if (!exists) {
      await prisma.taskAssignee.create({ data: a });
    }
  }

  console.log('Creando agente global por defecto...');
  const existingAgent = await prisma.agent.findFirst({
    where: { createdBy: null, name: 'Agente GEMESEG' },
  });
  if (!existingAgent) {
    await prisma.agent.create({
      data: {
        name: 'Agente GEMESEG',
        instructions: `Eres el agente de GEMESEG, un sistema de gestión de proyectos y tareas.
Puedes responder preguntas sobre los datos del usuario: proyectos, tareas, miembros, estadísticas.
Cuando el usuario pregunte algo, responde de forma concisa y útil en español.
Si necesitas datos específicos, indica la intención con el formato [INTENCION: nombre_intencion].
Intenciones disponibles:
- list_projects: listar proyectos del usuario
- count_tasks_by_status: contar tareas por estado
- user_info: información del usuario actual
- project_summary: resumen de un proyecto
- list_my_tasks: listar tareas asignadas al usuario
Si no necesitas datos, responde directamente.`,
        scope: 'GLOBAL',
      },
    });
  }

  console.log('Creando agente personalizado para sistemas...');
  const existingCodeAgent = await prisma.agent.findFirst({
    where: { createdBy: leidy.id, name: 'Agente de Código' },
  });
  if (!existingCodeAgent) {
    const codeAgent = await prisma.agent.create({
      data: {
        name: 'Agente de Código',
        instructions: 'Actúa como un Ingeniero en Computación Senior con experiencia en stack tecnológicos y buenas prácticas de desarrollo.',
        scope: 'GLOBAL',
        createdBy: leidy.id,
      },
    });
    await prisma.userAgent.create({ data: { userId: leidy.id, agentId: codeAgent.id } });
  }

  console.log('Creando agentes genéricos por usuario...');

  const adminAgentExists = await prisma.agent.findFirst({
    where: { createdBy: admin.id, name: 'Agente de Administración' },
  });
  if (!adminAgentExists) {
    const adminAgent = await prisma.agent.create({
      data: {
        name: 'Agente de Administración',
        instructions: `Eres el agente de administración de GEMESEG, enfocado en la gestión del sistema.
Ayuda al administrador con: usuarios, roles, permisos, configuración del sistema y métricas globales.
Responde de forma concisa y útil en español.
Si necesitas datos específicos, indica la intención con el formato [INTENCION: nombre_intencion].
Intenciones disponibles:
- list_projects: listar todos los proyectos del sistema
- count_tasks_by_status: contar tareas por estado
- user_info: información de usuarios registrados
- project_summary: resumen de un proyecto
- list_my_tasks: listar tareas asignadas
- system_stats: estadísticas globales del sistema
Si no necesitas datos, responde directamente.`,
        scope: 'GLOBAL',
        createdBy: admin.id,
      },
    });
    await prisma.userAgent.create({ data: { userId: admin.id, agentId: adminAgent.id } });
  }

  const hugoAgentExists = await prisma.agent.findFirst({
    where: { createdBy: hugo.id, name: 'Agente de Gerencia' },
  });
  if (!hugoAgentExists) {
    const hugoAgent = await prisma.agent.create({
      data: {
        name: 'Agente de Gerencia',
        instructions: `Eres el agente de gerencia de GEMESEG, enfocado en visión ejecutiva y financieramente orientada.
Ayuda al gerente con: resúmenes ejecutivos, KPIs, aprobaciones, presupuestos y seguimiento estratégico de proyectos.
Responde de forma concisa y útil en español.
Si necesitas datos específicos, indica la intención con el formato [INTENCION: nombre_intencion].
Intenciones disponibles:
- list_projects: listar proyectos activos con su estado
- count_tasks_by_status: contar tareas por estado para métricas
- user_info: información del usuario actual
- project_summary: resumen ejecutivo de un proyecto
- list_my_tasks: listar tareas asignadas
Si no necesitas datos, responde directamente.`,
        scope: 'GLOBAL',
        createdBy: hugo.id,
      },
    });
    await prisma.userAgent.create({ data: { userId: hugo.id, agentId: hugoAgent.id } });
  }

  const davidAgentExists = await prisma.agent.findFirst({
    where: { createdBy: david.id, name: 'Agente de Marketing' },
  });
  if (!davidAgentExists) {
    const davidAgent = await prisma.agent.create({
      data: {
        name: 'Agente de Marketing',
        instructions: `Eres el agente de marketing de GEMESEG, enfocado en campañas digitales y métricas de marketing.
Ayuda al analista de marketing con: landings, campañas, analytics, contenido, SEO y métricas de conversión.
Responde de forma concisa y útil en español.
Si necesitas datos específicos, indica la intención con el formato [INTENCION: nombre_intencion].
Intenciones disponibles:
- list_projects: listar proyectos de marketing
- count_tasks_by_status: contar tareas de marketing por estado
- user_info: información del usuario actual
- project_summary: resumen de un proyecto de marketing
- list_my_tasks: listar tareas asignadas de marketing
Si no necesitas datos, responde directamente.`,
        scope: 'GLOBAL',
        createdBy: david.id,
      },
    });
    await prisma.userAgent.create({ data: { userId: david.id, agentId: davidAgent.id } });
  }

  const nayelliAgentExists = await prisma.agent.findFirst({
    where: { createdBy: nayelli.id, name: 'Agente de Recursos Humanos' },
  });
  if (!nayelliAgentExists) {
    const nayelliAgent = await prisma.agent.create({
      data: {
        name: 'Agente de Recursos Humanos',
        instructions: `Eres el agente de recursos humanos de GEMESEG, enfocado en gestión de talento y organización.
Ayuda al analista de RRHH con: empleados, dotación, clima laboral, evaluaciones de desempeño y bienestar organizacional.
Responde de forma concisa y útil en español.
Si necesitas datos específicos, indica la intención con el formato [INTENCION: nombre_intencion].
Intenciones disponibles:
- list_projects: listar proyectos activos
- count_tasks_by_status: contar tareas por estado
- user_info: información del usuario actual
- project_summary: resumen de un proyecto
- list_my_tasks: listar tareas asignadas
Si no necesitas datos, responde directamente.`,
        scope: 'GLOBAL',
        createdBy: nayelli.id,
      },
    });
    await prisma.userAgent.create({ data: { userId: nayelli.id, agentId: nayelliAgent.id } });
  }

  console.log('\n========================================');
  console.log('  SEED COMPLETADO EXITOSAMENTE');
  console.log('========================================\n');

  console.log('USUARIOS (contraseña: gemeseg2026):');
  console.log('─────────────────────────────────────────');
  console.log(`ADMIN:     ${admin.email}  (Administración GEMESEG)`);
  console.log(`MANAGER:   ${hugo.email}  (Hugo Melo - Gerente General)`);
  console.log(`EMPLOYEE:  ${david.email}  (David Izurieta - Marketing Digital)`);
  console.log(`EMPLOYEE:  ${nayelli.email}  (Nayelli - Recursos Humanos)`);
  console.log(`EMPLOYEE:  ${leidy.email}  (Leidy Barzola - Sistemas)`);
  console.log('\nPROYECTOS:');
  console.log('─────────────────────────────────────────');
  console.log(`1. ${projectLandings.name} [ACTIVE] → David (OWNER), Admin (OWNER), Leidy (MEMBER), Hugo (MEMBER)`);
  console.log(`2. ${projectMejora.name} [ACTIVE] → Admin (OWNER), Hugo (MEMBER), Leidy (OWNER)`);
  console.log(`3. ${projectCotizador.name} [ACTIVE] → Admin (OWNER), Hugo (OWNER), Leidy (MEMBER)`);
  console.log(`4. ${projectPlataforma.name} [ACTIVE] → Admin (OWNER), Leidy (OWNER), Hugo (MEMBER)`);
  console.log(`5. ${projectMigracion.name} [ON_HOLD] → Admin (OWNER), Leidy (OWNER), Hugo (MEMBER)`);
}

main()
  .catch((e) => {
    console.error('Error en seed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
