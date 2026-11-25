import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

// Consultas de datos en vivo del Agente de Custodia (2026-11-16). Reemplazan al GEME-BOT, que
// adivinaba la intención por palabras y devolvía la respuesta ya redactada. Aquí SOLO se calculan
// los datos (código determinista, nada de SQL libre) y el modelo los pone en palabras.
//
// Deliberadamente SIN dinero: tarifas, nómina y ganancias son de Contabilidad (otra sección de
// permisos), así que este agente no puede ni consultarlas.

const ESTADO_TEXTO: Record<string, string> = {
  LISTO_PARA_CUSTODIAR: 'Listo para custodiar',
  EN_CAMINO: 'En camino',
  LLEGO: 'Llegó',
};
const TIPO_TEXTO: Record<string, string> = {
  HACIENDA: 'Hacienda',
  PUERTO: 'Puerto',
  VIP: 'VIP',
};

const DIA_MS = 24 * 60 * 60 * 1000;

function fechaEc(d: Date | null | undefined): string {
  if (!d) return 'sin fecha';
  const x = new Date(d);
  return `${String(x.getUTCDate()).padStart(2, '0')}/${String(x.getUTCMonth() + 1).padStart(2, '0')}/${x.getUTCFullYear()}`;
}

function sinTildes(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

function inicioDeMes(): Date {
  const n = new Date();
  return new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), 1));
}

/** Tiempo transcurrido en texto corto: «3 año(s) y 2 mes(es)», «5 mes(es)» o «12 día(s)». */
export function tiempoDesde(desde: Date, ahora = Date.now()): string {
  const dias = Math.max(0, Math.floor((ahora - new Date(desde).getTime()) / DIA_MS));
  const meses = Math.floor(dias / 30);
  if (meses >= 12) return `${Math.floor(meses / 12)} año(s) y ${meses % 12} mes(es)`;
  if (meses >= 1) return `${meses} mes(es)`;
  return `${dias} día(s)`;
}

@Injectable()
export class AiCustodiasQueries {
  constructor(private readonly prisma: PrismaService) {}

  /** Panorama: viajes por estado, este mes por tipo y lo que está en curso ahora. */
  async resumen(companyId: number): Promise<string> {
    const [porEstado, delMes, enCurso] = await Promise.all([
      this.prisma.custodia.groupBy({ by: ['estado'], where: { companyId }, _count: { id: true } }),
      this.prisma.custodia.groupBy({
        by: ['tipoCustodia'],
        where: { companyId, createdAt: { gte: inicioDeMes() } },
        _count: { id: true },
      }),
      this.prisma.custodia.findMany({
        where: { companyId, estado: { in: ['LISTO_PARA_CUSTODIAR', 'EN_CAMINO'] } },
        orderBy: { createdAt: 'desc' },
        take: 8,
      }),
    ]);
    if (porEstado.length === 0) return 'No hay custodias registradas.';

    const lineas = [
      'Viajes por estado (todos): ' +
        porEstado.map((c) => `${ESTADO_TEXTO[c.estado] ?? c.estado}: ${c._count.id}`).join(', '),
      delMes.length
        ? 'Viajes registrados este mes por tipo: ' +
          delMes.map((c) => `${TIPO_TEXTO[c.tipoCustodia] ?? c.tipoCustodia}: ${c._count.id}`).join(', ')
        : 'Este mes no hay viajes registrados.',
    ];
    if (enCurso.length) {
      lineas.push('Viajes pendientes o en camino (los más recientes):');
      for (const c of enCurso) {
        lineas.push(
          `- Guía ${c.numeroGuia} (${TIPO_TEXTO[c.tipoCustodia] ?? c.tipoCustodia}, ${ESTADO_TEXTO[c.estado] ?? c.estado}), cliente ${c.cliente || 'sin cliente'}, placa ${c.placa || 'sin placa'}, salida ${fechaEc(c.fechaHoraSalida ?? c.createdAt)}`,
        );
      }
    } else {
      lineas.push('No hay viajes pendientes ni en camino ahora.');
    }
    return lineas.join('\n');
  }

  /** «llegó», «en camino», «pendientes»… → estado del viaje (null = todos). */
  private estadoDeTexto(texto?: string): string | null {
    const t = sinTildes(texto ?? '');
    if (t.includes('lleg')) return 'LLEGO';
    if (t.includes('camino')) return 'EN_CAMINO';
    if (t.includes('listo') || t.includes('pendiente')) return 'LISTO_PARA_CUSTODIAR';
    return null;
  }

