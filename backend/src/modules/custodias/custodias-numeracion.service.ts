import { BadRequestException, Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

/** Candado (único para todo el sistema) que evita que dos viajes nuevos reciban el mismo número de guía. */
const CANDADO_NUMERACION = 7420241124;
const DIGITOS_MINIMOS = 4;
const PREFIJO_POR_OMISION = 'GUI';

type Cliente = Prisma.TransactionClient | PrismaService;

export function esErrorDeDuplicado(err: unknown): boolean {
  return (err as { code?: string } | null)?.code === 'P2002';
}

/** Prefijo de la empresa si no guardó uno: las 3 primeras letras de su nombre, en mayúsculas y sin tildes (GEMESEG → GEM). */
export function prefijoPorDefecto(nombreEmpresa: string | null | undefined): string {
  const letras = (nombreEmpresa ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z]/g, '');
  return letras.length >= 2 ? letras.slice(0, 3) : PREFIJO_POR_OMISION;
}

export function formatearGuia(prefijo: string, numero: number): string {
  return `${prefijo}-${String(numero).padStart(DIGITOS_MINIMOS, '0')}`;
}

/**
 * Número de guía automático (2026-11-24): `<PREFIJO>-0001`. El siguiente es el mayor número que ya exista con ese
 * prefijo (en cualquier empresa, porque el número de guía es único en todo el sistema) más uno. Las guías viejas
 * conservan su número y nunca se cambia el de un viaje ya guardado.
 */
@Injectable()
export class CustodiasNumeracionService {
  constructor(private readonly prisma: PrismaService) {}

  private exigirEmpresa(companyId: number | null | undefined): number {
    if (!companyId) throw new BadRequestException('Esta función es solo para usuarios de una empresa.');
    return companyId;
  }

  private async prefijoDe(db: Cliente, companyId: number): Promise<string> {
    const guardado = await db.$queryRaw<{ prefijo: string }[]>`
      SELECT "prefijo" FROM "CustodiaNumeracion" WHERE "companyId" = ${companyId}`;
    if (guardado[0]?.prefijo) return guardado[0].prefijo;
    const empresa = await db.company.findUnique({ where: { id: companyId }, select: { name: true } });
    return prefijoPorDefecto(empresa?.name);
  }

  private async siguienteNumero(db: Cliente, prefijo: string): Promise<number> {
    // El prefijo es solo letras A–Z (se valida al guardarlo), así que es seguro dentro de la expresión regular.
    const patron = `^${prefijo}-[0-9]{1,15}$`;
    const filas = await db.$queryRaw<{ maximo: bigint | number | null }[]>`
      SELECT MAX(substring("numeroGuia" from '[0-9]+$')::bigint) AS "maximo"
      FROM "Custodia" WHERE "numeroGuia" ~ ${patron}`;
    return Number(filas[0]?.maximo ?? 0) + 1;
  }

  /** El prefijo y el número que tendrá la próxima guía (solo vista previa: el número real se asigna al guardar). */
  async obtener(companyIdCrudo: number | null | undefined) {
    const companyId = this.exigirEmpresa(companyIdCrudo);
    const prefijo = await this.prefijoDe(this.prisma, companyId);
    return { prefijo, siguiente: formatearGuia(prefijo, await this.siguienteNumero(this.prisma, prefijo)) };
  }

  async guardarPrefijo(companyIdCrudo: number | null | undefined, crudo: unknown) {
    const companyId = this.exigirEmpresa(companyIdCrudo);
    const prefijo = typeof crudo === 'string' ? crudo.trim().toUpperCase() : '';
    if (!/^[A-Z]{2,6}$/.test(prefijo)) {
      throw new BadRequestException('El prefijo debe tener de 2 a 6 letras, sin números, espacios ni tildes.');
    }
    await this.prisma.$executeRaw`
      INSERT INTO "CustodiaNumeracion" ("companyId", "prefijo") VALUES (${companyId}, ${prefijo})
      ON CONFLICT ("companyId") DO UPDATE SET "prefijo" = EXCLUDED."prefijo", "actualizadoEn" = now()`;
    return this.obtener(companyId);
  }

  /**
   * Corre `crear` con el número de guía ya asignado, dentro de una transacción con candado: dos viajes guardados al
   * mismo tiempo nunca reciben el mismo número. Si aun así chocara con uno existente, se reintenta una vez.
   */
  async crearConNumero<T>(companyId: number, crear: (tx: Prisma.TransactionClient, numeroGuia: string) => Promise<T>): Promise<T> {
    for (let intento = 0; ; intento++) {
      try {
        return await this.prisma.$transaction(
          async (tx) => {
            // El candado devuelve `void`, que Prisma no sabe leer: se envuelve para devolver un número.
            await tx.$queryRawUnsafe(
              `SELECT 1 AS ok FROM (SELECT pg_advisory_xact_lock(${CANDADO_NUMERACION})) AS candado`,
            );
            const prefijo = await this.prefijoDe(tx, companyId);
            const numero = await this.siguienteNumero(tx, prefijo);
            return crear(tx, formatearGuia(prefijo, numero));
          },
          { timeout: 15_000, maxWait: 15_000 },
        );
      } catch (err) {
        if (intento === 0 && esErrorDeDuplicado(err)) continue;
        throw err;
      }
    }
  }
}
