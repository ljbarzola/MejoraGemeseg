// Datos de prueba para recorrer Bitácoras (Contratación Pública → Operaciones) en local:
// una entidad de ejemplo con un contrato vigente, dos puestos con sus guardias, los
// códigos de turno con su horario y un horario aprobado (y otro en borrador) con la
// rotación 2 días / 2 noches / 2 libres. Usa la empresa y los usuarios del seed mínimo
// (npm run seed:minimal) — correrlo primero. Se puede correr varias veces: lo que ya
// existe no se duplica. Todo lleva «(prueba)» en el nombre para reconocerlo y borrarlo.
//
//   node prisma/seed.bitacoras.js
//
// Las bitácoras de ejemplo (leídas) se crean desde la propia aplicación, no aquí: así
// pasan por la comparación real contra el horario.
require('dotenv/config');
const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');

const DATABASE_URL =
  process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/gemeseg?schema=public';
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: DATABASE_URL }) });

const dia = (iso) => new Date(`${iso}T00:00:00.000Z`);
const sumarDias = (iso, n) => new Date(dia(iso).getTime() + n * 86400000).toISOString().slice(0, 10);
const rango = (desde, hasta) => {
  const out = [];
  for (let f = desde; f <= hasta; f = sumarDias(f, 1)) out.push(f);
  return out;
};

async function main() {
  const empresa = await prisma.company.findFirst({ where: { slug: 'gemeseg' } });
  if (!empresa) throw new Error('No existe la empresa gemeseg: corre antes npm run seed:minimal');
  const sistemas = await prisma.user.findFirst({ where: { email: 'sistemas@gemeseg.com' } });
  const creador = sistemas || (await prisma.user.findFirst({ where: { companyId: empresa.id } }));
  const companyId = empresa.id;

  // Códigos de turno con horario (la pantalla de Horarios los usa tal cual).
  const codigos = [
    { codigo: 'D', nombre: 'Día', color: '#f6e05e', esDescanso: false, horaInicio: '07:00', horaFin: '19:00' },
    { codigo: 'N', nombre: 'Noche', color: '#90cdf4', esDescanso: false, horaInicio: '19:00', horaFin: '07:00' },
    { codigo: 'L', nombre: 'Libre', color: '#e2e8f0', esDescanso: true, horaInicio: null, horaFin: null },
    { codigo: 'M', nombre: 'Mañana', color: '#fbd38d', esDescanso: false, horaInicio: '07:00', horaFin: '15:00' },
    { codigo: 'T', nombre: 'Tarde', color: '#b794f4', esDescanso: false, horaInicio: '15:00', horaFin: '23:00' },
  ];
  for (const c of codigos) {
    await prisma.cPCodigoTurno.upsert({
      where: { companyId_codigo: { companyId, codigo: c.codigo } },
      update: { horaInicio: c.horaInicio, horaFin: c.horaFin },
      create: { companyId, ...c },
    });
  }

  const entidad =
    (await prisma.cPEntidadPublica.findFirst({ where: { companyId, nombre: 'Municipio de Ejemplo (prueba)' } })) ||
    (await prisma.cPEntidadPublica.create({
      data: { companyId, nombre: 'Municipio de Ejemplo (prueba)', ruc: '1760000000001', direccion: 'Av. Principal 123' },
    }));

  const contrato =
    (await prisma.cPContrato.findFirst({ where: { companyId, numero: 'CTR-PRUEBA-001' } })) ||
    (await prisma.cPContrato.create({
      data: {
        companyId,
        entidadId: entidad.id,
        numero: 'CTR-PRUEBA-001',
        objeto: 'Servicio de guardianía (prueba)',
        fechaInicio: dia('2026-01-01'),
        fechaFin: dia('2026-12-31'),
        estado: 'ACTIVO',
        createdBy: creador.id,
      },
    }));

  const definicion = [
    {
      nombre: 'Garita norte',
      tipoTurno: '12H',
      guardias: [
        ['1700000011', 'Pérez Mora Juan Carlos'],
        ['1700000012', 'Gómez Ruiz Pedro'],
        ['1700000013', 'Salazar Vera Ana'],
      ],
      ciclo: ['D', 'D', 'N', 'N', 'L', 'L'],
    },
    {
      nombre: 'Recepción',
      tipoTurno: '8H',
      guardias: [
        ['1700000014', 'López Vera Marta'],
        ['1700000015', 'Cedeño Ruiz Luis'],
      ],
      ciclo: ['M', 'M', 'M', 'T', 'T', 'T'],
    },
  ];

  const puestos = [];
  for (const d of definicion) {
    const puesto =
      (await prisma.cPPuestoServicio.findFirst({ where: { companyId, contratoId: contrato.id, nombre: d.nombre } })) ||
      (await prisma.cPPuestoServicio.create({
        data: {
          companyId,
          contratoId: contrato.id,
          nombre: d.nombre,
          tipoTurno: d.tipoTurno,
          cantidadGuardias: d.guardias.length,
          guardiasSimultaneosRequeridos: 1,
        },
      }));
    for (const [cedula, nombreGuardia] of d.guardias) {
      await prisma.cPPuestoGuardia.upsert({
        where: { puestoId_cedula: { puestoId: puesto.id, cedula } },
        update: { nombreGuardia },
        create: { puestoId: puesto.id, cedula, nombreGuardia },
      });
    }
    puestos.push({ puesto, ...d });
  }

  // Dos horarios seguidos (sin solaparse): uno aprobado y otro en borrador.
  const periodos = [
    { desde: '2026-09-14', hasta: '2026-10-18', estado: 'APROBADO' },
    { desde: '2026-10-19', hasta: '2026-11-15', estado: 'BORRADOR' },
  ];
  const origen = '2026-09-14';
  for (const p of periodos) {
    let horario = await prisma.cPHorarioMensual.findFirst({
      where: { companyId, contratoId: contrato.id, fechaInicio: dia(p.desde) },
    });
    if (!horario) {
      horario = await prisma.cPHorarioMensual.create({
        data: {
          companyId,
          contratoId: contrato.id,
          anio: Number(p.desde.slice(0, 4)),
          mes: Number(p.desde.slice(5, 7)),
          fechaInicio: dia(p.desde),
          fechaFin: dia(p.hasta),
          estado: p.estado,
          createdBy: creador.id,
          ...(p.estado === 'APROBADO' ? { enviadoAt: new Date(), aprobadoAt: new Date() } : {}),
        },
      });
    }
    for (const { puesto, guardias, ciclo } of puestos) {
      // Cada guardia arranca desfasado 2 días (la misma rotación de la documentación).
      const largo = ciclo.length;
      const paso = largo / guardias.length;
      const filas = [];
      guardias.forEach(([cedula, nombreGuardia], g) => {
        for (const f of rango(p.desde, p.hasta)) {
          const n = Math.round((dia(f) - dia(origen)) / 86400000);
          const idx = (((n + (largo - paso * g)) % largo) + largo) % largo;
          filas.push({
            horarioId: horario.id,
            puestoId: puesto.id,
            cedula,
            nombreGuardia,
            fecha: dia(f),
            codigoTurno: ciclo[idx],
          });
        }
      });
      await prisma.cPHorarioCelda.createMany({ data: filas, skipDuplicates: true });
    }
  }

  console.log(`Listo. Entidad ${entidad.id}, contrato ${contrato.id}, puestos ${puestos.map((p) => p.puesto.id).join(', ')}.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