  /** Lista los viajes (guía, tipo, estado, cliente, placa y quién fue), de un estado o de todos. */
  async lista(companyId: number, estado?: string, dias?: string): Promise<string> {
    const est = this.estadoDeTexto(estado);
    const n = Number.parseInt((dias ?? '').trim(), 10);
    const desde = Number.isFinite(n) && n >= 1 ? new Date(Date.now() - Math.min(n, 365) * DIA_MS) : null;
    const where = { companyId, ...(desde ? { createdAt: { gte: desde } } : {}), ...(est ? { estado: est as 'LLEGO' | 'EN_CAMINO' | 'LISTO_PARA_CUSTODIAR' } : {}) };
    const [total, filas] = await Promise.all([
      this.prisma.custodia.count({ where }),
      this.prisma.custodia.findMany({
        where,
        orderBy: [{ fechaHoraSalida: { sort: 'desc', nulls: 'last' } }, { createdAt: 'desc' }],
        take: 15,
      }),
    ]);
    const que =
      (est ? `en estado «${ESTADO_TEXTO[est]}»` : 'registrados') +
      (desde ? ` en los últimos ${Math.min(n, 365)} día(s)` : '');
    if (total === 0) return `No hay viajes ${que}.`;
    const lineas = [
      `Viajes ${que}: ${total}${total > filas.length ? ` (se muestran los ${filas.length} más recientes)` : ''}.`,
    ];
    for (const c of filas) {
      const gente = [
        c.choferName ? `chofer ${c.choferName}` : '',
        c.custodio1Name ? `custodio ${c.custodio1Name}` : '',
        c.custodio2Name ? `custodio ${c.custodio2Name}` : '',
        c.custodio3Name ? `custodio ${c.custodio3Name}` : '',
        c.custodio4Name ? `custodio ${c.custodio4Name}` : '',
      ].filter(Boolean);
      lineas.push(
        `- Guía ${c.numeroGuia} (${TIPO_TEXTO[c.tipoCustodia] ?? c.tipoCustodia}, ${ESTADO_TEXTO[c.estado] ?? c.estado}), cliente ${c.cliente || 'sin cliente'}, placa ${c.placa || 'sin placa'}, salida ${fechaEc(c.fechaHoraSalida ?? c.createdAt)}${gente.length ? ', ' + gente.join(', ') : ''}`,
      );
    }
    return lineas.join('\n');
  }

  /** Cédula (10 dígitos) o parte del nombre → condiciones para buscar a una persona en los viajes. */
  private condicionesDePersona(texto: string) {
    const t = texto.trim();
    if (/^\d{10}$/.test(t)) {
      return [
        { choferCedula: t },
        { custodio1Cedula: t },
        { custodio2Cedula: t },
        { custodio3Cedula: t },
        { custodio4Cedula: t },
      ];
    }
    return [
      { choferName: { contains: t, mode: 'insensitive' as const } },
      { custodio1Name: { contains: t, mode: 'insensitive' as const } },
      { custodio2Name: { contains: t, mode: 'insensitive' as const } },
      { custodio3Name: { contains: t, mode: 'insensitive' as const } },
      { custodio4Name: { contains: t, mode: 'insensitive' as const } },
    ];
  }

  /** Los viajes de una persona: cuántos, de qué tipo, en qué rol y los últimos. */
  async viajes(companyId: number, nombre?: string): Promise<string> {
    if (!nombre?.trim()) {
      return 'Para consultar los viajes de un guardia necesito su nombre (o parte de él) o su cédula.';
    }
    const filas = await this.prisma.custodia.findMany({
      where: { companyId, OR: this.condicionesDePersona(nombre) },
      orderBy: { createdAt: 'desc' },
    });
    if (filas.length === 0) return `No hay viajes registrados para «${nombre.trim()}».`;

    const buscado = sinTildes(nombre.trim());
    const esEl = (n: string, ced: string) =>
      ced === nombre.trim() || (n && sinTildes(n).includes(buscado));
    const porTipo: Record<string, number> = {};
    const porRol: Record<string, number> = {
      Chofer: 0,
      'Custodio 1': 0,
      'Custodio 2': 0,
      'Custodio 3': 0,
      'Custodio 4': 0,
    };
    const hace30 = Date.now() - 30 * DIA_MS;
    let ultimos30 = 0;
    for (const c of filas) {
      porTipo[c.tipoCustodia] = (porTipo[c.tipoCustodia] ?? 0) + 1;
      if (esEl(c.choferName, c.choferCedula)) porRol['Chofer']++;
      else if (esEl(c.custodio1Name, c.custodio1Cedula)) porRol['Custodio 1']++;
      else if (esEl(c.custodio2Name, c.custodio2Cedula)) porRol['Custodio 2']++;
      else if (esEl(c.custodio3Name, c.custodio3Cedula)) porRol['Custodio 3']++;
      else if (esEl(c.custodio4Name, c.custodio4Cedula)) porRol['Custodio 4']++;
      if (new Date(c.createdAt).getTime() >= hace30) ultimos30++;
    }
    const lineas = [
      `Viajes de «${nombre.trim()}»: ${filas.length} en total, ${ultimos30} en los últimos 30 días.`,
      'Por tipo: ' + Object.entries(porTipo).map(([t, n]) => `${TIPO_TEXTO[t] ?? t}: ${n}`).join(', '),
      'Por rol: ' + Object.entries(porRol).filter(([, n]) => n > 0).map(([r, n]) => `${r}: ${n}`).join(', '),
      'Los últimos viajes:',
    ];
    for (const c of filas.slice(0, 5)) {
      lineas.push(
        `- ${fechaEc(c.fechaHoraSalida ?? c.createdAt)}: guía ${c.numeroGuia} (${TIPO_TEXTO[c.tipoCustodia] ?? c.tipoCustodia}, ${ESTADO_TEXTO[c.estado] ?? c.estado}), cliente ${c.cliente || 'sin cliente'}`,
      );
    }
    return lineas.join('\n');
  }

