import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CacaoConfigService } from '../cacao/config/cacao-config.service';
import { KG_POR_QUINTAL } from '../cacao/unit-config/unit-config.service';
import { saldosAnticipos } from '../cacao/common/anticipos.util';
import { liquidadoPorLote } from '../cacao/common/liquidado.util';
import {
  calcularCompras,
  estadoEntrega,
  type RecepcionCompra,
} from '../cacao/dashboard/compras.util';
import {
  diaHoyEcuador,
  formatoDia,
  normalizar,
  rangoDesdeParam,
} from './ai-ventas.queries';

// Consultas de Cacao del Agente de Cacao. Igual que las de Ventas: código determinista, NUNCA SQL
// libre; todas filtran por la empresa de quien pregunta (`companyId`) y devuelven texto plano que el
// modelo después redacta. Las cifras de compras y de entregas salen de las mismas funciones del
// Dashboard de Cacao (calcularCompras, liquidadoPorLote, saldosAnticipos), así el agente y la
// pantalla dicen siempre lo mismo. Los parámetros llegan del modelo como texto libre, así que se
// normalizan y se acotan.

const MAX_LINEAS = 15;
const ZONA = 'America/Guayaquil';
const DIA_MS = 24 * 60 * 60 * 1000;
const DIAS_PROXIMAS = 7;

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const dinero = (n: number) =>
  `$${round2(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const kg = (n: number) =>
  `${round2(n).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} kg`;
const qq = (n: number) => `${round2(n / KG_POR_QUINTAL).toLocaleString('en-US')} qq`;
const pesoTexto = (n: number) => `${kg(n)} (${qq(n)})`;

// Día de Ecuador de una marca de tiempo (createdAt, dueDate...). Las fechas de solo-día (la de una
// recepción o una liquidación) se guardan sin hora y se leen con formatoDia directamente.
const diaEcuador = (d: Date) => d.toLocaleDateString('en-CA', { timeZone: ZONA });
const fechaEcuador = (d: Date) => formatoDia(diaEcuador(d));

const masLineas = (total: number, mostradas: number) =>
  total > mostradas
    ? `\n…y ${total - mostradas} más (se muestran los primeros ${mostradas}).`
    : '';

const diasEntre = (desde: string, hasta: string) =>
  Math.round(
    (new Date(`${hasta}T00:00:00.000Z`).getTime() -
      new Date(`${desde}T00:00:00.000Z`).getTime()) /
      DIA_MS,
  );

const ESTADO_LIQUIDACION: Record<string, string> = {
  PENDING: 'Por aprobar',
  APPROVED: 'Aprobada',
  PAID: 'Pagada',
  REJECTED: 'Rechazada',
  CANCELLED: 'Anulada',
};

const ETIQUETA_ENTREGA: Record<string, string> = {
  SIN_LIQUIDAR: 'sin liquidar',
  PARCIAL: 'liquidada en parte',
  LIQUIDADA: 'liquidada',
  CERRADA: 'cerrada sin liquidar',
};

// Estados de una cuenta por pagar que todavía se le debe al proveedor.
const POR_PAGAR = ['PENDING', 'PARTIAL'];

@Injectable()
export class AiCacaoQueries {
  constructor(
    private prisma: PrismaService,
    private config: CacaoConfigService,
  ) {}

  private encabezado(): string {
    return `Datos de Cacao consultados el ${formatoDia(diaHoyEcuador())} (hora de Ecuador).`;
  }

  // Cuentas por pagar abiertas con su saldo; una sola lectura que usan el resumen, el proveedor y la lista.
  private async cuentasAbiertas(companyId: number, supplierId?: number) {
    const filas = await this.prisma.cacaoPayable.findMany({
      where: {
        companyId,
        status: { in: POR_PAGAR },
        ...(supplierId ? { supplierId } : {}),
      },
      include: { supplier: { select: { name: true } } },
      orderBy: { dueDate: 'asc' },
    });
    return filas
      .map((p) => ({
        id: p.id,
        proveedor: p.supplier.name,
        supplierId: p.supplierId,
        total: p.totalAmount,
        pagado: p.paidAmount,
        saldo: round2(p.totalAmount - p.paidAmount),
        vence: diaEcuador(p.dueDate),
      }))
      .filter((p) => p.saldo > 0.009);
  }

  // ---------------------------------------------------------------------------------------------
  // Panorama
  // ---------------------------------------------------------------------------------------------
  async resumen(companyId: number): Promise<string> {
    const hoy = diaHoyEcuador();
    const hace30 = new Date(`${hoy}T00:00:00.000Z`);
    hace30.setUTCDate(hace30.getUTCDate() - 29);
    const [recepciones, abiertos, porAprobar, cuentas, anticipos] = await Promise.all([
      this.prisma.cacaoReception.aggregate({
        where: { companyId, voidedAt: null, date: { gte: hace30 } },
        _count: { id: true },
        _sum: { netWeight: true },
      }),
      this.prisma.cacaoLot.aggregate({
        where: { companyId, status: 'OPEN' },
        _count: { id: true },
        _sum: { netWeight: true },
      }),
      this.prisma.cacaoSettlement.aggregate({
        where: { companyId, status: 'PENDING' },
        _count: { id: true },
        _sum: { totalAmount: true },
      }),
      this.cuentasAbiertas(companyId),
      saldosAnticipos(this.prisma, companyId),
    ]);

    const vencidas = cuentas.filter((c) => c.vence < hoy);
    const saldoTotal = cuentas.reduce((s, c) => s + c.saldo, 0);
    const saldoVencido = vencidas.reduce((s, c) => s + c.saldo, 0);
    const saldoAnticipos = [...anticipos.values()]
      .filter((v) => v > 0)
      .reduce((s, v) => s + v, 0);

    return [
      this.encabezado(),
      `Recepciones de los últimos 30 días (desde ${formatoDia(diaDesde(hace30))}): ${recepciones._count.id}, con ${pesoTexto(recepciones._sum.netWeight ?? 0)} de peso neto.`,
      `Lotes abiertos hoy: ${abiertos._count.id}, con ${pesoTexto(abiertos._sum.netWeight ?? 0)} en inventario.`,
      `Liquidaciones por aprobar: ${porAprobar._count.id}${porAprobar._count.id > 0 ? ` por ${dinero(porAprobar._sum.totalAmount ?? 0)} en total` : ''}.`,
      `Cuentas por pagar con saldo: ${cuentas.length}, por ${dinero(saldoTotal)} en total; vencidas: ${vencidas.length}${vencidas.length > 0 ? ` por ${dinero(saldoVencido)}` : ''}.`,
      `Anticipos a proveedores sin descontar: ${dinero(saldoAnticipos)}.`,
    ].join('\n');
  }

  // ---------------------------------------------------------------------------------------------
  // Un proveedor: cuánto se le debe, su saldo de anticipos, liquidaciones y entregas recientes
  // ---------------------------------------------------------------------------------------------
  async proveedor(companyId: number, nombre?: string): Promise<string> {
    if (!nombre) {
      return 'Falta el nombre del proveedor. Pídele a la persona que diga cuál (parte del nombre o su número de identificación).';
    }
    const buscado = normalizar(nombre);
    const todos = await this.prisma.cacaoSupplier.findMany({
      where: { companyId },
      select: { id: true, name: true, idNumber: true },
      orderBy: { name: 'asc' },
    });
    const coinciden = todos.filter(
      (s) =>
        normalizar(s.name).includes(buscado) ||
        (s.idNumber ? s.idNumber.includes(nombre.trim()) : false),
    );
    if (coinciden.length === 0) {
      return `No hay ningún proveedor que coincida con «${nombre}» en esta empresa.`;
    }
    if (coinciden.length > 1) {
      const exacto = coinciden.filter((s) => normalizar(s.name) === buscado);
      if (exacto.length !== 1) {
        return (
          `Hay ${coinciden.length} proveedores que coinciden con «${nombre}»: ` +
          coinciden.slice(0, MAX_LINEAS).map((s) => s.name).join('; ') +
          '. Pídele a la persona que diga cuál.'
        );
      }
      coinciden.splice(0, coinciden.length, exacto[0]);
    }
    const prov = coinciden[0];

    const [ficha, cuentas, saldos, liquidaciones, recepciones, documentos] =
      await Promise.all([
        this.prisma.cacaoSupplier.findFirst({
          where: { id: prov.id, companyId },
          select: {
            bank: true,
            bankAccountNumber: true,
            paymentTerms: true,
            phone: true,
            rating: true,
          },
        }),
        this.cuentasAbiertas(companyId, prov.id),
        saldosAnticipos(this.prisma, companyId, [prov.id]),
        this.prisma.cacaoSettlement.findMany({
          where: { companyId, supplierId: prov.id },
          orderBy: { date: 'desc' },
          take: 5,
          select: { date: true, status: true, totalAmount: true, advanceApplied: true },
        }),
        this.prisma.cacaoReception.findMany({
          where: { companyId, supplierId: prov.id, voidedAt: null },
          orderBy: { date: 'desc' },
          take: 5,
          select: {
            date: true,
            netWeight: true,
            consigned: true,
            lot: { select: { code: true, quality: { select: { name: true } } } },
          },
        }),
        this.prisma.cacaoSupplierDocument.count({
          where: { companyId, supplierId: prov.id },
        }),
      ]);

    const hoy = diaHoyEcuador();
    const saldoDeuda = cuentas.reduce((s, c) => s + c.saldo, 0);
    const lineas = [
      this.encabezado(),
      `Proveedor: ${prov.name}${prov.idNumber ? ` (identificación ${prov.idNumber})` : ''}.`,
      cuentas.length === 0
        ? 'Cuentas por pagar con saldo: ninguna; no se le debe nada ahora.'
        : `Se le debe ${dinero(saldoDeuda)} en ${cuentas.length} cuenta(s) por pagar:`,
      ...cuentas.map(
        (c) =>
          `- ${dinero(c.saldo)} de ${dinero(c.total)} (pagado ${dinero(c.pagado)}), vence el ${formatoDia(c.vence)}${c.vence < hoy ? ` — VENCIDA hace ${diasEntre(c.vence, hoy)} día(s)` : ''}.`,
      ),
      `Saldo de anticipos disponible para descontarle: ${dinero(Math.max(0, saldos.get(prov.id) ?? 0))}.`,
      liquidaciones.length === 0
        ? 'Liquidaciones: ninguna registrada.'
        : 'Últimas liquidaciones:',
      ...liquidaciones.map(
        (l) =>
          `- ${formatoDia(l.date)}: ${ESTADO_LIQUIDACION[l.status] ?? l.status}, valor del cacao ${dinero(l.totalAmount)}${l.advanceApplied > 0 ? `, anticipo descontado ${dinero(l.advanceApplied)}` : ''}.`,
      ),
      recepciones.length === 0
        ? 'Entregas: ninguna registrada.'
        : 'Últimas entregas:',
      ...recepciones.map(
        (r) =>
          `- ${formatoDia(r.date)}: ${pesoTexto(r.netWeight)}${r.lot?.quality?.name ? `, ${r.lot.quality.name}` : ''}${r.lot ? `, lote ${r.lot.code}` : ''}${r.consigned ? ', en consignación' : ''}.`,
      ),
      `Ficha: ${ficha?.bankAccountNumber ? `cuenta bancaria registrada${ficha.bank ? ` (${ficha.bank})` : ''}` : 'sin cuenta bancaria registrada'}; ${documentos} documento(s) adjunto(s)${ficha?.paymentTerms ? `; condiciones de pago: ${ficha.paymentTerms}` : ''}${ficha?.rating ? `; calificación ${ficha.rating} de 5` : ''}.`,
    ];
    return lineas.join('\n');
  }

  // ---------------------------------------------------------------------------------------------
  // Cuentas por pagar: vencidas, próximas o todas las abiertas
  // ---------------------------------------------------------------------------------------------
  async porPagar(companyId: number, estado?: string): Promise<string> {
    const hoy = diaHoyEcuador();
    const limite = new Date(`${hoy}T00:00:00.000Z`);
    limite.setUTCDate(limite.getUTCDate() + DIAS_PROXIMAS);
    const hasta = diaDesde(limite);
    const e = normalizar(estado ?? '');
    const modo = e.startsWith('venc')
      ? 'vencidas'
      : e.startsWith('prox')
        ? 'proximas'
        : 'todas';

    const abiertas = await this.cuentasAbiertas(companyId);
    const filtradas = abiertas.filter((c) =>
      modo === 'vencidas'
        ? c.vence < hoy
        : modo === 'proximas'
          ? c.vence >= hoy && c.vence <= hasta
          : true,
    );
    const titulo =
      modo === 'vencidas'
        ? 'Cuentas por pagar VENCIDAS'
        : modo === 'proximas'
          ? `Cuentas por pagar que vencen en los próximos ${DIAS_PROXIMAS} días (hasta el ${formatoDia(hasta)})`
          : 'Cuentas por pagar con saldo';
    if (filtradas.length === 0) {
      return `${this.encabezado()}\n${titulo}: ninguna.`;
    }
    const total = filtradas.reduce((s, c) => s + c.saldo, 0);
    return [
      this.encabezado(),
      `${titulo}: ${filtradas.length}, por ${dinero(total)} en total (ordenadas por fecha de vencimiento).`,
      ...filtradas.slice(0, MAX_LINEAS).map(
        (c) =>
          `- ${c.proveedor}: saldo ${dinero(c.saldo)} de ${dinero(c.total)}, vence el ${formatoDia(c.vence)}${c.vence < hoy ? ` (vencida hace ${diasEntre(c.vence, hoy)} día(s))` : c.vence === hoy ? ' (vence hoy)' : ''}.`,
      ),
    ]
      .join('\n')
      .concat(masLineas(filtradas.length, MAX_LINEAS));
  }

  // ---------------------------------------------------------------------------------------------
  // Liquidaciones (por defecto, las que esperan aprobación) y quién puede aprobarlas
  // ---------------------------------------------------------------------------------------------
  async liquidaciones(
    companyId: number,
    userId: number,
    estado?: string,
  ): Promise<string> {
    const e = normalizar(estado ?? '').replace(/\s+/g, '_');
    const status =
      e.startsWith('aprobada')
        ? 'APPROVED'
        : e.startsWith('pagada')
          ? 'PAID'
          : e.startsWith('rechazada')
            ? 'REJECTED'
            : e.startsWith('anulada')
              ? 'CANCELLED'
              : 'PENDING';
    const [filas, tope] = await Promise.all([
      this.prisma.cacaoSettlement.findMany({
        where: { companyId, status },
        orderBy: { createdAt: 'asc' },
        take: 50,
        include: { supplier: { select: { name: true } } },
      }),
      this.config.montoAprobacionAdmin(companyId),
    ]);
    const nombreEstado = ESTADO_LIQUIDACION[status];
    if (filas.length === 0) {
      return `${this.encabezado()}\nLiquidaciones en estado «${nombreEstado}»: ninguna.`;
    }

    const creadores = await this.prisma.user.findMany({
      where: { id: { in: [...new Set(filas.map((f) => f.createdBy))] } },
      select: { id: true, fullName: true },
    });
    const nombreDe = new Map(creadores.map((u) => [u.id, u.fullName]));
    const hoy = diaHoyEcuador();
    const total = filas.reduce((s, f) => s + f.totalAmount, 0);

    return [
      this.encabezado(),
      `Liquidaciones en estado «${nombreEstado}»: ${filas.length}, por ${dinero(total)} en valor del cacao (de la más antigua a la más reciente).`,
      status === 'PENDING'
        ? tope === null
          ? 'Monto desde el cual solo aprueba un administrador: no está configurado (un gerente puede aprobar cualquiera). La aprobación siempre la hace una persona distinta de quien la creó.'
          : `Monto desde el cual solo aprueba un administrador: ${dinero(tope)} (las que lo superan no las puede aprobar un gerente). La aprobación siempre la hace una persona distinta de quien la creó.`
        : '',
      ...filas.slice(0, MAX_LINEAS).map((f) => {
        const espera = diasEntre(diaEcuador(f.createdAt), hoy);
        const notas: string[] = [];
        if (status === 'PENDING') {
          notas.push(`creada el ${fechaEcuador(f.createdAt)} (hace ${espera} día(s))`);
          notas.push(
            f.createdBy === userId
              ? 'la creó quien pregunta: la debe aprobar otra persona'
              : `la creó ${nombreDe.get(f.createdBy) ?? 'otra persona'}`,
          );
          if (tope !== null && f.totalAmount > tope) notas.push('supera el monto de administrador');
        } else if (f.decidedAt) {
          notas.push(`decidida el ${fechaEcuador(f.decidedAt)}`);
          if (f.decisionReason) notas.push(`motivo: ${f.decisionReason}`);
        }
        return `- ${f.supplier.name}: ${dinero(f.totalAmount)}${f.advanceApplied > 0 ? ` (anticipo ${dinero(f.advanceApplied)}, a pagar ${dinero(f.totalAmount - f.advanceApplied)})` : ''}, ${pesoTexto(f.totalNetWeight)}; ${notas.join('; ')}.`;
      }),
    ]
      .filter(Boolean)
      .join('\n')
      .concat(masLineas(filas.length, MAX_LINEAS));
  }

  // ---------------------------------------------------------------------------------------------
  // Recepciones recientes
  // ---------------------------------------------------------------------------------------------
  async recepciones(companyId: number, rango?: string): Promise<string> {
    const r = rangoDesdeParam(rango, diaHoyEcuador());
    const filas = await this.prisma.cacaoReception.findMany({
      where: {
        companyId,
        voidedAt: null,
        date: {
          gte: new Date(`${r.desde}T00:00:00.000Z`),
          lte: new Date(`${r.hasta}T23:59:59.999Z`),
        },
      },
      orderBy: { date: 'desc' },
      include: {
        supplier: { select: { name: true } },
        lot: { select: { code: true, quality: { select: { name: true } } } },
      },
    });
    if (filas.length === 0) {
      return `${this.encabezado()}\nRecepciones de ${r.etiqueta} (${formatoDia(r.desde)} al ${formatoDia(r.hasta)}): ninguna.`;
    }
    const liquidado = await liquidadoPorLote(
      this.prisma,
      companyId,
      filas.map((f) => f.lotId).filter((id): id is number => id !== null),
    );
    const pesoTotal = filas.reduce((s, f) => s + f.netWeight, 0);
    return [
      this.encabezado(),
      `Recepciones de ${r.etiqueta} (${formatoDia(r.desde)} al ${formatoDia(r.hasta)}): ${filas.length}, con ${pesoTexto(pesoTotal)} de peso neto (de la más reciente a la más antigua).`,
      ...filas.slice(0, MAX_LINEAS).map((f) => {
        const estado = estadoEntrega({
          netWeight: f.netWeight,
          liquidadoKg: f.lotId === null ? 0 : (liquidado.get(f.lotId) ?? 0),
          closedAt: f.closedAt,
        });
        return `- ${formatoDia(f.date)} · ${f.supplier.name}: ${pesoTexto(f.netWeight)}${f.lot?.quality?.name ? `, ${f.lot.quality.name}` : ''}, precio provisional ${dinero(f.provisionalPrice)}/kg${f.lot ? `, lote ${f.lot.code}` : ''}${f.consigned ? ', en consignación' : ''}; ${ETIQUETA_ENTREGA[estado]}.`;
      }),
    ]
      .join('\n')
      .concat(masLineas(filas.length, MAX_LINEAS));
  }

  // ---------------------------------------------------------------------------------------------
  // Lotes (inventario): abiertos por defecto
  // ---------------------------------------------------------------------------------------------
  async lotes(companyId: number, estado?: string): Promise<string> {
    const e = normalizar(estado ?? '');
    const status = e.startsWith('cerr') ? 'CLOSED' : 'OPEN';
    const filas = await this.prisma.cacaoLot.findMany({
      where: { companyId, status },
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: { quality: { select: { name: true } } },
    });
    const nombre = status === 'OPEN' ? 'abiertos' : 'cerrados';
    if (filas.length === 0) {
      return `${this.encabezado()}\nLotes ${nombre}: ninguno.`;
    }
    const peso = filas.reduce((s, f) => s + f.netWeight, 0);
    const valor = filas.reduce((s, f) => s + f.netWeight * f.averageCost, 0);
    return [
      this.encabezado(),
      `Lotes ${nombre}: ${filas.length}${status === 'OPEN' ? `, con ${pesoTexto(peso)} y un valor de inventario de ${dinero(valor)} a costo de lote` : ''}; del más reciente al más antiguo.`,
      ...filas.slice(0, MAX_LINEAS).map(
        (f) =>
          `- ${f.code} · ${f.quality.name}: ${pesoTexto(f.netWeight)}, costo promedio ${dinero(f.averageCost)}/kg, creado el ${fechaEcuador(f.createdAt)}${f.dryWeight != null ? `, peso seco ${kg(f.dryWeight)}` : ''}.`,
      ),
    ]
      .join('\n')
      .concat(masLineas(filas.length, MAX_LINEAS));
  }

  // ---------------------------------------------------------------------------------------------
  // Precio promedio pagado (a costo de lote) por calidad, y su rango esperado
  // ---------------------------------------------------------------------------------------------
  async precios(companyId: number, rango?: string): Promise<string> {
    const r = rangoDesdeParam(rango ?? '90', diaHoyEcuador());
    const [recepciones, calidades] = await Promise.all([
      this.prisma.cacaoReception.findMany({
        where: {
          companyId,
          voidedAt: null,
          date: {
            gte: new Date(`${r.desde}T00:00:00.000Z`),
            lte: new Date(`${r.hasta}T23:59:59.999Z`),
          },
        },
        include: {
          supplier: { select: { name: true } },
          lot: {
            select: { averageCost: true, quality: { select: { name: true } } },
          },
        },
      }),
      this.prisma.cacaoQuality.findMany({
        where: { companyId },
        select: { name: true, minPrice: true, maxPrice: true },
      }),
    ]);
    if (recepciones.length === 0) {
      return `${this.encabezado()}\nRecepciones de ${r.etiqueta} (${formatoDia(r.desde)} al ${formatoDia(r.hasta)}): ninguna, así que no hay precio que promediar.`;
    }
    const entregas: RecepcionCompra[] = recepciones.map((x) => ({
      date: x.date,
      supplierId: x.supplierId,
      supplierName: x.supplier.name,
      qualityName: x.lot?.quality?.name ?? null,
      netWeight: x.netWeight,
      costoPorKg: x.lot?.averageCost ?? x.provisionalPrice,
      liquidadoKg: 0,
      closedAt: x.closedAt,
    }));
    const c = calcularCompras(entregas, 'dia');
    const rangoDe = new Map(calidades.map((q) => [q.name, q]));
    return [
      this.encabezado(),
      `Precio promedio de compra de ${r.etiqueta} (${formatoDia(r.desde)} al ${formatoDia(r.hasta)}), a costo de lote (el precio ya fijado o el provisional): ${c.totales.precioPromedioQq !== null ? `${dinero(c.totales.precioPromedioQq)} por quintal (${dinero(c.totales.precioPromedioKg ?? 0)}/kg)` : 'no consta'}, en ${c.totales.entregas} entrega(s) y ${pesoTexto(c.totales.pesoNetoKg)}; compra total ${dinero(c.totales.compra)}.`,
      'Por calidad:',
      ...c.porCalidad.map((q) => {
        const precioKg = q.pesoNetoKg > 0 ? q.compra / q.pesoNetoKg : null;
        const esperado = rangoDe.get(q.nombre);
        const rangoTxt =
          esperado && (esperado.minPrice != null || esperado.maxPrice != null)
            ? `; rango esperado ${esperado.minPrice != null ? dinero(esperado.minPrice) : 'sin mínimo'} a ${esperado.maxPrice != null ? dinero(esperado.maxPrice) : 'sin máximo'} por kg`
            : '; sin rango esperado configurado';
        return `- ${q.nombre}: ${precioKg !== null ? `${dinero(precioKg * KG_POR_QUINTAL)} por quintal (${dinero(precioKg)}/kg)` : 'no consta'}, ${pesoTexto(q.pesoNetoKg)}${rangoTxt}.`;
      }),
    ].join('\n');
  }

  // ---------------------------------------------------------------------------------------------
  // Anticipos: proveedores con saldo a favor
  // ---------------------------------------------------------------------------------------------
  async anticipos(companyId: number): Promise<string> {
    const saldos = await saldosAnticipos(this.prisma, companyId);
    const conSaldo = [...saldos.entries()].filter(([, v]) => v > 0.009);
    if (conSaldo.length === 0) {
      return `${this.encabezado()}\nNingún proveedor tiene saldo de anticipos pendiente de descontar.`;
    }
    const nombres = await this.prisma.cacaoSupplier.findMany({
      where: { companyId, id: { in: conSaldo.map(([id]) => id) } },
      select: { id: true, name: true },
    });
    const nombreDe = new Map(nombres.map((n) => [n.id, n.name]));
    const ultimos = await this.prisma.cacaoSupplierAdvance.groupBy({
      by: ['supplierId'],
      where: { companyId, voidedAt: null, supplierId: { in: conSaldo.map(([id]) => id) } },
      _max: { date: true },
    });
    const ultimoDe = new Map(ultimos.map((u) => [u.supplierId, u._max.date]));
    const ordenado = conSaldo.sort((a, b) => b[1] - a[1]);
    const total = ordenado.reduce((s, [, v]) => s + v, 0);
    return [
      this.encabezado(),
      `Proveedores con anticipo sin descontar: ${ordenado.length}, por ${dinero(total)} en total (de mayor a menor).`,
      ...ordenado.slice(0, MAX_LINEAS).map(([id, saldo]) => {
        const ult = ultimoDe.get(id);
        return `- ${nombreDe.get(id) ?? 'Proveedor'}: saldo ${dinero(saldo)}${ult ? `, último anticipo el ${formatoDia(ult)}` : ''}.`;
      }),
    ]
      .join('\n')
      .concat(masLineas(ordenado.length, MAX_LINEAS));
  }

  // ---------------------------------------------------------------------------------------------
  // Proveedores con la ficha incompleta (sin documentos o sin cuenta bancaria)
  // ---------------------------------------------------------------------------------------------
  async proveedoresIncompletos(companyId: number): Promise<string> {
    const [proveedores, docs] = await Promise.all([
      this.prisma.cacaoSupplier.findMany({
        where: { companyId },
        select: { id: true, name: true, bankAccountNumber: true },
        orderBy: { name: 'asc' },
      }),
      this.prisma.cacaoSupplierDocument.groupBy({
        by: ['supplierId'],
        where: { companyId },
        _count: { id: true },
      }),
    ]);
    if (proveedores.length === 0) {
      return `${this.encabezado()}\nNo hay proveedores registrados.`;
    }
    const conDocs = new Set(docs.map((d) => d.supplierId));
    const incompletos = proveedores
      .map((p) => ({
        nombre: p.name,
        sinCuenta: !p.bankAccountNumber,
        sinDocs: !conDocs.has(p.id),
      }))
      .filter((p) => p.sinCuenta || p.sinDocs);
    const sinCuenta = incompletos.filter((p) => p.sinCuenta).length;
    const sinDocs = incompletos.filter((p) => p.sinDocs).length;
    return [
      this.encabezado(),
      `Proveedores registrados: ${proveedores.length}. Sin cuenta bancaria: ${sinCuenta}. Sin documentos adjuntos: ${sinDocs}.`,
      ...incompletos.slice(0, MAX_LINEAS).map(
        (p) =>
          `- ${p.nombre}: ${[p.sinCuenta ? 'sin cuenta bancaria' : '', p.sinDocs ? 'sin documentos' : ''].filter(Boolean).join(' y ')}.`,
      ),
    ]
      .join('\n')
      .concat(masLineas(incompletos.length, MAX_LINEAS));
  }

  // ---------------------------------------------------------------------------------------------
  // Reglas vigentes de la empresa: sirven para explicar «por qué no me deja»
  // ---------------------------------------------------------------------------------------------
  async reglas(companyId: number, userId: number): Promise<string> {
    const [ajustes, usuario, puntos] = await Promise.all([
      this.config.get(companyId),
      this.prisma.user.findUnique({
        where: { id: userId },
        select: { role: true },
      }),
      this.prisma.cacaoPunto.count({ where: { companyId, activo: true } }),
    ]);
    const rol =
      usuario?.role === 'ADMIN'
        ? 'administrador'
        : usuario?.role === 'MANAGER'
          ? 'gerente'
          : 'empleado';
    return [
      this.encabezado(),
      `Quien pregunta es ${rol} de la empresa.`,
      ajustes.montoAprobacionAdmin === null
        ? 'Aprobación de liquidaciones: no hay monto configurado para administrador; un gerente puede aprobar cualquiera, pero siempre otra persona distinta de quien la creó.'
        : `Aprobación de liquidaciones: las que superan ${dinero(ajustes.montoAprobacionAdmin)} solo las aprueba un administrador; las de ese monto o menos también un gerente. Siempre otra persona distinta de quien la creó.`,
      ajustes.pagosRequierenAutorizacion
        ? 'Pagos a proveedores: necesitan autorización (se solicitan, otra persona los autoriza y el administrador los registra).'
        : 'Pagos a proveedores: no necesitan autorización; el administrador los registra directo desde la cuenta por pagar.',
      `Plazo de pago a proveedores por defecto: ${ajustes.plazoPagoDias} días; plazo de cobro a clientes: ${ajustes.plazoCobroDias} días.`,
      ajustes.precioIce === null
        ? 'Precio ICE de referencia: sin configurar (hasta que el administrador lo escriba no se pueden crear ni fijar fijaciones de precio).'
        : `Precio ICE de referencia: ${dinero(ajustes.precioIce)} por tonelada.`,
      puntos > 0
        ? `Puntos de acopio activos: ${puntos}; cada recepción debe decir en cuál se recibió.`
        : 'Puntos de acopio: ninguno activo; las recepciones no piden punto.',
    ].join('\n');
  }
}

function diaDesde(d: Date): string {
  return d.toISOString().slice(0, 10);
}
