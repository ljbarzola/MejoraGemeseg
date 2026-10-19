import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  SALES_AGREEMENT_DDL,
  SALES_CONTRACT_COLUMNS_DDL,
} from './sales-agreement.schema';
import { COTIZADOR_DDL } from './cotizador.schema';
import {
  SALES_OPPORTUNITY_COLUMNS_DDL,
  SALES_PIPELINE_BACKFILL,
  SALES_PIPELINE_DDL,
} from './sales-pipeline.schema';
import { SALES_CONTACT_DDL } from './sales-contact.schema';
import { SALES_AGREEMENT_INCIDENT_DDL } from './sales-agreement-incident.schema';
import { LANDINGS } from './lead-landing.util';
import {
  DEFAULT_STAGES,
  ETAPAS_FABRICA_ANTERIORES,
} from './ventas-etapas.const';
import {
  ETIQUETA_SUBSERVICIO,
  ensureDefaultServices,
} from './ventas-servicios.util';

// Número arbitrario y fijo: solo tiene que ser el mismo en todas las instancias
// para que, al arrancar varias de Cloud Run a la vez, una sola cree las tablas
// y las demás esperen.
const LOCK_ID = 7_190_207;

// Las empresas creadas antes de este instante conservan la tabla de landings de Gemeseg
// que ya usaban (ver sembrarLandingsDeEmpresasExistentes); las posteriores empiezan vacías.
const CORTE_LANDINGS_POR_EMPRESA = '2026-10-17T00:00:00Z';

/**
 * Arranque ordenado del esquema de Ventas.
 *
 * El despliegue no corre migraciones, así que las tablas de contratos
 * comerciales y del embudo (leads, oportunidades, motivos) se crean aquí, en
 * este orden y dentro de UNA transacción con un candado de Postgres. Si algo
 * falla se deshace todo y el servicio arranca igual (`ready` queda en false);
 * los flujos que dependen de las tablas nuevas caen entonces a su comportamiento
 * de antes.
 *
 * PENDIENTE anotado (2026-10-07): una pantalla/chequeo de salud que avise
 * cuando `ready` es false. Por ahora solo queda un error en el log de Cloud Run:
 * hay que mirarlo después de cada despliegue.
 */
@Injectable()
export class VentasSchemaService implements OnModuleInit {
  private readonly logger = new Logger(VentasSchemaService.name);
  private listo = false;

  constructor(private readonly prisma: PrismaService) {}

  isReady(): boolean {
    return this.listo;
  }

  async onModuleInit() {
    await this.agregarColumnasNuevas();
    try {
      await this.prisma.$transaction(
        async (tx) => {
          // El candado devuelve `void`, que Prisma no sabe leer: se envuelve para devolver un número.
          await tx.$queryRawUnsafe(
            `SELECT 1 AS ok FROM (SELECT pg_advisory_xact_lock(${LOCK_ID})) AS candado`,
          );
          for (const sql of [
            ...SALES_AGREEMENT_DDL,
            ...SALES_PIPELINE_DDL,
            ...SALES_PIPELINE_BACKFILL,
            ...SALES_CONTACT_DDL,
            ...SALES_AGREEMENT_INCIDENT_DDL,
            ...COTIZADOR_DDL,
          ]) {
            await tx.$executeRawUnsafe(sql);
          }
        },
        { timeout: 120_000, maxWait: 60_000 },
      );
      await this.mapearServiciosMigrados();
      await this.actualizarEtapasDeFabrica();
      await this.sembrarLandingsDeEmpresasExistentes();
      this.listo = true;
    } catch (err) {
      this.logger.error(
        `No se pudo preparar el esquema de Ventas (contratos y embudo): ${(err as Error).message}`,
      );
    }
  }

  // Columnas nuevas de tablas que ya existen (tipo de documento de Documentación y el contrato que
  // renueva una oportunidad). Aparte del resto del esquema: si otra sentencia falla y deshace la
  // transacción grande, estas columnas igual quedan, porque Prisma las pide en cada consulta a
  // "SalesContract" y "SalesOpportunity". Cada lista va en su propia transacción: en una base nueva
  // la tabla de oportunidades aún no existe y su ALTER fallaría (se crea con la transacción grande).
  private async agregarColumnasNuevas() {
    const listas: { nombre: string; sentencias: string[] }[] = [
      { nombre: 'SalesContract (tipo de documento)', sentencias: SALES_CONTRACT_COLUMNS_DDL },
      { nombre: 'SalesOpportunity (renovaciones)', sentencias: SALES_OPPORTUNITY_COLUMNS_DDL },
    ];
    for (const { nombre, sentencias } of listas) {
      try {
        await this.prisma.$transaction(
          async (tx) => {
            await tx.$queryRawUnsafe(
              `SELECT 1 AS ok FROM (SELECT pg_advisory_xact_lock(${LOCK_ID})) AS candado`,
            );
            for (const sql of sentencias) {
              await tx.$executeRawUnsafe(sql);
            }
          },
          { timeout: 60_000, maxWait: 60_000 },
        );
      } catch (err) {
        this.logger.error(
          `No se pudieron agregar las columnas nuevas de ${nombre}: ${(err as Error).message}`,
        );
      }
    }
  }

