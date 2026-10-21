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

// «Servicio requerido» de la ficha (extra.servicio_requerido y su lista de sub-servicios
// extra.servicio_requerido__sub) a partir de los servicios elegidos al pasar un posible cliente a
// oportunidad. Se escriben las claves y no se importa el servicio de clientes (importaría este archivo
// de vuelta). Solo reconoce los servicios del catálogo de fábrica; uno propio de la empresa no tiene
// clave en esa lista y queda solo en la oportunidad. Si los servicios son de varias categorías gana la que
// tiene más (la ficha guarda una sola). Vacío si ninguno se reconoce.
export function extraServicioRequerido(nombres: string[]): Record<string, string> {
  const porCategoria = new Map<string, string[]>();
  for (const nombre of nombres) {
    const buscado = nombre.trim().toLowerCase();
    for (const [categoria, subs] of Object.entries(DEFAULT_SUBSERVICIOS)) {
      const sub = subs.find((s) => s.label.toLowerCase() === buscado);
      if (sub) {
        porCategoria.set(categoria, [...(porCategoria.get(categoria) ?? []), sub.key]);
        break;
      }
    }
  }
  if (porCategoria.size === 0) return {};
  const [categoria, claves] = [...porCategoria.entries()].sort((a, b) => b[1].length - a[1].length)[0];
  return {
    servicio_requerido: categoria,
    servicio_requerido__sub: [...new Set(claves)].join(','),
  };
}

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
