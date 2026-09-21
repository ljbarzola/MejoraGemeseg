/**
 * Script para crear tickets de prueba en la tabla TicketSoporte.
 * Ejecutar: npx ts-node prisma/seed-tickets.ts
 */
import 'dotenv/config';
import { PrismaClient, TicketSoporteTipo, TicketSoporteEstado } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

const TICKETS: {
  tipo: TicketSoporteTipo;
  titulo: string;
  descripcion: string;
  estado: TicketSoporteEstado;
}[] = [
  {
    tipo: 'ERROR',
    titulo: 'No puedo exportar el reporte de cumplimiento',
    descripcion: 'Cuando hago clic en "Exportar PDF" en la página de Cumplimiento, la página se queda en blanco y nunca descarga el archivo. Ocurre en Chrome y Firefox.',
    estado: 'ABIERTO',
  },
  {
    tipo: 'MEJORA',
    titulo: 'Solicitar filtro por fecha en la lista de guardias',
    descripcion: 'Sería útil poder filtrar la lista de guardias por rango de fechas de ingreso. Actualmente solo se puede buscar por nombre o cédula.',
    estado: 'EN_REVISION',
  },
  {
    tipo: 'ERROR',
    titulo: 'Error 500 al subir capacitación',
    descripcion: 'Al intentar subir un archivo PDF en Capacitaciones, sale "Error interno del servidor". El archivo pesa menos de 5MB.',
    estado: 'RESUELTO',
  },
  {
    tipo: 'PERMISO',
    titulo: 'Acceso al módulo de Custodias',
    descripcion: 'Necesito acceso al módulo de Custodias para revisar las operaciones pendientes. Mi usuario es operador1@gemeseg.com.',
    estado: 'ABIERTO',
  },
  {
    tipo: 'OTRO',
    titulo: 'Configurar correo de notificaciones',
    descripcion: 'Quisiera saber cómo configurar el correo para que se envíen las notificaciones de vencimiento de documentos a los guardias.',
    estado: 'EN_REVISION',
  },
  {
    tipo: 'ERROR',
    titulo: 'El gráfico del Dashboard de Ventas no carga',
    descripcion: 'El gráfico de barras del Dashboard de Ventas muestra "Error al cargar datos" desde hace dos días. Los demás widgets funcionan bien.',
    estado: 'ABIERTO',
  },
];

async function main() {
  console.log('Creando tickets de prueba...');

  // Buscar el primer usuario disponible
  const user = await prisma.user.findFirst();
  if (!user) {
    console.error('No hay usuarios en la base de datos. Crea un usuario primero.');
    process.exit(1);
  }

  const company = user.companyId
    ? await prisma.company.findUnique({ where: { id: user.companyId } })
    : null;

  for (const ticket of TICKETS) {
    const created = await prisma.ticketSoporte.create({
      data: {
        companyId: user.companyId,
        createdById: user.id,
        tipo: ticket.tipo,
        titulo: ticket.titulo,
        descripcion: ticket.descripcion,
        estado: ticket.estado,
        resueltoAt: ticket.estado === 'RESUELTO' ? new Date() : null,
      },
    });
    console.log(`  Ticket #${created.id} [${ticket.estado}] ${ticket.titulo}`);
  }

  console.log(`\n${TICKETS.length} tickets creados para ${company?.name || 'usuario sin empresa'} (${user.email}).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
