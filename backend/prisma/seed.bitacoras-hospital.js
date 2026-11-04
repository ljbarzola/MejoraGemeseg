// Datos de prueba para validar la hoja de bitácora del Hospital (turno diurno, 07:00 a 19:00,
// guardia Edison Toro, fecha escrita «24 de agosto» de 2026 o 2025: la letra no deja claro el
// año, por eso hay horarios para los dos). Usa la empresa del seed mínimo (npm run seed:minimal)
// y los códigos de turno D/N de seed.bitacoras.js (aquí se crean si faltan). Se puede correr
// varias veces: lo que ya existe no se duplica. Todo lleva «(prueba)» para reconocerlo y borrarlo.
//
//   node prisma/seed.bitacoras-hospital.js
//
// Qué probar subiendo la foto de la hoja (Contratación Pública → Bitácoras → Subir bitácora):
//  1. Puesto «Hospital (prueba)»: el horario del 24 de agosto dice Edison Toro de día (D,
//     07:00 a 19:00), igual que la hoja → debe salir CONFORME (o «A revisar» solo si el agente
//     lee mal algún nombre o una hora).
//  2. Puesto «Hospital - Emergencia (prueba)»: el mismo día el horario dice Brandon Lara y no
//     Edison → debe salir GUARDIA_DISTINTO («el horario decía Lara y la hoja trae a Toro»).
//  3. Cambiar en la lectura la fecha a un día fuera de los horarios (p. ej. 3 de marzo) → NO_HORARIO,
//     y a una fuera del contrato → FECHA_FUERA_DE_CONTRATO.
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

// Dos guardias por puesto que se turnan: el primero hace el día (D) en los días «pares» contando
// desde el 24 de agosto de cada año y el otro la noche (N); al día siguiente al revés.
const PUESTOS = [
  {
    nombre: 'Hospital (prueba)',
    guardias: [
      ['1700000021', 'Toro Edison'],
      ['1700000022', 'Godoy Carlos'],
    ],
  },
  {
    nombre: 'Hospital - Emergencia (prueba)',
    guardias: [
      ['1700000023', 'Lara Brandon'],
      ['1700000024', 'Cedeño Mario'],
    ],
  },
];

// Un horario aprobado por cada año posible de la hoja, con el 24 de agosto en medio.
const PERIODOS = [
  { desde: '2025-08-18', hasta: '2025-08-31', pivote: '2025-08-24' },
  { desde: '2026-08-17', hasta: '2026-08-30', pivote: '2026-08-24' },
];

async function main() {
  const empresa = await prisma.company.findFirst({ where: { slug: 'gemeseg' } });
  if (!empresa) throw new Error('No existe la empresa gemeseg: corre antes npm run seed:minimal');
  const sistemas = await prisma.user.findFirst({ where: { email: 'sistemas@gemeseg.com' } });
  const creador = sistemas || (await prisma.user.findFirst({ where: { companyId: empresa.id } }));
  const companyId = empresa.id;

  for (const c of [
    { codigo: 'D', nombre: 'Día', color: '#f6e05e', esDescanso: false, horaInicio: '07:00', horaFin: '19:00' },
    { codigo: 'N', nombre: 'Noche', color: '#90cdf4', esDescanso: false, horaInicio: '19:00', horaFin: '07:00' },
  ]) {
    await prisma.cPCodigoTurno.upsert({
      where: { companyId_codigo: { companyId, codigo: c.codigo } },
      update: { horaInicio: c.horaInicio, horaFin: c.horaFin },
      create: { companyId, ...c },
    });
  }

  const entidad =
    (await prisma.cPEntidadPublica.findFirst({ where: { companyId, nombre: 'Hospital de Ejemplo (prueba)' } })) ||
    (await prisma.cPEntidadPublica.create({
      data: { companyId, nombre: 'Hospital de Ejemplo (prueba)', ruc: '1760000000002', direccion: 'Av. Hospital 456' },
    }));

  const contrato =
    (await prisma.cPContrato.findFirst({ where: { companyId, numero: 'CTR-PRUEBA-HOSPITAL' } })) ||
    (await prisma.cPContrato.create({
      data: {
        companyId,
        entidadId: entidad.id,
        numero: 'CTR-PRUEBA-HOSPITAL',
        objeto: 'Servicio de guardianía del hospital (prueba)',
        fechaInicio: dia('2025-01-01'),
        fechaFin: dia('2026-12-31'),
        estado: 'ACTIVO',
        createdBy: creador.id,
      },
    }));

  const puestos = [];
  for (const d of PUESTOS) {
    const puesto =
      (await prisma.cPPuestoServicio.findFirst({ where: { companyId, contratoId: contrato.id, nombre: d.nombre } })) ||
      (await prisma.cPPuestoServicio.create({
        data: {
          companyId,
          contratoId: contrato.id,
          nombre: d.nombre,
          tipoTurno: '12H',
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
    puestos.push({ puesto, guardias: d.guardias });
  }

  for (const p of PERIODOS) {
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
          estado: 'APROBADO',
          createdBy: creador.id,
          enviadoAt: new Date(),
          aprobadoAt: new Date(),
        },
      });
    }
    const filas = [];
    for (const { puesto, guardias } of puestos) {
      for (const f of rango(p.desde, p.hasta)) {
        const n = Math.round((dia(f) - dia(p.pivote)) / 86400000);
        const primeroDeDia = ((n % 2) + 2) % 2 === 0;
        guardias.forEach(([cedula, nombreGuardia], g) => {
          const deDia = g === 0 ? primeroDeDia : !primeroDeDia;
          filas.push({
            horarioId: horario.id,
            puestoId: puesto.id,
            cedula,
            nombreGuardia,
            fecha: dia(f),
            codigoTurno: deDia ? 'D' : 'N',
          });
        });
      }
    }
    await prisma.cPHorarioCelda.createMany({ data: filas, skipDuplicates: true });
  }

  console.log(
    `Listo. Entidad ${entidad.id}, contrato ${contrato.id}, puestos ${puestos.map((x) => `${x.puesto.id} (${x.puesto.nombre})`).join(', ')}.`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
