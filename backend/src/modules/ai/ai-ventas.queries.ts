import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { VentasClientesService } from '../ventas/ventas-clientes.service';

// Consultas de Ventas del asistente de IA. Todas leen Clientes y Contratos,
// nunca Leads/Visitas (esos submódulos están "Próximamente" y el asistente no
// debe saber que existen). Los números de panorama, estancados, responsables
// y periodos salen de VentasClientesService.getDashboard: así el asistente y
// el Dashboard dicen siempre lo mismo. Cada método devuelve texto plano que
// después el modelo redacta; no hay dinero porque los clientes no tienen monto.
//
// Los parámetros llegan del modelo como texto libre ([INTENCION: x(clave:valor)]),
// así que todo se normaliza y se acota: puede venir mal escrito, con tildes de
// menos o con valores que no existen.

const MAX_LINEAS = 15;
const MAX_TEXTO = 160;
const ZONA = 'America/Guayaquil';

const ESTADOS_CONTRATO: Record<string, string> = {
  DRAFT: 'Borrador',
  GENERATING: 'Generando',
  READY: 'Listo',
  SENT: 'En firma',
  SIGNED: 'Firmado',
  CANCELLED: 'Cancelado',
};

export type RangoPeriodo = 'semana' | 'mes' | 'mes_pasado' | '90';

// Sin tildes y en minúsculas, para comparar lo que escribe el modelo o el
// usuario ("Clinica", "clínica") con lo guardado.
export const normalizar = (s: string): string =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();

// Hoy en Ecuador como 'YYYY-MM-DD' (nextActionDate es solo-día).
export const diaHoyEcuador = (): string =>
  new Date().toLocaleDateString('en-CA', { timeZone: ZONA });

export const formatoDia = (iso: string | Date | null | undefined): string => {
  if (!iso) return '';
  const s = typeof iso === 'string' ? iso.slice(0, 10) : iso.toISOString().slice(0, 10);
  return s.split('-').reverse().join('/');
};

const recortar = (s: string, max = MAX_TEXTO) => (s.length > max ? `${s.slice(0, max - 1)}…` : s);

// Valor de un parámetro del modelo: texto corto y limpio, o undefined.
export const textoParam = (v: unknown): string | undefined => {
  if (typeof v !== 'string') return undefined;
  const limpio = v.trim().slice(0, 80);
  return limpio || undefined;
};

// Convierte "semana" | "mes" | "mes pasado" | "90"... en fechas, a partir del
// día de hoy. Cualquier otra cosa equivale a "mes".
export function rangoDesdeParam(
  param: string | undefined,
  hoy: string,
): { desde: string; hasta: string; etiqueta: string; rango: RangoPeriodo } {
  const p = normalizar(param || '').replace(/\s+/g, '_');
  const d = new Date(`${hoy}T00:00:00.000Z`);
  const dia = (x: Date) => x.toISOString().slice(0, 10);
  const DIA_MS = 24 * 60 * 60 * 1000;

  if (p === 'semana' || p === 'esta_semana') {
    const lunes = new Date(d.getTime() - ((d.getUTCDay() + 6) % 7) * DIA_MS);
    return { desde: dia(lunes), hasta: hoy, etiqueta: 'esta semana', rango: 'semana' };
  }
  if (p === 'mes_pasado') {
    const ini = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 1, 1));
    const fin = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 0));
    return { desde: dia(ini), hasta: dia(fin), etiqueta: 'el mes pasado', rango: 'mes_pasado' };
  }
  if (p === '90' || p === 'ultimos_90_dias' || p === '90_dias') {
    return { desde: dia(new Date(d.getTime() - 89 * DIA_MS)), hasta: hoy, etiqueta: 'los últimos 90 días', rango: '90' };
  }
  return { desde: `${hoy.slice(0, 8)}01`, hasta: hoy, etiqueta: 'este mes', rango: 'mes' };
}

const masLineas = (total: number, mostradas: number) =>
  total > mostradas ? `\n…y ${total - mostradas} más (se muestran los primeros ${mostradas}).` : '';

@Injectable()
export class AiVentasQueries {
  constructor(
    private prisma: PrismaService,
    private clientes: VentasClientesService,
  ) {}

