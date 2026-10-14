import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { DEFAULT_SUBSERVICIOS } from './ventas-subservicios.const';

// Categoría de cada sub-servicio, usada como descripción del servicio en el
// catálogo la primera vez que se siembra.
const CATEGORIA_LABEL: Record<string, string> = {
  SEGURIDAD_FISICA: 'Seguridad Física',
  MONITOREO: 'Monitoreo',
  SOLUCIONES_TECNOLOGICAS: 'Soluciones Tecnológicas',
};

// Etiqueta de un sub-servicio a partir de su clave estable
// (p. ej. AGENTES_DE_SEGURIDAD -> "Agentes de Seguridad").
export const ETIQUETA_SUBSERVICIO: Record<string, string> = Object.fromEntries(
  Object.values(DEFAULT_SUBSERVICIOS)
    .flat()
    .map((s) => [s.key, s.label]),
);

// Siembra el catálogo de servicios de una empresa la primera vez que hace
// falta: los sub-servicios que ya existían como opciones de "Servicio
// requerido" del cliente. Solo si la empresa no tiene ninguno todavía.
export async function ensureDefaultServices(
  prisma: PrismaService,
  companyId: number,
): Promise<void> {
  const total = await prisma.salesService.count({ where: { companyId } });
  if (total > 0) return;
  const data: Prisma.SalesServiceCreateManyInput[] = [];
  let order = 0;
  for (const [cat, subs] of Object.entries(DEFAULT_SUBSERVICIOS)) {
    for (const s of subs) {
      data.push({
        companyId,
        name: s.label,
        description: CATEGORIA_LABEL[cat] ?? null,
        order: order++,
      });
    }
  }
  await prisma.salesService.createMany({ data, skipDuplicates: true });
}
