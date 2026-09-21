require('dotenv/config');
const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const bcrypt = require('bcryptjs');

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/gemeseg?schema=public';
const adapter = new PrismaPg({ connectionString: DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log('Seed minimo: empresa + usuarios + proyecto/tareas + Personal basico...');

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

  const password = await bcrypt.hash('gemeseg2026', 10);

  const admin = await prisma.user.findFirst({ where: { email: 'admin@gemeseg.com' } }) || await prisma.user.create({
    data: {
      fullName: 'Administración GEMESEG',
      email: 'admin@gemeseg.com',
      password,
      role: 'ADMIN',
      documentNumber: '1700000001',
      position: 'Administrador del Sistema',
      companyId: gemeseg.id,
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
      companyId: gemeseg.id,
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

  console.log('Habilitando seccion RRHH para GEMESEG...');
  const rrhhSection = await prisma.companySection.findFirst({ where: { companyId: gemeseg.id, section: 'RRHH' } });
  if (!rrhhSection) {
    await prisma.companySection.create({ data: { companyId: gemeseg.id, section: 'RRHH' } });
  }

  console.log('Creando proyecto y tareas de ejemplo...');
  const project = await prisma.project.findFirst({ where: { name: 'Proyecto de Prueba' } }) || await prisma.project.create({
    data: {
      name: 'Proyecto de Prueba',
      description: 'Proyecto de ejemplo para pruebas locales.',
      status: 'ACTIVE',
      startDate: new Date(),
      createdById: admin.id,
      members: {
        create: [
          { userId: admin.id, role: 'OWNER' },
          { userId: leidy.id, role: 'MEMBER' },
        ],
      },
    },
  });

  const task1 = await prisma.task.findFirst({ where: { title: 'Tarea de ejemplo 1', projectId: project.id } }) || await prisma.task.create({
    data: { title: 'Tarea de ejemplo 1', status: 'TODO', priority: 'MEDIUM', projectId: project.id, estimatedHours: 4 },
  });
  const task2 = await prisma.task.findFirst({ where: { title: 'Tarea de ejemplo 2', projectId: project.id } }) || await prisma.task.create({
    data: { title: 'Tarea de ejemplo 2', status: 'IN_PROGRESS', priority: 'LOW', projectId: project.id, estimatedHours: 6 },
  });

  const existingAssignee = await prisma.taskAssignee.findFirst({ where: { taskId: task1.id, userId: leidy.id } });
  if (!existingAssignee) {
    await prisma.taskAssignee.create({ data: { taskId: task1.id, userId: leidy.id } });
  }
  void task2;

  console.log('Creando datos minimos del modulo Personal (RRHH)...');
  const existingDocType = await prisma.documentType.findFirst({ where: { companyId: gemeseg.id, folder: 'PERSONAL' } });
  if (!existingDocType) {
    for (const name of ['Hoja de Vida', 'Cédula', 'Contrato']) {
      await prisma.documentType.create({ data: { name, folder: 'PERSONAL', required: true, companyId: gemeseg.id } });
    }
  }

  // ─── GUARDIAS DE PRUEBA (sin depender de un sync real de Drive) ───────
  // GuardiasList.tsx arma su listado desde EmployeeDriveFolder
  // (folderType: 'CUSTODIAS'), no desde AsignacionGuardia directamente —
  // hay que crear ambos para que el guardia aparezca en la lista Y tenga
  // una entidad asignada.
  console.log('Creando entidades y guardias de prueba...');
  const entidadesData = [
    { nombre: 'Banco Pichincha - Matriz', tipo: 'PRIVADA' },
    { nombre: 'Municipio de Quito', tipo: 'PUBLICA' },
    { nombre: 'Corporación Favorita', tipo: 'PRIVADA' },
  ];
  const entidadMap = {};
  for (const ed of entidadesData) {
    let entidad = await prisma.entidad.findFirst({ where: { companyId: gemeseg.id, nombre: ed.nombre } });
    if (!entidad) {
      entidad = await prisma.entidad.create({ data: { ...ed, companyId: gemeseg.id } });
    }
    entidadMap[ed.nombre] = entidad;
  }

  const guardiasData = [
    { nombre: 'Carlos Andrés Mendoza', cedula: '1712345678', entidad: 'Banco Pichincha - Matriz', telefono: '0991112222', email: 'carlos.mendoza@example.com', fechaNacimiento: '1988-03-15' },
    { nombre: 'María José Salazar', cedula: '0923456789', entidad: 'Banco Pichincha - Matriz', telefono: '0992223333', email: 'maria.salazar@example.com', fechaNacimiento: '1992-07-22' },
    { nombre: 'Luis Fernando Vera', cedula: '1734567890', entidad: 'Municipio de Quito', telefono: '0993334444', email: 'luis.vera@example.com', fechaNacimiento: '1985-11-05' },
    { nombre: 'Diana Carolina Torres', cedula: '1745678901', entidad: 'Municipio de Quito', telefono: '0994445555', email: 'diana.torres@example.com', fechaNacimiento: '1990-01-30' },
    { nombre: 'Jorge Eduardo Ramírez', cedula: '0956789012', entidad: 'Municipio de Quito', telefono: '0995556666', email: 'jorge.ramirez@example.com', fechaNacimiento: '1983-09-12' },
    { nombre: 'Sandra Patricia Chávez', cedula: '1767890123', entidad: 'Corporación Favorita', telefono: '0996667777', email: 'sandra.chavez@example.com', fechaNacimiento: '1995-05-18' },
    { nombre: 'Roberto Carlos Díaz', cedula: '1778901234', entidad: 'Corporación Favorita', telefono: '0997778888', email: 'roberto.diaz@example.com', fechaNacimiento: '1987-12-01' },
    { nombre: 'Ana Lucía Herrera', cedula: '0989012345', entidad: null, telefono: '0998889999', email: 'ana.herrera@example.com', fechaNacimiento: '1991-04-08' },
  ];

  for (const g of guardiasData) {
    const existingFolder = await prisma.employeeDriveFolder.findFirst({ where: { companyId: gemeseg.id, cedula: g.cedula } });
    if (!existingFolder) {
      await prisma.employeeDriveFolder.create({
        data: {
          employeeName: g.nombre,
          cedula: g.cedula,
          folderId: `fake-folder-${g.cedula}`,
          folderUrl: `https://drive.google.com/drive/folders/fake-folder-${g.cedula}`,
          folderType: 'CUSTODIAS',
          companyId: gemeseg.id,
        },
      });
    }

    if (g.entidad) {
      const entidad = entidadMap[g.entidad];
      const existingAsignacion = await prisma.asignacionGuardia.findFirst({
        where: { companyId: gemeseg.id, cedula: g.cedula, fechaFin: null },
      });
      if (!existingAsignacion) {
        await prisma.asignacionGuardia.create({
          data: {
            cedula: g.cedula,
            nombreGuardia: g.nombre,
            entidadId: entidad.id,
            fechaInicio: new Date('2026-01-15'),
            fechaFin: null,
            companyId: gemeseg.id,
            createdBy: admin.id,
          },
        });
      }
    }

    const existingFicha = await prisma.guardiaFichaPersonal.findFirst({ where: { companyId: gemeseg.id, cedula: g.cedula } });
    if (!existingFicha) {
      await prisma.guardiaFichaPersonal.create({
        data: {
          cedula: g.cedula,
          companyId: gemeseg.id,
          telefono: g.telefono,
          email: g.email,
          fechaNacimiento: new Date(g.fechaNacimiento),
          horario: 'Lunes a Viernes 08:00-17:00',
          puestoFormal: 'Guardia de Seguridad',
        },
      });
    }
  }
  console.log(`  ✓ ${guardiasData.length} guardias de prueba creados (3 entidades, 1 sin asignación)`);

  console.log('\n=== SEED MINIMO COMPLETADO ===');
  console.log(`Empresa: ${gemeseg.name} (${gemeseg.slug})`);
  console.log(`Usuarios: ${admin.email} / ${leidy.email}  (password: gemeseg2026)`);
  console.log(`Super admin: ${superAdmin.email}  (password: admin2026) — puede crear empresas nuevas y designar su administrador`);
  console.log(`Proyecto: ${project.name}`);
}

main()
  .catch((e) => {
    console.error('Error en seed minimo:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