  // Mismo cálculo del Dashboard. `role: 'EMPLOYEE'` a propósito: aquí solo se
  // piden los alcances 'mine' y 'all', que no dependen del rol.
  private dashboard(
    companyId: number,
    userId: number,
    responsable: 'mine' | 'all',
    rango?: { desde: string; hasta: string },
  ) {
    return this.clientes.getDashboard(
      companyId,
      { userId, role: 'EMPLOYEE' },
      { responsable, hoy: diaHoyEcuador(), ...rango },
    );
  }

  async resumen(companyId: number, userId: number): Promise<string> {
    const [todos, mios] = await Promise.all([
      this.dashboard(companyId, userId, 'all'),
      this.dashboard(companyId, userId, 'mine'),
    ]);
    const total = todos.embudo.reduce((s, e) => s + e.count, 0);
    if (total === 0) return 'No hay clientes registrados.';

    const seg = (s: { vencidos: number; hoy: number; sinFecha: number }) =>
      `${s.vencidos} vencidos, ${s.hoy} para hoy, ${s.sinFecha} sin siguiente paso`;
    const sinResponsable = todos.porResponsable.find((r) => r.userId === null)?.activos ?? 0;
    const a = todos.aceptacion;

    return [
      `Clientes: ${total} en total, ${todos.seguimientos.activos} activos (no están en etapa final).`,
      `Clientes por etapa: ${todos.embudo.map((e) => `${e.label}: ${e.count}`).join(', ')}`,
      `Seguimientos de tus clientes activos: ${seg(mios.seguimientos)}`,
      `Seguimientos de todos los clientes activos de la empresa: ${seg(todos.seguimientos)}`,
      `Clientes activos sin responsable: ${sinResponsable}`,
      `Clientes estancados (más de ${todos.estancados.dias} días en la misma etapa): ${todos.estancados.total}`,
      `Nuevos este mes: ${todos.nuevos.total} (${todos.nuevos.referidos} por referido)`,
      a.tasa === null
        ? 'Aceptación: aún no hay clientes aceptados ni rechazados.'
        : `Aceptación: ${a.tasa}% (${a.aceptados} aceptados, ${a.rechazados} rechazados)`,
      `Contratos de clientes: ${todos.contratos.borrador} en borrador, ${todos.contratos.enFirma} en firma, ${todos.contratos.firmados} firmados; ${todos.contratos.aceptadosSinContrato} clientes aceptados sin contrato`,
    ].join('\n');
  }

  // A qué clientes debe dar seguimiento HOY quien pregunta: los suyos, no en
  // etapa final, con seguimiento vencido, para hoy o sin fecha.
  async clientesHoy(companyId: number, userId: number): Promise<string> {
    const hoy = diaHoyEcuador();
    const hoyFecha = new Date(`${hoy}T00:00:00.000Z`);
    const stages = await this.prisma.salesClientStage.findMany({ where: { companyId } });
    const finales = stages.filter((s) => s.isFinal).map((s) => s.key);
    const etapa = new Map(stages.map((s) => [s.key, s.label]));

    const filas = await this.prisma.salesClient.findMany({
      where: {
        companyId,
        assignedUserId: userId,
        OR: [{ status: null }, { status: { notIn: finales } }],
      },
      select: { name: true, status: true, nextActionText: true, nextActionDate: true },
    });
    const pendientes = filas
      .filter((c) => !c.nextActionDate || c.nextActionDate <= hoyFecha)
      .map((c) => {
        const rango = !c.nextActionDate ? 2 : c.nextActionDate < hoyFecha ? 0 : 1;
        return { ...c, rango };
      })
      .sort(
        (a, b) =>
          a.rango - b.rango ||
          (a.nextActionDate?.getTime() ?? 0) - (b.nextActionDate?.getTime() ?? 0) ||
          a.name.localeCompare(b.name, 'es'),
      );

    if (pendientes.length === 0) {
      return filas.length === 0
        ? 'No tienes clientes asignados.'
        : 'No tienes seguimientos para hoy ni atrasados: todos tus clientes activos tienen su siguiente paso en una fecha futura.';
    }
    const lineas = pendientes.slice(0, MAX_LINEAS).map((c) => {
      const cuando =
        c.rango === 0 ? `VENCIDO desde ${formatoDia(c.nextActionDate)}` : c.rango === 1 ? 'para HOY' : 'sin siguiente paso definido';
      const paso = c.nextActionText ? `${recortar(c.nextActionText, 100)} · ` : '';
      return `- ${c.name} (${(c.status && etapa.get(c.status)) || 'Sin etapa'}) — ${paso}${cuando}`;
    });
    return `Clientes que debes atender hoy (${pendientes.length}):\n${lineas.join('\n')}${masLineas(pendientes.length, MAX_LINEAS)}`;
  }

