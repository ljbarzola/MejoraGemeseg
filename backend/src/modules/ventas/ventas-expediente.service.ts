import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  calcularEstadoContrato,
  hoyEcuador,
} from './agreement-status.util';
import { ETIQUETA_CICLO } from './client-lifecycle.util';
import { ETIQUETA_ACTIVIDAD } from './dto/client.dto';
import { FECHA_INICIO_HISTORIAL, VentasAnaliticaService } from './ventas-analitica.service';
import { VentasCicloService } from './ventas-ciclo.service';
import { diasEntre } from './ventas-metricas.util';
import { ETIQUETA_KIND, type MotivoKind } from './ventas-motivos.service';

// Expediente de un cliente: todo lo que el sistema sabe de él, con fechas y
// marcas de evidencia ([#tipo:id]), para que el Agente de Ventas pueda explicar
// qué pasó SIN inventar. Es texto a propósito: lo lee el modelo, y cada marca se
// verifica después contra este mismo texto (ver verificarCitas en ai/).
//
// Regla de oro: lo que no está registrado se dice («no consta»). Los cambios de
// responsable, por ejemplo, no se guardan hoy y se dice así.

const DIA_MS = 24 * 60 * 60 * 1000;
const MAX_ACTIVIDADES = 20;
const MAX_CAMBIOS_POR_OPORTUNIDAD = 8;
const MAX_TEXTO_ACTIVIDAD = 220;
const SILENCIO_LARGO_DIAS = 21;