  // 2026-10-16 (línea blanca): antes, una empresa sin tabla de landings propia usaba la de
  // Gemeseg. Ahora cada empresa tiene la suya y una nueva empieza vacía; para no cambiar
  // nada a quien ya usaba Ventas, a cada empresa que (1) existía antes de esta fecha, (2)
  // ya tiene leads, clientes o claves de conexión y (3) no guardó una tabla propia, se le
  // copia la de Gemeseg a su propia configuración. Solo agrega filas (nunca pisa ni
  // borra) y es idempotente: con la fila creada, o si una empresa la vacía a propósito
  // (guardar sin landings crea la fila igual), no vuelve a copiar. Las empresas creadas
  // después de la fecha de corte nunca la reciben.
  private async sembrarLandingsDeEmpresasExistentes() {
    try {
      const empresas = await this.prisma.$queryRawUnsafe<{ id: number }[]>(`
        SELECT c."id" FROM "Company" c
        WHERE c."createdAt" < '${CORTE_LANDINGS_POR_EMPRESA}'
          AND NOT EXISTS (
            SELECT 1 FROM "SalesSetting" s WHERE s."companyId" = c."id" AND s."key" = 'landings')
          AND (
            EXISTS (SELECT 1 FROM "SalesLead" l WHERE l."companyId" = c."id")
            OR EXISTS (SELECT 1 FROM "SalesClient" x WHERE x."companyId" = c."id")
            OR EXISTS (SELECT 1 FROM "SalesApiKey" k WHERE k."companyId" = c."id")
          )`);
      if (empresas.length === 0) return;
      await this.prisma.salesSetting.createMany({
        data: empresas.map((e) => ({
          companyId: e.id,
          key: 'landings',
          value: { landings: LANDINGS } as unknown as Prisma.InputJsonValue,
        })),
        skipDuplicates: true,
      });
      this.logger.log(
        `Landings de Gemeseg copiadas a ${empresas.length} empresa(s) que ya usaban Ventas.`,
      );
    } catch (err) {
      this.logger.warn(
        `No se pudieron copiar las landings a las empresas existentes: ${(err as Error).message}`,
      );
    }
  }

  // 2026-10-08: las etapas de fábrica cambiaron de nombre (Recibido -> Nueva,
  // Leído -> En evaluación, Cotizado -> Cotizada, Aceptado -> Aceptada,
  // Rechazado -> Perdida) y se sumó «En negociación». Solo se actualiza una
  // empresa que todavía tiene EXACTAMENTE las cinco etapas de fábrica con sus
  // nombres originales: si alguien ya las renombró o agregó otras, se respeta.
  // Idempotente: con NEGOCIACION ya creada no hace nada.
  private async actualizarEtapasDeFabrica() {
    try {
      const etapas = await this.prisma.salesClientStage.findMany({
        select: { companyId: true, key: true, label: true },
      });
      const porEmpresa = new Map<number, { key: string; label: string }[]>();
      for (const e of etapas) {
        porEmpresa.set(e.companyId, [...(porEmpresa.get(e.companyId) ?? []), e]);
      }
      const claves = Object.keys(ETAPAS_FABRICA_ANTERIORES);
      for (const [companyId, lista] of porEmpresa) {
        const intacta =
          lista.length === claves.length &&
          lista.every((e) => ETAPAS_FABRICA_ANTERIORES[e.key] === e.label);
        if (!intacta) continue;
        await this.prisma.$transaction(async (tx) => {
          for (const d of DEFAULT_STAGES) {
            if (d.key === 'NEGOCIACION') {
              await tx.salesClientStage.create({
                data: { companyId, ...d },
              });
            } else {
              await tx.salesClientStage.update({
                where: { companyId_key: { companyId, key: d.key } },
                data: { label: d.label, order: d.order },
              });
            }
          }
        });
      }
    } catch (err) {
      this.logger.warn(
        `No se pudieron actualizar las etapas de fábrica de Ventas: ${(err as Error).message}`,
      );
    }
  }

  // Las oportunidades migradas nacen sin servicios: se deducen de las
  // casillas "Sub-servicios" que el cliente ya tenía guardadas en `extra`
  // (clave `servicio_requerido__sub`, valores separados por coma). Idempotente:
  // solo toca oportunidades sin ningún servicio. Un fallo aquí no impide
  // arrancar, solo deja esas oportunidades sin servicio.
  private async mapearServiciosMigrados() {
    try {
      const pendientes = await this.prisma.salesOpportunity.findMany({
        where: { originType: 'MIGRADA', services: { none: {} } },
        select: {
          id: true,
          companyId: true,
          salesClient: { select: { extra: true } },
        },
      });
      const conSubs = pendientes.filter((o) => {
        const extra = (o.salesClient.extra ?? {}) as Record<string, string>;
        return !!extra['servicio_requerido__sub'];
      });
      const porEmpresa = new Map<number, typeof conSubs>();
      for (const o of conSubs) {
        porEmpresa.set(o.companyId, [...(porEmpresa.get(o.companyId) ?? []), o]);
      }
      for (const [companyId, opps] of porEmpresa) {
        await ensureDefaultServices(this.prisma, companyId);
        const servicios = await this.prisma.salesService.findMany({
          where: { companyId },
          select: { id: true, name: true },
        });
        const idPorNombre = new Map(servicios.map((s) => [s.name, s.id]));
        const filas: { opportunityId: number; serviceId: number }[] = [];
        for (const o of opps) {
          const extra = (o.salesClient.extra ?? {}) as Record<string, string>;
          const claves = extra['servicio_requerido__sub']
            .split(',')
            .map((k) => k.trim())
            .filter(Boolean);
          for (const clave of claves) {
            const id = idPorNombre.get(ETIQUETA_SUBSERVICIO[clave] ?? '');
            if (id) filas.push({ opportunityId: o.id, serviceId: id });
          }
        }
        if (filas.length) {
          await this.prisma.salesOpportunityService.createMany({
            data: filas,
            skipDuplicates: true,
          });
        }
      }
    } catch (err) {
      this.logger.warn(
        `No se pudieron mapear los servicios de las oportunidades migradas: ${(err as Error).message}`,
      );
    }
  }
}