  async estancados(companyId: number, userId: number): Promise<string> {
    const d = await this.dashboard(companyId, userId, 'all');
    const { dias, total, lista } = d.estancados;
    if (total === 0) return `Ningún cliente activo lleva más de ${dias} días en la misma etapa.`;
    const lineas = lista.map((c) => `- ${c.name} (${c.etapa}) — ${c.dias} días en esa etapa — ${c.responsable || 'sin responsable'}`);
    return [
      `Clientes estancados (más de ${dias} días en la misma etapa): ${total}.`,
      lineas.join('\n') + masLineas(total, lista.length),
      'Aviso: los días salen del último cambio de etapa, que solo se guarda desde el 30/09/2026; para clientes anteriores se cuenta desde su registro, así que es aproximado.',
    ].join('\n');
  }

  async porResponsable(companyId: number, userId: number): Promise<string> {
    const d = await this.dashboard(companyId, userId, 'all');
    if (d.porResponsable.length === 0) return 'No hay clientes registrados.';
    const lineas = d.porResponsable.map(
      (r) => `- ${r.userId === null ? 'Sin responsable' : r.nombre}: ${r.activos} activos, ${r.vencidos} con seguimiento vencido, ${r.aceptados} aceptados`,
    );
    return `Clientes por responsable:\n${lineas.join('\n')}`;
  }

  async periodo(companyId: number, userId: number, rangoParam?: string): Promise<string> {
    const r = rangoDesdeParam(rangoParam, diaHoyEcuador());
    const d = await this.dashboard(companyId, userId, 'all', { desde: r.desde, hasta: r.hasta });
    const ref = d.referidos;
    const lineas = [
      `Periodo: ${r.etiqueta} (del ${formatoDia(r.desde)} al ${formatoDia(r.hasta)}).`,
      `Clientes nuevos: ${d.nuevos.total}, de los cuales ${d.nuevos.referidos} llegaron por referido.`,
      `Referidos recibidos: ${ref.recibidos} (${ref.sinAtender} sin atender, ${ref.aceptados} aceptados, ${ref.rechazados} rechazados).`,
    ];
    if (ref.top.length > 0) {
      lineas.push(`Quién más refiere: ${ref.top.map((t) => `${t.nombre} (${t.total})`).join(', ')}.`);
    }
    return lineas.join('\n');
  }

