require('dotenv/config');
const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');

// Uno solo: renombra el agente global ya sembrado de 'Agente GEMESEG' a
// 'Agente Gemeseg' y lo marca isDefault:true, EN VEZ de crear uno nuevo — así
// las conversaciones/UserAgent que ya apuntan a su id (inmutable) no se
// pierden. Correr una vez por entorno (local, luego Cloud SQL) después de
// aplicar la migración que agrega Agent.isDefault. Seguro de correr más de
// una vez: si ya no encuentra el nombre viejo, no hace nada.
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

async function main() {
  const existing = await prisma.agent.findFirst({
    where: { createdBy: null, name: 'Agente GEMESEG' },
  });

  if (existing) {
    await prisma.agent.update({
      where: { id: existing.id },
      data: { name: 'Agente Gemeseg', isDefault: true },
    });
    console.log(`Renombrado: Agent#${existing.id} 'Agente GEMESEG' -> 'Agente Gemeseg' (isDefault: true).`);
    return;
  }

  const alreadyRenamed = await prisma.agent.findFirst({
    where: { createdBy: null, name: 'Agente Gemeseg' },
  });
  if (alreadyRenamed) {
    if (!alreadyRenamed.isDefault) {
      await prisma.agent.update({
        where: { id: alreadyRenamed.id },
        data: { isDefault: true },
      });
      console.log(`Agent#${alreadyRenamed.id} ya se llamaba 'Agente Gemeseg' — marcado isDefault: true.`);
    } else {
      console.log('Nada que hacer: ya está renombrado y marcado isDefault.');
    }
    return;
  }

  console.log(
    "No se encontró ningún agente global llamado 'Agente GEMESEG' ni 'Agente Gemeseg' en esta base. " +
      'Si es una base recién sembrada con el seed.js actualizado, ya se creó correctamente desde el inicio.',
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
