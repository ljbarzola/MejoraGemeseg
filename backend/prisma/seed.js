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

  console.log('Creando empresas...');
  const gemeseg = await prisma.company.findFirst({ where: { slug: 'gemeseg' } }) || await prisma.company.create({
    data: {
      name: 'GEMESEG',
      slug: 'gemeseg',
      primaryColor: '#100F31',
      secondaryColor: '#12375F',
      accentColor: '#EE3B1B',
      bgColor: '#f8fafc',
      textColor: '#1e293b',
      domain: '@gemeseg.com',
    },
  });

  const mikacao = await prisma.company.findFirst({ where: { slug: 'mikacao' } }) || await prisma.company.create({
    data: {
      name: 'Mikacao S.A.',
      slug: 'mikacao',
      logoUrl: '/resources/logo-mikacao.png',
      primaryColor: '#361F13',
      secondaryColor: '#606B42',
      accentColor: '#606B42',
      bgColor: '#F9F6F0',
      textColor: '#361F13',
      domain: '@mikacao.com',
    },
  });

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
      companyId: gemeseg.id,
    },
  });

  if (!admin.companyId) {
    await prisma.user.update({ where: { id: admin.id }, data: { companyId: gemeseg.id } });
  }

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
      companyId: gemeseg.id,
    },
  });

  if (!hugo.companyId) {
    await prisma.user.update({ where: { id: hugo.id }, data: { companyId: gemeseg.id } });
  }

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
      companyId: gemeseg.id,
    },
  });

  if (!david.companyId) {
    await prisma.user.update({ where: { id: david.id }, data: { companyId: gemeseg.id } });
  }

  const nayelli = await prisma.user.findFirst({ where: { email: 'nayelli@gemeseg.com' } }) || await prisma.user.create({
    data: {
      fullName: 'Nayelli',
      email: 'nayelli@gemeseg.com',
      password,
      role: 'EMPLOYEE',
      documentNumber: '1744455566',
      position: 'Analista de Recursos Humanos',
      departmentId: deptRRHH.id,
      companyId: gemeseg.id,
    },
  });

  if (!nayelli.companyId) {
    await prisma.user.update({ where: { id: nayelli.id }, data: { companyId: gemeseg.id } });
  }

  const leidy = await prisma.user.findFirst({ where: { email: 'sistemas@gemeseg.com' } }) || await prisma.user.create({
    data: {
      fullName: 'Leidy Barzola',
      email: 'sistemas@gemeseg.com',
      password,
      role: 'EMPLOYEE',
      documentNumber: '1755566677',
      position: 'Analista de Sistemas',
      departmentId: deptTI.id,
      companyId: gemeseg.id,
    },
  });

  if (!leidy.companyId) {
    await prisma.user.update({ where: { id: leidy.id }, data: { companyId: gemeseg.id } });
  }

  console.log('Creando usuario admin de Mikacao...');
  const mikacaoPassword = await bcrypt.hash('mikacao2026', 10);
  const adminMikacao = await prisma.user.findFirst({ where: { email: 'admin@mikacao.com' } }) || await prisma.user.create({
    data: {
      fullName: 'Administración Mikacao',
      email: 'admin@mikacao.com',
      password: mikacaoPassword,
      role: 'ADMIN',
      documentNumber: '1799988877',
      position: 'Administrador del Sistema',
      departmentId: deptTI.id,
      companyId: mikacao.id,
    },
  });

  console.log('Creando super admin (admin@general.com)...');
  const generalPassword = await bcrypt.hash('admin2026', 10);
  const superAdmin = await prisma.user.findFirst({ where: { email: 'admin@general.com' } }) || await prisma.user.create({
    data: {
      fullName: 'Super Administrador',
      email: 'admin@general.com',
      password: generalPassword,
      role: 'ADMIN',
      documentNumber: '1700000000',
      position: 'Super Administrador',
      companyId: null,
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

  // ─── CACAO MODULE SEED DATA ────────────────────────────────────

  console.log('\nCreando datos del módulo Cacao...');

  // Qualities
  const qualitiesData = [
    { name: 'Convencional', humidityDiscount: 7, impurityDiscount: 1, isFixedPrice: true, fixedPrice: 2.50 },
    { name: 'Orgánico', humidityDiscount: 6, impurityDiscount: 0.5, isFixedPrice: false, fixedPrice: null },
    { name: 'Fino de Aroma', humidityDiscount: 7, impurityDiscount: 1, isFixedPrice: false, fixedPrice: null },
    { name: 'Grado 1', humidityDiscount: 7.5, impurityDiscount: 1.2, isFixedPrice: true, fixedPrice: 2.40 },
    { name: 'Grado 2', humidityDiscount: 8, impurityDiscount: 1.5, isFixedPrice: true, fixedPrice: 2.20 },
  ];
  const qualityMap = {};
  for (const qd of qualitiesData) {
    let quality = await prisma.cacaoQuality.findFirst({ where: { name: qd.name } });
    if (!quality) {
      quality = await prisma.cacaoQuality.create({ data: qd });
    } else {
      quality = await prisma.cacaoQuality.update({ where: { id: quality.id }, data: qd });
    }
    qualityMap[qd.name] = quality;
  }
  console.log('  ✓ Calidades creadas:', qualitiesData.map(q => q.name).join(', '));

  // Suppliers (Mikacao companyId: 2)
  const suppliersData = [
    { name: 'Cooperativa Agraria de Guayas', contact: 'Carlos Mendoza', phone: '0991234567', paymentTerms: '30 días', bank: 'Banco Pichincha' },
    { name: 'Finca El Oro - Los Ríos', contact: 'María Jaramillo', phone: '0987654321', paymentTerms: '15 días', bank: 'Banco del Austro' },
    { name: 'Asociación de Productores Manabí', contact: 'Luis Terán', phone: '0971122334', paymentTerms: 'Quincenal', bank: 'Banco Central' },
  ];
  const supplierMap = {};
  for (const sd of suppliersData) {
    let supplier = await prisma.cacaoSupplier.findFirst({ where: { name: sd.name, companyId: 2 } });
    if (!supplier) {
      supplier = await prisma.cacaoSupplier.create({ data: { ...sd, companyId: 2 } });
    }
    supplierMap[sd.name] = supplier;
  }
  console.log('  ✓ Proveedores creados: 3');

  // Clients
  const clientsData = [
    { name: 'ChocoLovers GmbH', country: 'Alemania', contact: 'Hans Müller', email: 'hans@chocolovers.de', phone: '+49 30 1234567' },
    { name: 'Belgian Fine Chocolate', country: 'Bélgica', contact: 'Pierre Dubois', email: 'pierre@bfchoc.be', phone: '+32 2 9876543' },
    { name: 'Cacao Premium Colombia', country: 'Colombia', contact: 'Andrés Ramírez', email: 'andres@cacaopremium.co', phone: '+57 1 2345678' },
  ];
  const clientMap = {};
  for (const cd of clientsData) {
    let client = await prisma.cacaoClient.findFirst({ where: { name: cd.name, companyId: 2 } });
    if (!client) {
      client = await prisma.cacaoClient.create({ data: { ...cd, companyId: 2 } });
    }
    clientMap[cd.name] = client;
  }
  console.log('  ✓ Clientes creados: 3');

  // Lots + Receptions + Kardex (5 lots)
  const lotData = [
    { code: 'LOTE-2026-001', quality: 'Convencional', netWeight: 950, cost: 2.50, humidity: 7.5, impurities: 0.8, grossWeight: 1000, tare: 50, supplier: 'Cooperativa Agraria de Guayas', guide: 'TR-2026-0001', date: '2026-07-01', differential: -200 },
    { code: 'LOTE-2026-002', quality: 'Convencional', netWeight: 1100, cost: 2.45, humidity: 6.5, impurities: 0.5, grossWeight: 1150, tare: 50, supplier: 'Cooperativa Agraria de Guayas', guide: 'TR-2026-0002', date: '2026-07-03', differential: -150 },
    { code: 'LOTE-2026-003', quality: 'Fino de Aroma', netWeight: 800, cost: 3.20, humidity: 8.1, impurities: 1.2, grossWeight: 850, tare: 50, supplier: 'Finca El Oro - Los Ríos', guide: 'TR-2026-0003', date: '2026-07-05', differential: -150 },
    { code: 'LOTE-2026-004', quality: 'Orgánico', netWeight: 600, cost: 3.80, humidity: 6.0, impurities: 0.3, grossWeight: 640, tare: 40, supplier: 'Asociación de Productores Manabí', guide: 'TR-2026-0004', date: '2026-07-08', differential: 0 },
    { code: 'LOTE-2026-005', quality: 'Convencional', netWeight: 1200, cost: 2.53, humidity: 7.2, impurities: 0.6, grossWeight: 1260, tare: 60, supplier: 'Finca El Oro - Los Ríos', guide: 'TR-2026-0005', date: '2026-07-10', differential: -100 },
  ];

  const createdLots = [];
  for (const ld of lotData) {
    const lot = await prisma.cacaoLot.upsert({
      where: { code: ld.code },
      update: { differential: ld.differential },
      create: {
        code: ld.code,
        qualityId: qualityMap[ld.quality].id,
        netWeight: ld.netWeight,
        averageCost: ld.cost,
        differential: ld.differential,
        status: 'OPEN',
        companyId: 2,
      },
    });
    createdLots.push(lot);

    // Create reception (idempotent)
    const existingReception = await prisma.cacaoReception.findFirst({ where: { guideNumber: ld.guide, lotId: lot.id } });
    if (!existingReception) {
      await prisma.cacaoReception.create({
        data: {
          date: new Date(ld.date),
          supplierId: supplierMap[ld.supplier].id,
          guideNumber: ld.guide,
          grossWeight: ld.grossWeight,
          tare: ld.tare,
          netWeight: ld.netWeight,
          humidity: ld.humidity,
          impurities: ld.impurities,
          provisionalPrice: ld.cost,
          differential: ld.differential,
          lotId: lot.id,
          companyId: 2,
          createdBy: adminMikacao.id,
        },
      });
    }

    // Create kardex entry (idempotent)
    const existingKardex = await prisma.cacaoKardex.findFirst({ where: { lotId: lot.id, reference: `Recepción ${ld.guide}` } });
    if (!existingKardex) {
      await prisma.cacaoKardex.create({
        data: {
          lotId: lot.id,
          type: 'ENTRY',
          quantity: ld.netWeight,
          unitCost: ld.cost,
          totalCost: ld.netWeight * ld.cost,
          balanceQty: ld.netWeight,
          balanceCost: ld.netWeight * ld.cost,
          date: new Date(ld.date),
          reference: `Recepción ${ld.guide}`,
          companyId: 2,
        },
      });
    }
  }
  console.log('  ✓ Lotes creados: 5 + recepciones + kardex');

  // Price Fixings (2 open, idempotent)
  const fixing1Exists = await prisma.cacaoPriceFixing.findFirst({ where: { lotId: createdLots[0].id, status: 'OPEN' } });
  if (!fixing1Exists) {
    await prisma.cacaoPriceFixing.create({
      data: {
        lotId: createdLots[0].id,
        referencePrice: 8000,
        differential: -200,
        fixedPrice: null,
        pendingWeight: 950,
        deadline: new Date('2026-07-20'),
        status: 'OPEN',
        companyId: 2,
        createdBy: adminMikacao.id,
      },
    });
  }
  const fixing2Exists = await prisma.cacaoPriceFixing.findFirst({ where: { lotId: createdLots[2].id, status: 'OPEN' } });
  if (!fixing2Exists) {
    await prisma.cacaoPriceFixing.create({
      data: {
        lotId: createdLots[2].id,
        referencePrice: 8200,
        differential: -150,
        fixedPrice: null,
        pendingWeight: 800,
        deadline: new Date('2026-07-25'),
        status: 'OPEN',
        companyId: 2,
        createdBy: adminMikacao.id,
      },
    });
  }
  console.log('  ✓ Fijaciones abiertas: 2');

  // Unit Config (Mikacao companyId: 2)
  console.log('Creando configuración de unidades...');
  const existingUnitConfig = await prisma.cacaoUnitConfig.findFirst({ where: { companyId: 2, name: 'SACO_MICHOACAN' } });
  if (!existingUnitConfig) {
    await prisma.cacaoUnitConfig.create({
      data: { name: 'SACO_MICHOACAN', displayName: 'Saco Michoacán (90 kg)', kgPerUnit: 90, isDefault: true, companyId: 2 },
    });
    await prisma.cacaoUnitConfig.create({
      data: { name: 'SACO_ESTANDAR', displayName: 'Saco Estándar (69 kg)', kgPerUnit: 69, isDefault: false, companyId: 2 },
    });
    await prisma.cacaoUnitConfig.create({
      data: { name: 'SACO_PERSONALIZADO', displayName: 'Saco Personalizado', kgPerUnit: 62, isDefault: false, companyId: 2 },
    });
    console.log('  ✓ Unidades de medida creadas: 3');
  } else {
    console.log('  ✓ Unidades de medida ya existen');
  }

  console.log('\n========================================');
  console.log('  SEED COMPLETADO EXITOSAMENTE');
  console.log('========================================\n');

  console.log('EMPRESAS:');
  console.log('─────────────────────────────────────────');
  console.log(`1. ${gemeseg.name} (${gemeseg.slug}) → dominio: ${gemeseg.domain}`);
  console.log(`2. ${mikacao.name} (${mikacao.slug}) → dominio: ${mikacao.domain}`);

  console.log('\nUSUARIOS GEMESEG (contraseña: gemeseg2026):');
  console.log('─────────────────────────────────────────');
  console.log(`ADMIN:     ${admin.email}  (Administración GEMESEG)`);
  console.log(`MANAGER:   ${hugo.email}  (Hugo Melo - Gerente General)`);
  console.log(`EMPLOYEE:  ${david.email}  (David Izurieta - Marketing Digital)`);
  console.log(`EMPLOYEE:  ${nayelli.email}  (Nayelli - Recursos Humanos)`);
  console.log(`EMPLOYEE:  ${leidy.email}  (Leidy Barzola - Sistemas)`);

  console.log('\nUSUARIOS MIKACAO (contraseña: mikacao2026):');
  console.log('─────────────────────────────────────────');
  console.log(`ADMIN:     ${adminMikacao.email}  (Administración Mikacao)`);

  console.log('\nSUPER ADMIN (contraseña: admin2026):');
  console.log('─────────────────────────────────────────');
  console.log(`SUPER:     ${superAdmin.email}  (Super Administrador - gestiona todas las empresas)`);

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