  // Ficha de un cliente: datos, etapa, siguiente paso, historial reciente y
  // contratos. Busca por parte del nombre o por RUC, sin importar tildes.
  async cliente(companyId: number, nombreParam?: string): Promise<string> {
    const q = normalizar(nombreParam || '');
    if (!q) return 'Necesito el nombre (o parte del nombre) del cliente para buscarlo.';

    const todos = await this.prisma.salesClient.findMany({
      where: { companyId },
      select: { id: true, name: true, ruc: true },
    });
    const candidatos = todos.filter((c) => normalizar(c.name).includes(q) || (c.ruc || '').includes(q));
    if (candidatos.length === 0) return `No encontré ningún cliente que coincida con "${nombreParam}".`;

    const exacto = candidatos.filter((c) => normalizar(c.name) === q);
    const elegidos = exacto.length === 1 ? exacto : candidatos;
    if (elegidos.length > 1) {
      return [
        `Hay ${elegidos.length} clientes que coinciden con "${nombreParam}"; pide al usuario que precise cuál:`,
        ...elegidos.slice(0, 8).map((c) => `- ${c.name}`),
        masLineas(elegidos.length, 8).trim(),
      ]
        .filter(Boolean)
        .join('\n');
    }

    const id = elegidos[0].id;
    const [c, stages, timeline] = await Promise.all([
      this.clientes.getClient(companyId, id),
      this.prisma.salesClientStage.findMany({ where: { companyId } }),
      this.clientes.getTimeline(companyId, id),
    ]);
    const etapa = stages.find((s) => s.key === c.status)?.label || 'Sin etapa';
    const final = stages.find((s) => s.key === c.status)?.isFinal ? ' (etapa final)' : '';

    const eventos = timeline.slice(0, 8).map((ev: any) => {
      const cuando = formatoDia(ev.at);
      const quien = ev.authorName ? ` — ${ev.authorName}` : '';
      if (ev.kind === 'actividad') {
        const tipo = ev.type === 'OTRO' ? ev.otherLabel || 'Otro' : String(ev.type).charAt(0) + String(ev.type).slice(1).toLowerCase();
        return `- ${cuando} ${tipo}${quien}: ${recortar(ev.text)}`;
      }
      if (ev.kind === 'etapa') return `- ${cuando} Cambió de etapa: ${ev.from?.label ?? 'inicio'} → ${ev.to?.label ?? '?'}${quien}`;
      if (ev.kind === 'contrato') return `- ${cuando} Contrato ${ev.contractNumber || `#${ev.contractId}`} ${ev.step === 'creado' ? 'creado' : ev.step === 'enviado' ? 'enviado a firma' : 'firmado'}`;
      return `- ${cuando} Cliente registrado${ev.referredByName ? ` (referido por ${ev.referredByName})` : ''}${quien}`;
    });

    const dato = (etiqueta: string, v?: string | null) => (v ? `${etiqueta}: ${v}` : '');
    return [
      `Cliente: ${c.name}`,
      `Etapa: ${etapa}${final}`,
      `Responsable: ${c.assignedUser?.fullName || 'sin asignar'}`,
      dato('Referido por', c.referredBy?.fullName),
      dato('Teléfono', c.phone),
      dato('Correo', c.email),
      dato('RUC', c.ruc),
      dato('Dirección', c.address),
      `Siguiente paso: ${c.nextActionText || 'sin definir'}${c.nextActionDate ? ` para el ${formatoDia(c.nextActionDate)}` : ''}`,
      dato('Observaciones', c.observaciones ? recortar(c.observaciones) : null),
      `Historial reciente:\n${eventos.join('\n')}`,
    ]
      .filter(Boolean)
      .join('\n');
  }

  // Lista de clientes con filtros opcionales. etapa = nombre o clave;
  // responsable = "yo", "sin" o parte del nombre; seguimiento = vencido|hoy|sin.
  async lista(
    companyId: number,
    userId: number,
    p: { etapa?: string; responsable?: string; seguimiento?: string },
  ): Promise<string> {
    const hoyFecha = new Date(`${diaHoyEcuador()}T00:00:00.000Z`);
    const [stages, clientes] = await Promise.all([
      this.prisma.salesClientStage.findMany({ where: { companyId } }),
      this.prisma.salesClient.findMany({
        where: { companyId },
        select: {
          name: true,
          status: true,
          assignedUserId: true,
          assignedUser: { select: { fullName: true } },
          nextActionText: true,
          nextActionDate: true,
        },
      }),
    ]);
    const etapaDe = new Map(stages.map((s) => [s.key, s]));
    const filtros: string[] = [];
    let filas = clientes;

    if (p.etapa) {
      const e = normalizar(p.etapa);
      const destino = stages.find((s) => normalizar(s.key) === e || normalizar(s.label) === e);
      if (!destino) {
        return `No existe una etapa llamada "${p.etapa}". Las etapas son: ${stages.map((s) => s.label).join(', ')}.`;
      }
      filas = filas.filter((c) => c.status === destino.key);
      filtros.push(`etapa ${destino.label}`);
    }

    if (p.responsable) {
      const r = normalizar(p.responsable);
      if (['yo', 'mio', 'mios', 'mis'].includes(r)) {
        filas = filas.filter((c) => c.assignedUserId === userId);
        filtros.push('asignados a ti');
      } else if (['sin', 'nadie', 'ninguno', 'sin_responsable', 'sin responsable'].includes(r)) {
        filas = filas.filter((c) => !c.assignedUserId);
        filtros.push('sin responsable');
      } else {
        filas = filas.filter((c) => c.assignedUser && normalizar(c.assignedUser.fullName).includes(r));
        filtros.push(`responsable "${p.responsable}"`);
      }
    }

    if (p.seguimiento) {
      const s = normalizar(p.seguimiento);
      const clave = s.startsWith('venc') ? 'vencido' : s === 'hoy' ? 'hoy' : s.startsWith('sin') ? 'sin' : null;
      if (!clave) return `El filtro de seguimiento "${p.seguimiento}" no es válido: usa vencido, hoy o sin.`;
      filas = filas.filter((c) => {
        if (c.status && etapaDe.get(c.status)?.isFinal) return false;
        if (clave === 'sin') return !c.nextActionDate;
        if (!c.nextActionDate) return false;
        return clave === 'vencido' ? c.nextActionDate < hoyFecha : c.nextActionDate.getTime() === hoyFecha.getTime();
      });
      filtros.push(`seguimiento ${clave === 'sin' ? 'sin definir' : clave === 'hoy' ? 'para hoy' : 'vencido'} (solo clientes activos)`);
    }

    const encabezado = filtros.length ? `Clientes con ${filtros.join(', ')}` : 'Clientes';
    if (filas.length === 0) return `${encabezado}: ninguno.`;

    const ordenadas = [...filas].sort((a, b) => a.name.localeCompare(b.name, 'es'));
    const lineas = ordenadas.slice(0, MAX_LINEAS).map((c) => {
      const paso = c.nextActionText
        ? ` — ${recortar(c.nextActionText, 80)}${c.nextActionDate ? ` (${formatoDia(c.nextActionDate)})` : ''}`
        : c.nextActionDate
          ? ` — siguiente paso para el ${formatoDia(c.nextActionDate)}`
          : '';
      return `- ${c.name} (${(c.status && etapaDe.get(c.status)?.label) || 'Sin etapa'}) — ${c.assignedUser?.fullName || 'sin responsable'}${paso}`;
    });
    return `${encabezado}: ${filas.length}.\n${lineas.join('\n')}${masLineas(filas.length, MAX_LINEAS)}`;
  }

