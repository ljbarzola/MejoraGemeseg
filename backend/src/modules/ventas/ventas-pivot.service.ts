import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { hoyEcuador } from './agreement-status.util';
import {
  DIMENSIONES,
  ETIQUETA_DIMENSION,
  armarPivot,
  construirPartes,
  opcionesDeFiltro,
  parsearConsulta,
  vendedorDeLaConsulta,
  type VentaPivot,
} from './ventas-pivot.util';

const HORAS_ECUADOR_MS = 5 * 60 * 60 * 1000;
const DIA_MS = 24 * 60 * 60 * 1000;
// Tope de ventas leídas de una vez: protege al servidor si algún día hay un periodo enorme.
const MAX_VENTAS = 20000;

const esDia = (s?: string): s is string => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00.000Z`));
const diaEc = (d: Date) => new Date(d.getTime() - HORAS_ECUADOR_MS).toISOString().slice(0, 10);

// Tabla dinámica del Dashboard (2026-11-16): lo vendido en el periodo —oportunidades aceptadas, igual que Metas—
// que cada quien ordena en filas, columnas y filtros. Solo lee; no escribe nada.
@Injectable()
export class VentasPivotService {
  constructor(private readonly prisma: PrismaService) {}

  /** Las ventas del periodo del alcance, tal como las usa la tabla. */
  private async ventas(companyId: number, vendedorId: number | null, desde: string, hasta: string): Promise<VentaPivot[]> {
    const ini = new Date(new Date(`${desde}T00:00:00.000Z`).getTime() + HORAS_ECUADOR_MS);
    const fin = new Date(new Date(`${hasta}T00:00:00.000Z`).getTime() + DIA_MS + HORAS_ECUADOR_MS - 1);
    // Igual que en Metas: las oportunidades históricas importadas no son ventas del periodo; las renovaciones sí.
    const opps = await this.prisma.salesOpportunity.findMany({
      where: {
        companyId,
        outcome: 'GANADA',
        closedAt: { gte: ini, lte: fin },
        originType: { not: 'HISTORICO' },
        ...(vendedorId !== null ? { assignedUserId: vendedorId } : {}),
      },
      select: {
        id: true,
        salesClientId: true,
        assignedUserId: true,
        quotedAmount: true,
        closedAt: true,
        locationProvince: true,
        locationCity: true,
        originType: true,
        salesClient: { select: { name: true } },
        services: { select: { service: { select: { name: true } } } },
      },
      orderBy: { id: 'asc' },
      take: MAX_VENTAS,
    });

    const ids = [...new Set(opps.map((o) => o.assignedUserId).filter((v): v is number => v !== null))];
    const usuarios = ids.length
      ? await this.prisma.user.findMany({ where: { id: { in: ids }, companyId }, select: { id: true, fullName: true } })
      : [];
    const nombres = new Map(usuarios.map((u) => [u.id, u.fullName]));

    return opps.map((o) => ({
      id: o.id,
      salesClientId: o.salesClientId,
      clienteNombre: o.salesClient?.name ?? '',
      vendedorNombre: o.assignedUserId === null ? null : (nombres.get(o.assignedUserId) ?? null),
      monto: o.quotedAmount === null ? null : Number(o.quotedAmount),
      dia: diaEc(o.closedAt as Date),
      provincia: o.locationProvince,
      ciudad: o.locationCity,
      originType: o.originType,
      servicios: o.services.map((s) => s.service.name),
    }));
  }

  async tabla(
    companyId: number | null,
    a: { userId: number; role: string; alcance?: string },
    q: { desde?: string; hasta?: string; filas?: string; columna?: string; medidas?: string; filtros?: string },
  ) {
    if (!companyId) throw new BadRequestException('Se requiere una empresa');
    const hoy = hoyEcuador();
    const desde = q.desde || `${hoy.slice(0, 8)}01`;
    const hasta = q.hasta || hoy;
    if (!esDia(desde) || !esDia(hasta)) throw new BadRequestException('Las fechas no son válidas.');
    if (desde > hasta) throw new BadRequestException('La fecha «desde» no puede ser posterior a «hasta».');

    const consulta = parsearConsulta(q);
    const vendedor = vendedorDeLaConsulta(a);
    const partes = construirPartes(await this.ventas(companyId, vendedor, desde, hasta));

    return {
      desde,
      hasta,
      alcance: { vendedorId: vendedor, esGerencia: a.role === 'ADMIN' || a.role === 'MANAGER' },
      dimensiones: DIMENSIONES.map((d) => ({ clave: d, etiqueta: ETIQUETA_DIMENSION[d] })),
      opciones: opcionesDeFiltro(partes),
      ...armarPivot(partes, consulta),
    };
  }
}