const norm = (s: string | null | undefined) =>
  (s || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();

const fecha = (d: Date | string | null | undefined): string => {
  if (!d) return '—';
  const s = typeof d === 'string' ? d : d.toISOString();
  const [y, m, dd] = s.slice(0, 10).split('-');
  return `${dd}/${m}/${y}`;
};
const dia = (d: Date) => d.toISOString().slice(0, 10);
// Los instantes (createdAt, closedAt…) se guardan en UTC: de noche en Ecuador (UTC-5) ya son «mañana» en UTC y la
// fecha salía un día adelantada. Las columnas de solo-día (startDate, endDate, quotedAt…) NO se convierten: usan fecha().
const fechaHora = (d: Date | null | undefined): string => (d ? fecha(hoyEcuador(d)) : '—');
const diaUtc = (s: string) => new Date(`${s}T00:00:00.000Z`);
const dinero = (v: unknown): string =>
  v === null || v === undefined
    ? 'no registrado'
    : `$${Number(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const recorte = (t: string, n: number) => {
  const limpio = t.replace(/\s+/g, ' ').trim();
  return limpio.length > n ? `${limpio.slice(0, n - 1)}…` : limpio;
};
const dias = (n: number) => `${Math.round(n * 10) / 10} día${Math.round(n * 10) / 10 === 1 ? '' : 's'}`;

const ETIQUETA_SOURCE: Record<string, string> = {
  CLIENTE: 'lo dijo el cliente',
  VENDEDOR: 'suposición del vendedor, no confirmada por el cliente',
};

export interface ResultadoExpediente {
  estado: 'OK' | 'NO_ENCONTRADO' | 'AMBIGUO';
  texto: string;
  clienteId?: number;
}

@Injectable()
export class VentasExpedienteService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly analitica: VentasAnaliticaService,
    private readonly ciclos: VentasCicloService,
  ) {}

  private async buscar(companyId: number, texto: string) {
    const q = norm(texto);
    if (!q) return [];
    const clientes = await this.prisma.salesClient.findMany({
      where: { companyId },
      select: { id: true, name: true, ruc: true },
    });
    const exactos = clientes.filter((c) => norm(c.name) === q || (c.ruc && c.ruc.trim() === texto.trim()));
    if (exactos.length > 0) return exactos;
    return clientes.filter((c) => norm(c.name).includes(q));
  }

  async armar(companyId: number, texto: string): Promise<ResultadoExpediente> {
    const candidatos = await this.buscar(companyId, texto);
    if (candidatos.length === 0) {
      return {
        estado: 'NO_ENCONTRADO',
        texto: `No encontré a nadie en el Directorio que se parezca a «${texto}». Revisa el nombre o prueba con el RUC.`,
      };
    }
    if (candidatos.length > 1) {
      const lista = candidatos.slice(0, 8).map((c) => `- ${c.name}`).join('\n');
      return {
        estado: 'AMBIGUO',
        texto: `Hay ${candidatos.length} registros del Directorio que se parecen a «${texto}». Pregunta cuál de ellos:\n${lista}${candidatos.length > 8 ? '\n- … y más' : ''}`,
      };
    }
    return { estado: 'OK', clienteId: candidatos[0].id, texto: await this.construir(companyId, candidatos[0].id) };
  }

  // Expediente de un cliente conocido por su id (botón «Preguntar al agente» de la ficha): no hay
  // nada que buscar ni desambiguar. Un cliente de otra empresa no se encuentra.
  async armarPorId(companyId: number, clienteId: number): Promise<ResultadoExpediente> {
    const existe = await this.prisma.salesClient.findFirst({
      where: { id: clienteId, companyId },
      select: { id: true },
    });
    if (!existe) {
      return {
        estado: 'NO_ENCONTRADO',
        texto: 'No encontré a esa empresa o persona en el Directorio: puede que ya no exista.',
      };
    }
    return { estado: 'OK', clienteId, texto: await this.construir(companyId, clienteId) };
  }

  private async construir(companyId: number, clienteId: number): Promise<string> {
    const hoy = hoyEcuador();
    const hoyD = diaUtc(hoy);
    const [cliente, opps, actividades, contratos, motivos, documentos, ciclo, velocidad, usuarios, incidentesContrato, etapas] =
      await Promise.all([
        this.prisma.salesClient.findFirstOrThrow({
          where: { id: clienteId, companyId },
          include: { referredBy: { select: { fullName: true } }, assignedUser: { select: { fullName: true } } },
        }),
        this.prisma.salesOpportunity.findMany({
          where: { companyId, salesClientId: clienteId },
          include: {
            services: { include: { service: { select: { name: true } } } },
            stageChanges: { orderBy: { createdAt: 'asc' } },
          },
          orderBy: { receivedAt: 'asc' },
        }),
        this.prisma.salesClientActivity.findMany({
          where: { companyId, salesClientId: clienteId },
          orderBy: { createdAt: 'asc' },
        }),
        this.prisma.salesAgreement.findMany({
          where: { companyId, salesClientId: clienteId },
          include: { services: { include: { service: { select: { id: true, name: true } } } }, _count: { select: { documents: true } } },
          orderBy: [{ startDate: 'asc' }, { id: 'asc' }],
        }),
        this.prisma.salesReasonEntry.findMany({
          where: { companyId, salesClientId: clienteId },
          orderBy: { createdAt: 'asc' },
        }),
        this.prisma.salesContract.findMany({
          where: { companyId, salesClientId: clienteId },
          select: { id: true, status: true, signedAt: true, sentAt: true },
        }),
        this.ciclos.calcular(companyId, [clienteId]),
        this.analitica.velocidadEmpresa(companyId),
        this.prisma.user.findMany({ where: { companyId }, select: { id: true, fullName: true } }),
        // Desde 2026-10-18 los incidentes y la conversación de salida se anotan en el contrato.
        this.prisma.salesAgreementIncident.findMany({
          where: { companyId, agreement: { salesClientId: clienteId } },
          orderBy: [{ occurredAt: 'asc' }, { id: 'asc' }],
        }),
        // Nombre de cada etapa tal como se ve en pantalla (en los datos van sin claves internas).
        this.prisma.salesClientStage.findMany({ where: { companyId }, select: { key: true, label: true } }),
      ]);
    const etiquetaEtapa = new Map(etapas.map((e) => [e.key, e.label]));
    const etapaTxt = (key: string | null | undefined) => (key ? (etiquetaEtapa.get(key) ?? key) : 'sin etapa');
    const nombreUsuario = new Map(usuarios.map((u) => [u.id, u.fullName]));
    const cicloCliente = ciclo.get(clienteId);
    const motivosPorOpp = new Map<number, typeof motivos>();
    const motivosPorContrato = new Map<number, typeof motivos>();
    for (const m of motivos) {
      if (m.opportunityId) motivosPorOpp.set(m.opportunityId, [...(motivosPorOpp.get(m.opportunityId) ?? []), m]);
      if (m.agreementId) motivosPorContrato.set(m.agreementId, [...(motivosPorContrato.get(m.agreementId) ?? []), m]);
    }

    const lineaMotivo = (m: (typeof motivos)[number]) =>
      `${ETIQUETA_KIND[m.kind as MotivoKind] ?? m.kind}: «${m.reasonLabel}»` +
      (m.source ? ` (${ETIQUETA_SOURCE[m.source] ?? m.source})` : ' (sin información de quién lo dijo)') +
      (m.comment ? ` — comentario: «${recorte(m.comment, 240)}»` : '') +
      ` — registrado el ${fechaHora(m.createdAt)} [#motivo:${m.id}]`;

    const noConsta: string[] = [];
    const out: string[] = [];

    // ---- encabezado ----
    out.push(`EXPEDIENTE DEL CLIENTE: ${cliente.name} [#cliente:${cliente.id}]`);
    out.push(
      `Ciclo de vida hoy: ${cicloCliente ? ETIQUETA_CICLO[cicloCliente.ciclo] : 'no calculado'}` +
        (cicloCliente?.razones.length ? ` (${cicloCliente.razones.join('; ')})` : '') +
        '.',
    );
    const extra = (cliente.extra ?? {}) as Record<string, string>;
    out.push(
      `Registrado el ${fechaHora(cliente.createdAt)}. Fuente: ${extra.fuente || 'no consta'}. ` +
        `Servicio de interés inicial: ${extra.servicio_requerido || 'no consta'}. ` +
        `Responsable actual: ${cliente.assignedUser?.fullName || 'sin responsable'}. ` +
        (cliente.referredBy?.fullName ? `Referido por: ${cliente.referredBy.fullName}.` : 'Nadie lo refirió.'),
    );

    // ---- oportunidades ----
    out.push('');
    out.push(`OPORTUNIDADES (${opps.length}):`);
    if (opps.length === 0) {
      out.push('- Este cliente no tiene oportunidades registradas.');
      noConsta.push('No hay ninguna oportunidad registrada: no consta cómo fue su proceso de venta.');
    }
    const inicioHistorial = diaUtc(FECHA_INICIO_HISTORIAL);
    for (const [i, o] of opps.entries()) {
      const servicios = o.services.map((s) => s.service.name).join(', ') || 'servicio no indicado';
      const nombreOpp = o.title || o.services.map((s) => s.service.name).join(', ') || 'sin título ni servicio';
      const resultado = o.outcome === 'GANADA' ? 'Ganada' : o.outcome === 'PERDIDA' ? 'Perdida' : o.closedAt ? 'cerrada' : 'abierta';
      out.push(
        `- [#opp:${o.id}] Oportunidad ${i + 1} de ${opps.length}: ${o.title ? `«${o.title}» · ` : ''}servicios: ${servicios} · llegó el ${fechaHora(o.receivedAt)} (${o.originType}${o.source ? `, fuente ${o.source}` : ''}) · etapa actual: ${etapaTxt(o.status)} · ${resultado}` +
          (o.closedAt ? ` el ${fechaHora(o.closedAt)}` : '') +
          ` · monto cotizado: ${dinero(o.quotedAmount)}${o.quotedAt ? ` (cotizada el ${fecha(o.quotedAt)})` : ''}`,
      );

      const historialCompleto = o.originType !== 'MIGRADA' || o.receivedAt >= inicioHistorial;
      const leido = o.stageChanges.find((c) => c.toStatus === 'LEIDO')?.createdAt;
      const cot = o.stageChanges.find((c) => c.toStatus === 'COTIZADO')?.createdAt;
      const quotedAt = o.quotedAt ? new Date(`${dia(o.quotedAt)}T12:00:00.000Z`) : null;
      const marcaCot = cot && quotedAt ? (cot < quotedAt ? cot : quotedAt) : (cot ?? quotedAt);
      if (historialCompleto || quotedAt) {
        const partes: string[] = [];
        if (leido && historialCompleto) {
          partes.push(`primera revisión a los ${dias(diasEntre(o.receivedAt, leido))}`);
        }
        if (marcaCot) {
          const d = Math.max(0, diasEntre(o.receivedAt, marcaCot));
          const ref = velocidad.cotizacionDias;
          let juicio = '';
          // Una mediana de menos de 1 día no sirve de referencia (casi siempre son
          // pruebas o cargas retroactivas): se dice que no hay comparación útil.
          if (ref.mediana !== null && ref.mediana >= 1) {
            const poca = ref.pocasMuestras ? `, referencia con pocas muestras (n=${ref.n})` : '';
            if (!ref.pocasMuestras && ref.p75 !== null && d > ref.p75) juicio = ` — MÁS LENTA que la mayoría de la empresa (mediana ${dias(ref.mediana)}, 75% se cotiza en ${dias(ref.p75)} o menos, n=${ref.n})`;
            else if (d > 2 * ref.mediana && d > 3) juicio = ` — más del doble de la mediana de la empresa (${dias(ref.mediana)}${poca})`;
            else juicio = ` — dentro de lo normal frente a la mediana de la empresa (${dias(ref.mediana)}${poca})`;
          } else {
            juicio = ' — no hay referencia de la empresa para comparar';
          }
          partes.push(`cotizada a los ${dias(d)} de llegar${juicio}`);
        } else if (o.outcome === 'PERDIDA' || o.closedAt) {
          partes.push('nunca llegó a cotizarse según el historial');
        }
        if (partes.length) out.push(`    · Velocidad: ${partes.join('; ')}.`);
      } else {
        out.push(`    · Velocidad: no se puede medir (el historial de etapas empezó el ${fecha(FECHA_INICIO_HISTORIAL)} y esta oportunidad es anterior).`);
        noConsta.push(`Oportunidad ${i + 1} de ${opps.length} (${nombreOpp}): anterior al ${fecha(FECHA_INICIO_HISTORIAL)}, no consta cuánto tardó en responderse ni cotizarse.`);
      }
      const cambios = o.stageChanges.slice(-MAX_CAMBIOS_POR_OPORTUNIDAD);
      if (cambios.length) {
        out.push(
          `    · Cambios de etapa: ${cambios
            .map((c) => `${fechaHora(c.createdAt)} ${c.fromStatus ? etapaTxt(c.fromStatus) : 'llegada'} → ${etapaTxt(c.toStatus)}`)
            .join('; ')}.`,
        );
      }
      const ms = motivosPorOpp.get(o.id) ?? [];
      for (const m of ms) out.push(`    · ${lineaMotivo(m)}`);
      if (o.outcome === 'PERDIDA' && ms.length === 0) {
        out.push('    · Motivo de pérdida: no se registró.');
        noConsta.push(`Oportunidad ${i + 1} de ${opps.length} (${nombreOpp}): se perdió pero no se registró el motivo.`);
      }
    }

    // ---- contratos ----
    out.push('');
    out.push(`CONTRATOS (${contratos.length}):`);
    if (contratos.length === 0) out.push('- Este cliente no tiene contratos registrados.');
    let haContratadoServicioAntes = false;
    const nombreContrato = (c: (typeof contratos)[number]) =>
      c.title || c.services.map((s) => s.service.name).join(', ') || 'sin título';
    for (const c of contratos) {
      const estado = calcularEstadoContrato(c);
      const servicios = c.services.map((s) => s.service.name);
      let estadoTxt: string = estado;
      if (estado === 'VENCIDO' && c.endDate) {
        const d = Math.round((hoyD.getTime() - diaUtc(dia(c.endDate)).getTime()) / DIA_MS);
        estadoTxt = `VENCIDO hace ${d} día${d === 1 ? '' : 's'} (gracia de ${c.graceDays} días${d <= c.graceDays ? ', todavía dentro' : ', ya pasó'})`;
      } else if (estado === 'CANCELADO') {
        estadoTxt = `CANCELADO${c.cancelledAt ? ` el ${fecha(c.cancelledAt)}` : ''}`;
      }
      if (c.kind === 'PRODUCTO') {
        out.push(
          `- [#contrato:${c.id}] ${c.title ? `«${c.title}» · ` : ''}VENTA DE PRODUCTO (única, no se renueva) del ${fecha(c.startDate)} · ${estadoTxt}${c.deliveredAt ? ` el ${fecha(c.deliveredAt)}` : ''} · productos: ${servicios.join(', ') || 'ninguno'} · valor total: ${dinero(c.totalValue)}${c.warrantyUntil ? ` · garantía hasta ${fecha(c.warrantyUntil)}` : ''} · documentos: ${c._count.documents}`,
        );
        const msP = motivosPorContrato.get(c.id) ?? [];
        for (const m of msP) out.push(`    · ${lineaMotivo(m)}`);
        if (estado === 'CANCELADO' && !msP.some((m) => m.kind === 'CONTRATO_CANCELADO')) {
          noConsta.push(`Contrato «${nombreContrato(c)}»: se canceló y no se registró el motivo.`);
        }
        continue;
      }
      out.push(
        `- [#contrato:${c.id}] ${c.title ? `«${c.title}» · ` : ''}desde ${fecha(c.startDate)} hasta ${c.endDate ? fecha(c.endDate) : 'sin fecha de fin'} · ${estadoTxt} · servicios: ${servicios.join(', ') || 'ninguno'} · valor mensual: ${dinero(c.monthlyValue)} · documentos: ${c._count.documents}`,
      );
      // Solo se compara con el contrato que ESTE renueva. Antes se comparaba con el anterior en el
      // tiempo, y un contrato adicional (otro servicio contratado aparte) parecía haber «quitado»
      // los servicios del primero: el agente explicaba una baja que nunca existió.
      const anterior = c.renewedFromId
        ? (contratos.find((x) => x.id === c.renewedFromId && x.kind !== 'PRODUCTO') ?? null)
        : null;
      if (!anterior && haContratadoServicioAntes) {
        out.push('    · No renueva a otro contrato: es un contrato aparte (por ejemplo, un servicio adicional), no un cambio frente a los anteriores.');
      }
      haContratadoServicioAntes = true;
      if (anterior) {
        const antes = anterior.services.map((s) => s.service.name);
        const quitados = antes.filter((n) => !servicios.includes(n));
        const agregados = servicios.filter((n) => !antes.includes(n));
        const cambios: string[] = [];
        if (quitados.length) cambios.push(`servicios QUITADOS: ${quitados.join(', ')}`);
        if (agregados.length) cambios.push(`servicios agregados: ${agregados.join(', ')}`);
        if (anterior.monthlyValue !== null && c.monthlyValue !== null) {
          const a = Number(anterior.monthlyValue);
          const b = Number(c.monthlyValue);
          if (a !== b) cambios.push(`valor mensual de ${dinero(a)} a ${dinero(b)} (${b < a ? 'baja' : 'sube'} ${Math.abs(Math.round(((b - a) / a) * 100))}%)`);
        } else if (anterior.monthlyValue === null || c.monthlyValue === null) {
          noConsta.push(`Contrato «${nombreContrato(c)}»: falta el valor mensual en este o en el anterior, no se puede comparar el valor.`);
        }
        out.push(`    · Frente al contrato anterior: ${cambios.length ? cambios.join('; ') : 'sin cambios de servicios ni de valor'}.`);
      }
      const ms = motivosPorContrato.get(c.id) ?? [];
      for (const m of ms) out.push(`    · ${lineaMotivo(m)}`);
      if (estado === 'VENCIDO' && !ms.some((m) => m.kind === 'CONTRATO_NO_RENOVADO')) {
        out.push('    · Por qué no renovó: no se registró.');
        noConsta.push(`Contrato «${nombreContrato(c)}»: venció sin renovarse y no se registró por qué.`);
      }
      if (estado === 'CANCELADO' && !ms.some((m) => m.kind === 'CONTRATO_CANCELADO')) {
        noConsta.push(`Contrato «${nombreContrato(c)}»: se canceló y no se registró el motivo.`);
      }
    }
    const firmados = documentos.filter((d) => d.status === 'SIGNED').length;
    if (documentos.length) out.push(`Documentos de Documentación: ${documentos.length} (${firmados} firmados).`);

    // ---- actividad ----
    out.push('');
    const eventos = [
      ...actividades.map((a) => ({ at: a.createdAt })),
      ...opps.flatMap((o) => o.stageChanges.map((c) => ({ at: c.createdAt }))),
    ].sort((a, b) => a.at.getTime() - b.at.getTime());
    out.push(`ACTIVIDAD REGISTRADA (${actividades.length} notas y actividades):`);
    const recientes = actividades.slice(-MAX_ACTIVIDADES);
    if (actividades.length > recientes.length) out.push(`(se muestran las últimas ${recientes.length} de ${actividades.length})`);
    for (const a of recientes) {
      const tipo = a.type === 'OTRO' ? a.otherLabel || 'Otro' : (ETIQUETA_ACTIVIDAD[a.type] ?? a.type);
      out.push(`- ${fechaHora(a.createdAt)} [#act:${a.id}] ${tipo} (${nombreUsuario.get(a.createdBy) ?? 'alguien'}): ${recorte(a.text, MAX_TEXTO_ACTIVIDAD)}`);
    }
    if (actividades.length === 0) {
      out.push('- No hay notas ni actividades registradas.');
      noConsta.push('No hay ninguna nota, llamada ni reunión registrada con este cliente.');
    }

    // silencios
    let mayor = { d: 0, desde: '', hasta: '' };
    for (let i = 1; i < eventos.length; i++) {
      const d = diasEntre(eventos[i - 1].at, eventos[i].at);
      if (d > mayor.d) mayor = { d, desde: fechaHora(eventos[i - 1].at), hasta: fechaHora(eventos[i].at) };
    }
    const ultimo = eventos.length ? eventos[eventos.length - 1].at : cliente.createdAt;
    const desdeUltimo = Math.max(0, Math.floor((hoyD.getTime() - diaUtc(hoyEcuador(ultimo)).getTime()) / DIA_MS));
    out.push(
      `Silencios: ${mayor.d > SILENCIO_LARGO_DIAS ? `el mayor fue de ${dias(mayor.d)} sin ningún movimiento (entre ${mayor.desde} y ${mayor.hasta})` : `no hubo silencios de más de ${SILENCIO_LARGO_DIAS} días entre movimientos registrados`}. Último movimiento registrado: ${fechaHora(ultimo)} (hace ${desdeUltimo} día${desdeUltimo === 1 ? '' : 's'}).`,
    );

    // lo operativo: quejas e incidentes
    // Las quejas siguen en el Historial del cliente; los incidentes y la conversación de salida
    // viven en cada contrato (los registros viejos del Historial se siguen leyendo).
    const tituloContrato = new Map(contratos.map((c) => [c.id, nombreContrato(c)]));
    const operativas = actividades.filter((a) => a.type === 'QUEJA' || a.type === 'INCIDENTE_SERVICIO');
    const incidentes = incidentesContrato.filter((i) => i.type === 'INCIDENTE_SERVICIO');
    if (operativas.length || incidentes.length) {
      out.push(`QUEJAS E INCIDENTES DEL SERVICIO (${operativas.length + incidentes.length}):`);
      for (const a of operativas) {
        out.push(`- ${fechaHora(a.createdAt)} [#act:${a.id}] ${ETIQUETA_ACTIVIDAD[a.type]}: ${recorte(a.text, MAX_TEXTO_ACTIVIDAD)}`);
      }
      for (const i of incidentes) {
        out.push(`- ${fecha(i.occurredAt)} Incidente del servicio en «${tituloContrato.get(i.agreementId)}»: ${recorte(i.text, MAX_TEXTO_ACTIVIDAD)}`);
      }
    } else {
      out.push('Quejas e incidentes del servicio: ninguno registrado (no significa que no hayan ocurrido: solo que nadie los anotó).');
    }
    const salida = actividades.filter((a) => a.type === 'CONVERSACION_SALIDA');
    const salidaContrato = incidentesContrato.filter((i) => i.type === 'CONVERSACION_SALIDA');
    if (salida.length || salidaContrato.length) {
      for (const a of salida) out.push(`Conversación de salida ${fechaHora(a.createdAt)} [#act:${a.id}]: ${recorte(a.text, 400)}`);
      for (const i of salidaContrato) out.push(`Conversación de salida ${fecha(i.occurredAt)} sobre «${tituloContrato.get(i.agreementId)}»: ${recorte(i.text, 400)}`);
    } else if (cicloCliente && (cicloCliente.ciclo === 'EX_CLIENTE' || cicloCliente.ciclo === 'PERDIDO')) {
      out.push('Conversación de salida: no se registró.');
      noConsta.push('No hay conversación de salida con el cliente: nadie anotó qué dijo el propio cliente sobre por qué se fue.');
    }

    // seguimiento
    if (cliente.nextActionText || cliente.nextActionDate) {
      const vencido = cliente.nextActionDate && dia(cliente.nextActionDate) < hoy;
      out.push(`Siguiente paso pendiente: ${cliente.nextActionText || 'sin texto'}${cliente.nextActionDate ? ` para el ${fecha(cliente.nextActionDate)}${vencido ? ' (VENCIDO)' : ''}` : ''}.`);
    }

    // ---- lo que no consta ----
    out.push('');
    out.push('LO QUE NO CONSTA EN EL SISTEMA:');
    for (const n of noConsta) out.push(`- ${n}`);
    if (noConsta.length === 0) out.push('- Nada relevante.');
    out.push('Nota fija (menciónala solo si preguntan quién atendió antes): el sistema no guarda los cambios de responsable.');

    return out.join('\n');
  }
}