  // Contratos de Ventas. estado = borrador | firma | firmados (opcional).
  async contratos(companyId: number, estadoParam?: string): Promise<string> {
    const e = normalizar(estadoParam || '');
    const grupo =
      e.startsWith('borr') ? { etiqueta: 'en borrador', estados: ['DRAFT', 'GENERATING', 'READY'] }
      : e.startsWith('firma') && e !== 'firmados' && e !== 'firmado' ? { etiqueta: 'en firma', estados: ['SENT'] }
      : e.startsWith('firmad') ? { etiqueta: 'firmados', estados: ['SIGNED'] }
      : null;
    if (estadoParam && !grupo) {
      return `El estado "${estadoParam}" no es válido: usa borrador, firma o firmados.`;
    }

    const where = { companyId, ...(grupo ? { status: { in: grupo.estados } } : { status: { not: 'CANCELLED' } }) };
    const [total, filas, porEstado] = await Promise.all([
      this.prisma.salesContract.count({ where }),
      this.prisma.salesContract.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: MAX_LINEAS,
        select: {
          id: true,
          contractNumber: true,
          clientName: true,
          status: true,
          sentAt: true,
          signedAt: true,
          createdAt: true,
          template: { select: { name: true } },
        },
      }),
      grupo
        ? Promise.resolve([])
        : this.prisma.salesContract.groupBy({ by: ['status'], where: { companyId }, _count: { id: true } }),
    ]);

    if (total === 0) return grupo ? `No hay contratos ${grupo.etiqueta}.` : 'No hay contratos registrados.';
    const lineas = filas.map((c) => {
      const cuando =
        c.status === 'SIGNED' && c.signedAt ? `firmado el ${formatoDia(c.signedAt)}`
        : c.status === 'SENT' && c.sentAt ? `enviado a firma el ${formatoDia(c.sentAt)}`
        : `creado el ${formatoDia(c.createdAt)}`;
      return `- ${c.contractNumber || `#${c.id}`} · ${c.clientName} · ${c.template?.name || 'sin plantilla'} · ${ESTADOS_CONTRATO[c.status] || c.status} (${cuando})`;
    });
    const resumen = grupo
      ? ''
      : `Por estado: ${porEstado.map((g) => `${ESTADOS_CONTRATO[g.status] || g.status}: ${g._count.id}`).join(', ')}.\n`;
    return `Contratos ${grupo ? grupo.etiqueta : '(sin contar los cancelados)'}: ${total}.\n${resumen}Más recientes:\n${lineas.join('\n')}${masLineas(total, filas.length)}`;
  }
}