  /** Desde cuándo registra viajes un guardia (o, sin nombre, el primer viaje de la empresa). */
  async antiguedad(companyId: number, nombre?: string): Promise<string> {
    if (!nombre?.trim()) {
      const primero = await this.prisma.custodia.findFirst({
        where: { companyId },
        orderBy: { createdAt: 'asc' },
      });
      if (!primero) return 'No hay custodias registradas aún en el sistema.';
      const total = await this.prisma.custodia.count({ where: { companyId } });
      return `Primer viaje registrado en el sistema: guía ${primero.numeroGuia} (${TIPO_TEXTO[primero.tipoCustodia] ?? primero.tipoCustodia}) el ${fechaEc(primero.createdAt)}. Total de viajes registrados: ${total}. Para consultar a un guardia en concreto hace falta su nombre o cédula.`;
    }

    const where = { companyId, OR: this.condicionesDePersona(nombre) };
    const [primero, total, carpeta] = await Promise.all([
      this.prisma.custodia.findFirst({ where, orderBy: { createdAt: 'asc' } }),
      this.prisma.custodia.count({ where }),
      this.prisma.employeeDriveFolder.findFirst({
        where: {
          companyId,
          folderType: 'CUSTODIAS',
          OR: [
            { employeeName: { contains: nombre.trim(), mode: 'insensitive' } },
            { cedula: nombre.trim() },
          ],
        },
      }),
    ]);
    if (!primero && !carpeta) return `No encuentro a «${nombre.trim()}» en el padrón de custodios ni en los viajes.`;
    if (!primero) {
      return `${carpeta!.employeeName} está en el padrón de custodios, pero todavía no tiene viajes registrados.`;
    }
    const desde = primero.createdAt;
    return [
      `${carpeta?.employeeName ?? nombre.trim()} lleva registrado en viajes ${tiempoDesde(desde)} (desde el ${fechaEc(desde)}).`,
      `Su primer viaje registrado fue la guía ${primero.numeroGuia} (${TIPO_TEXTO[primero.tipoCustodia] ?? primero.tipoCustodia}) el ${fechaEc(primero.createdAt)}.`,
      `Total de viajes asociados: ${total}.`,
    ].join('\n');
  }

  /** Placas más usadas en viajes de Puerto este mes. */
  async placasPuerto(companyId: number): Promise<string> {
    const filas = await this.prisma.custodia.findMany({
      where: { companyId, tipoCustodia: 'PUERTO', createdAt: { gte: inicioDeMes() } },
      select: { placa: true },
    });
    if (filas.length === 0) return 'No hay viajes tipo Puerto registrados este mes.';
    const cuenta = new Map<string, number>();
    for (const f of filas) {
      const p = f.placa?.trim() || 'SIN PLACA';
      cuenta.set(p, (cuenta.get(p) ?? 0) + 1);
    }
    const ranking = [...cuenta.entries()].sort((a, b) => b[1] - a[1]);
    return [
      `Viajes tipo Puerto este mes: ${filas.length}. Placa más usada: ${ranking[0][0]} (${ranking[0][1]} viaje(s)).`,
      'Ranking del mes:',
      ...ranking.slice(0, 5).map(([placa, n], i) => `${i + 1}. ${placa}: ${n} viaje(s)`),
    ].join('\n');
  }

  /** Custodios con más viajes de Hacienda en los últimos 30 días. */
  async topHacienda(companyId: number): Promise<string> {
    const filas = await this.prisma.custodia.findMany({
      where: {
        companyId,
        tipoCustodia: 'HACIENDA',
        createdAt: { gte: new Date(Date.now() - 30 * DIA_MS) },
      },
      select: { custodio1Name: true, custodio2Name: true, custodio3Name: true, custodio4Name: true },
    });
    if (filas.length === 0) return 'No hay viajes de Hacienda registrados en los últimos 30 días.';
    const cuenta = new Map<string, number>();
    for (const f of filas) {
      for (const n of [f.custodio1Name, f.custodio2Name, f.custodio3Name, f.custodio4Name]) {
        const nombre = n?.trim();
        if (nombre) cuenta.set(nombre, (cuenta.get(nombre) ?? 0) + 1);
      }
    }
    const ranking = [...cuenta.entries()].sort((a, b) => b[1] - a[1]);
    return [
      `Viajes de Hacienda en los últimos 30 días: ${filas.length}. Custodio con más viajes: ${ranking[0][0]} (${ranking[0][1]}).`,
      'Top custodios:',
      ...ranking.slice(0, 5).map(([n, v], i) => `${i + 1}. ${n}: ${v} viaje(s) como custodio`),
    ].join('\n');
  }
}
