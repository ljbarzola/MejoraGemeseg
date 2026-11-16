import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { hoyEcuador } from './agreement-status.util';
import {
  TIPOS_META,
  avanceVacio,
  buscarMeta,
  calcularAvances,
  cumplimiento,
  resolverPeriodo,
  vendedorDelAlcance,
  type AvanceTipos,
  type Cumplimiento,
  type FilaMeta,
  type PistaPeriodo,
  type TipoMeta,
} from './ventas-metas.util';

const HORAS_ECUADOR_MS = 5 * 60 * 60 * 1000;
const DIA_MS = 24 * 60 * 60 * 1000;
const MESES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

const esDia = (s?: string): s is string => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00.000Z`));
const aDia = (d: Date) => d.toISOString().slice(0, 10);
const diaEc = (d: Date) => aDia(new Date(d.getTime() - HORAS_ECUADOR_MS));

export interface GuardarMetasDto {
  periodKind: 'MES' | 'ANIO';
  year: number;
  month?: number;
  /** target null o vacío borra la meta. userId null = meta global de la empresa. */
  metas: { userId: number | null; kind: TipoMeta; target: number | null }[];
}

type TarjetasMeta = Record<TipoMeta, Cumplimiento>;

@Injectable()
export class VentasMetasService {
  private readonly logger = new Logger(VentasMetasService.name);

  constructor(private readonly prisma: PrismaService) {}

  private requireCompany(companyId: number | null): number {
    if (!companyId) throw new BadRequestException('Se requiere una empresa');
    return companyId;
  }

  /**
   * Personas a las que se les puede fijar meta: las que tienen acceso a Ventas (activas y sin el módulo negado),
   * más quienes ya llevan oportunidades aunque hoy no tengan acceso. Misma regla de «Cifras de» del Dashboard.
   */
  private async vendedores(companyId: number): Promise<{ id: number; nombre: string }[]> {
    const [conOportunidades, conAcceso] = await Promise.all([
      this.prisma.salesOpportunity.groupBy({
        by: ['assignedUserId'],
        where: { companyId, assignedUserId: { not: null } },
      }),
      this.prisma.user.findMany({
        where: { companyId, isActive: true, NOT: { permissions: { some: { section: 'VENTAS', canView: false } } } },
        select: { id: true },
      }),
    ]);
    const ids = [...new Set([...conOportunidades.map((o) => o.assignedUserId!), ...conAcceso.map((u) => u.id)])];
    const usuarios = await this.prisma.user.findMany({
      where: { id: { in: ids }, companyId },
      select: { id: true, fullName: true },
      orderBy: { fullName: 'asc' },
    });
    return usuarios.map((u) => ({ id: u.id, nombre: u.fullName }));
  }

  private async filasDelPeriodo(
    companyId: number,
    periodKind: 'MES' | 'ANIO',
    year: number,
    month: number,
  ): Promise<FilaMeta[]> {
    const filas = await this.prisma.$queryRaw<
      { userId: number | null; kind: string; periodKind: string; year: number; month: number; target: unknown }[]
    >`SELECT "userId", "kind", "periodKind", "year", "month", "target"
        FROM "SalesMeta"
       WHERE "companyId" = ${companyId} AND "periodKind" = ${periodKind}
         AND "year" = ${year} AND "month" = ${month}`;
    return filas
      .filter((f) => (TIPOS_META as readonly string[]).includes(f.kind))
      .map((f) => ({
        userId: f.userId,
        kind: f.kind as TipoMeta,
        periodKind,
        year: f.year,
        month: f.month,
        target: Number(f.target),
      }));
  }

  // -------------------------------------------------------------------------
  // Fijar metas (Configuración → Metas)
  // -------------------------------------------------------------------------

  /**
   * Lo que ya está fijado para un mes o un año, y las personas a las que se les puede fijar meta. Gerencia y
   * administradores ven todo; un vendedor solo ve la meta de la empresa y la suya (nunca la de sus compañeros).
   */
  async listar(
    companyId: number | null,
    periodKind: string,
    year: number,
    month?: number,
    quien?: { userId: number; role: string },
  ) {
    const cid = this.requireCompany(companyId);
    const { pk, y, m } = this.validarPeriodo(periodKind, year, month);
    const [vendedores, filas] = await Promise.all([this.vendedores(cid), this.filasDelPeriodo(cid, pk, y, m)]);
    const privilegiado = !quien || quien.role === 'ADMIN' || quien.role === 'MANAGER';
    return {
      periodKind: pk,
      year: y,
      month: m,
      editable: privilegiado,
      vendedores: privilegiado ? vendedores : vendedores.filter((v) => v.id === quien!.userId),
      metas: filas
        .filter((f) => privilegiado || f.userId === null || f.userId === quien!.userId)
        .map((f) => ({ userId: f.userId, kind: f.kind, target: f.target })),
    };
  }

  /** Guarda o borra, de una vez, las metas de un mes o de un año. Todo o nada. */
  async guardar(companyId: number | null, actorId: number, dto: GuardarMetasDto) {
    const cid = this.requireCompany(companyId);
    const { pk, y, m } = this.validarPeriodo(dto.periodKind, dto.year, dto.month);
    if (!Array.isArray(dto.metas) || dto.metas.length === 0) {
      throw new BadRequestException('No hay metas para guardar.');
    }
    if (dto.metas.length > 500) throw new BadRequestException('Son demasiadas metas a la vez.');

    const vistos = new Set<string>();
    for (const x of dto.metas) {
      if (!(TIPOS_META as readonly string[]).includes(x.kind)) throw new BadRequestException('Tipo de meta no válido.');
      if (x.userId !== null && !Number.isInteger(x.userId)) throw new BadRequestException('Persona no válida.');
      if (x.target !== null && x.target !== undefined) {
        const t = Number(x.target);
        if (!Number.isFinite(t) || t < 0 || t > 999_999_999) {
          throw new BadRequestException('Las metas deben ser números de 0 en adelante.');
        }
      }
      const llave = `${x.userId ?? 0}|${x.kind}`;
      if (vistos.has(llave)) throw new BadRequestException('Hay una meta repetida.');
      vistos.add(llave);
    }

    // Solo personas de la misma empresa.
    const ids = [...new Set(dto.metas.map((x) => x.userId).filter((v): v is number => v !== null))];
    if (ids.length) {
      const validos = await this.prisma.user.count({ where: { id: { in: ids }, companyId: cid } });
      if (validos !== ids.length) throw new BadRequestException('Alguna de las personas no es de esta empresa.');
    }

    try {
      await this.prisma.$transaction(async (tx) => {
        for (const x of dto.metas) {
          const uid = x.userId ?? null;
          if (x.target === null || x.target === undefined || (x.target as unknown) === '') {
            await tx.$executeRaw`DELETE FROM "SalesMeta"
               WHERE "companyId" = ${cid} AND COALESCE("userId", 0) = ${uid ?? 0} AND "kind" = ${x.kind}
                 AND "periodKind" = ${pk} AND "year" = ${y} AND "month" = ${m}`;
            continue;
          }
          const target = Math.round(Number(x.target) * 100) / 100;
          await tx.$executeRaw`INSERT INTO "SalesMeta"
               ("companyId", "userId", "kind", "periodKind", "year", "month", "target", "createdBy", "updatedBy")
             VALUES (${cid}, ${uid}, ${x.kind}, ${pk}, ${y}, ${m}, ${target}, ${actorId}, ${actorId})
             ON CONFLICT ("companyId", (COALESCE("userId", 0)), "kind", "periodKind", "year", "month")
             DO UPDATE SET "target" = EXCLUDED."target", "updatedBy" = ${actorId}, "updatedAt" = CURRENT_TIMESTAMP`;
        }
      });
    } catch (err) {
      this.logger.error(`No se pudieron guardar las metas: ${(err as Error).message}`);
      throw new BadRequestException('No se pudieron guardar las metas. Intenta de nuevo.');
    }
    return this.listar(cid, pk, y, m);
  }

  private validarPeriodo(periodKind: string, year: number, month?: number) {
    const y = Number(year);
    if (!Number.isInteger(y) || y < 2020 || y > 2100) throw new BadRequestException('El año no es válido.');
    if (periodKind === 'ANIO') return { pk: 'ANIO' as const, y, m: 0 };
    if (periodKind !== 'MES') throw new BadRequestException('El periodo debe ser mes o año.');
    const m = Number(month);
    if (!Number.isInteger(m) || m < 1 || m > 12) throw new BadRequestException('El mes no es válido.');
    return { pk: 'MES' as const, y, m };
  }

  // -------------------------------------------------------------------------
  // Avance contra la meta (Dashboard → Metas)
  // -------------------------------------------------------------------------

  /**
   * Avance del periodo. Hoy «vendido» es el monto de las oportunidades aceptadas en esos días; cuando se conecte
   * contabilidad, solo cambia de dónde sale (aquí) y no las pantallas ni las reglas de ventas-metas.util.
   */
  private async avances(companyId: number, desde: string, hasta: string) {
    const ini = new Date(new Date(`${desde}T00:00:00.000Z`).getTime() + HORAS_ECUADOR_MS);
    const fin = new Date(new Date(`${hasta}T00:00:00.000Z`).getTime() + DIA_MS + HORAS_ECUADOR_MS - 1);
    // Las oportunidades históricas importadas no son ventas del periodo; las renovaciones sí.
    const opps = await this.prisma.salesOpportunity.findMany({
      where: {
        companyId,
        outcome: 'GANADA',
        closedAt: { gte: ini, lte: fin },
        originType: { not: 'HISTORICO' },
      },
      select: { id: true, salesClientId: true, assignedUserId: true, quotedAmount: true, closedAt: true },
    });
    const ventas = opps.map((o) => ({
      id: o.id,
      salesClientId: o.salesClientId,
      assignedUserId: o.assignedUserId,
      quotedAmount: o.quotedAmount === null ? null : Number(o.quotedAmount),
      dia: diaEc(o.closedAt as Date),
    }));

    // «Cliente nuevo»: sin compra anterior en el sistema (oportunidad aceptada antes del periodo o histórica,
    // o contrato que empezó antes sin venir de una de estas ventas).
    const clientes = [...new Set(ventas.map((v) => v.salesClientId))];
    const conCompraPrevia = new Set<number>();
    if (clientes.length) {
      const idsVentas = ventas.map((v) => v.id);
      const [previas, contratos] = await Promise.all([
        this.prisma.salesOpportunity.findMany({
          where: {
            companyId,
            salesClientId: { in: clientes },
            outcome: 'GANADA',
            id: { notIn: idsVentas },
            OR: [{ originType: 'HISTORICO' }, { closedAt: { lt: ini } }],
          },
          select: { salesClientId: true },
        }),
        this.prisma.salesAgreement.findMany({
          where: {
            companyId,
            salesClientId: { in: clientes },
            startDate: { lt: new Date(`${desde}T00:00:00.000Z`) },
            OR: [{ opportunityId: null }, { opportunityId: { notIn: idsVentas } }],
          },
          select: { salesClientId: true },
        }),
      ]);
      for (const p of previas) conCompraPrevia.add(p.salesClientId);
      for (const c of contratos) conCompraPrevia.add(c.salesClientId);
    }
    return calcularAvances(ventas, conCompraPrevia);
  }

  private tarjetas(
    filas: FilaMeta[],
    userId: number | null,
    avance: AvanceTipos,
    periodo: ReturnType<typeof resolverPeriodo>,
  ): TarjetasMeta {
    const out = {} as TarjetasMeta;
    for (const kind of TIPOS_META) {
      const meta = periodo ? buscarMeta(filas, userId, kind, periodo) : null;
      out[kind] = cumplimiento(meta, avance[kind], periodo?.ritmo ?? 0);
    }
    return out;
  }

  private etiqueta(periodo: NonNullable<ReturnType<typeof resolverPeriodo>>): string {
    if (periodo.periodo === 'ANIO') return `Año ${periodo.year}`;
    const mes = `${MESES[periodo.month - 1]} de ${periodo.year}`;
    if (periodo.periodo === 'MES') return mes.charAt(0).toUpperCase() + mes.slice(1);
    const [, mm, dd] = periodo.inicio.split('-');
    return `Semana del ${dd}/${mm} (un cuarto de la meta de ${mes})`;
  }

  async cumplimiento(
    companyId: number | null,
    a: { userId: number; role: string; alcance?: string },
    desdeIn?: string,
    hastaIn?: string,
    pistaIn?: string,
  ) {
    const cid = this.requireCompany(companyId);
    const hoy = hoyEcuador();
    const desde = desdeIn || `${hoy.slice(0, 8)}01`;
    const hasta = hastaIn || hoy;
    if (!esDia(desde) || !esDia(hasta)) throw new BadRequestException('Las fechas no son válidas.');
    if (desde > hasta) throw new BadRequestException('La fecha «desde» no puede ser posterior a «hasta».');

    const pista: PistaPeriodo | undefined =
      pistaIn === 'semana' || pistaIn === 'mes' || pistaIn === 'anio' || pistaIn === 'ninguno' ? pistaIn : undefined;
    const periodo = resolverPeriodo(desde, hasta, hoy, pista);
    const privilegiado = a.role === 'ADMIN' || a.role === 'MANAGER';
    const vendedor = vendedorDelAlcance(a);

    const [{ empresa, porVendedor }, filas] = await Promise.all([
      this.avances(cid, desde, hasta),
      periodo
        ? this.filasDelPeriodo(cid, periodo.periodo === 'ANIO' ? 'ANIO' : 'MES', periodo.year, periodo.month)
        : Promise.resolve([] as FilaMeta[]),
    ]);

    const avanceAlcance = vendedor === null ? empresa : (porVendedor.get(vendedor) ?? avanceVacio());
    const tarjetas = this.tarjetas(filas, vendedor, avanceAlcance, periodo);

    // Quien mira a una persona (o es vendedor) ve también la meta de la empresa y su avance total, nunca el
    // desglose por compañero.
    const global = vendedor === null ? null : this.tarjetas(filas, null, empresa, periodo);

    // Solo gerencia, mirando a toda la empresa: una fila por persona y un total.
    let vendedores: unknown[] | null = null;
    let total: TarjetasMeta | null = null;
    if (privilegiado && vendedor === null) {
      const lista = await this.vendedores(cid);
      const nombres = new Map(lista.map((v) => [v.id, v.nombre]));
      // Quien tiene ventas del periodo pero ya no está en la lista (usuario desactivado) también aparece.
      const faltantes = [...porVendedor.keys()].filter((id) => id !== 0 && !nombres.has(id));
      if (faltantes.length) {
        const extra = await this.prisma.user.findMany({
          where: { id: { in: faltantes }, companyId: cid },
          select: { id: true, fullName: true },
        });
        for (const u of extra) nombres.set(u.id, u.fullName);
      }
      const ids = [...nombres.keys()];
      const filasVendedores = ids.map((id) => ({
        id,
        nombre: nombres.get(id) as string,
        tarjetas: this.tarjetas(filas, id, porVendedor.get(id) ?? avanceVacio(), periodo),
      }));
      const sinResponsable = porVendedor.get(0);
      const todas = [...filasVendedores.map((f) => f.tarjetas)];
      vendedores = [
        ...filasVendedores,
        ...(sinResponsable
          ? [{ id: 0, nombre: 'Sin responsable', tarjetas: this.tarjetas(filas, 0, sinResponsable, periodo) }]
          : []),
      ];
      // Total de la tabla = suma de sus filas (meta y avance), para que cuadre con lo que se ve.
      const suma: AvanceTipos = avanceVacio();
      const sumaMetas: Record<TipoMeta, number | null> = { MONTO: null, CLIENTES_NUEVOS: null, IMPACTOS: null };
      for (const t of [...todas, ...(sinResponsable ? [this.tarjetas(filas, 0, sinResponsable, periodo)] : [])]) {
        for (const kind of TIPOS_META) {
          suma[kind] += t[kind].avance;
          if (t[kind].meta !== null) sumaMetas[kind] = (sumaMetas[kind] ?? 0) + (t[kind].meta as number);
        }
      }
      total = {} as TarjetasMeta;
      for (const kind of TIPOS_META) {
        total[kind] = cumplimiento(sumaMetas[kind], suma[kind], periodo?.ritmo ?? 0);
      }
    }

    return {
      desde,
      hasta,
      periodo: periodo?.periodo ?? null,
      etiquetaPeriodo: periodo ? this.etiqueta(periodo) : null,
      ritmo: periodo ? Math.round(periodo.ritmo * 1000) / 1000 : null,
      hayMetas: filas.length > 0,
      alcance: { vendedorId: vendedor, esGerencia: privilegiado },
      tarjetas,
      global,
      vendedores,
      total,
      sinMonto: avanceAlcance.sinMonto,
    };
  }
}
