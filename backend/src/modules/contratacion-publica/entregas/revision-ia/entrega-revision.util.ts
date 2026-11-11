// Reglas del Agente Revisor de Entregas. El modelo SOLO describe lo que ve en el documento
// (si se lee, qué parece ser, si lleva firma o sello, qué fecha de vencimiento dice); lo que
// está bien o mal lo decide `evaluarEntrega`, código fijo y repetible. Nada de esto aprueba
// ni rechaza: una persona decide.

export type FirmaOSello = 'SI' | 'NO' | 'DUDOSO';

export interface LecturaEntrega {
  /** El documento se puede leer (no está borroso, cortado ni vacío). */
  legible: boolean;
  /** Qué parece ser, en pocas palabras («Certificado de antecedentes penales»). Solo informativo. */
  tipoDocumento: string | null;
  /** Un documento de ese tipo normalmente lleva firma o sello (certificados, oficios, planillas firmadas…). */
  seFirma: boolean;
  firmaOSello: FirmaOSello;
  /** Fecha de vencimiento o validez escrita en el propio documento, AAAA-MM-DD; null si no dice ninguna. */
  fechaVencimiento: string | null;
  /** Periodo que el propio documento dice cubrir («informe del 24 de agosto al 23 de septiembre»), AAAA-MM-DD. Los dos o ninguno. */
  periodoDesde: string | null;
  periodoHasta: string | null;
  observaciones: string | null;
}

/** El mes de la solicitud a la que se entregó el documento. */
export interface PeriodoSolicitud {
  anio: number;
  mes: number; // 1-12
  /** Fechas exactas que cubre la solicitud si su contrato va por ciclo (24 ago – 23 sep); sin ellas, el mes calendario. */
  desde?: string;
  hasta?: string;
  /** El ciclo en corto («24 ago – 23 sep»), para el mensaje. */
  etiqueta?: string | null;
}

export type EstadoRevisionIA = 'PARECE_CORRECTO' | 'REVISAR';

export interface Motivo {
  /** Para quien revisa («No se ve firma ni sello»). */
  texto: string;
  /** Frase lista para el motivo del rechazo, dirigida a quien entregó. */
  rechazo: string;
}

export interface ResultadoEvaluacion {
  estado: EstadoRevisionIA;
  motivos: Motivo[];
  /** Una línea para mostrar (la lista y el panel). */
  resumen: string;
  /** Motivo de rechazo propuesto (vacío si parece correcto). */
  mensajeRechazo: string;
}

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

/** '2026-11-06' → '6 de noviembre de 2026'. */
export function fechaLegible(iso: string): string {
  const [a, m, d] = iso.split('-').map(Number);
  return `${d} de ${MESES[m - 1]} de ${a}`;
}

const esFechaIso = (t: unknown): t is string => {
  if (typeof t !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(t)) return false;
  const [a, m, d] = t.split('-').map(Number);
  const f = new Date(Date.UTC(a, m - 1, d));
  return f.getUTCFullYear() === a && f.getUTCMonth() === m - 1 && f.getUTCDate() === d;
};

const texto = (v: unknown, max = 300): string | null => {
  if (typeof v !== 'string') return null;
  const t = v.replace(/\s+/g, ' ').trim();
  return t ? t.slice(0, max) : null;
};

/** Lo que devuelve el modelo, sin fiarse de su forma: cualquier campo raro cae al valor prudente. */
export function normalizarLecturaEntrega(crudo: unknown): LecturaEntrega {
  const o = (crudo && typeof crudo === 'object' ? crudo : {}) as Record<string, unknown>;
  const firma = typeof o.firmaOSello === 'string' ? o.firmaOSello.toUpperCase() : '';
  const periodoOk =
    esFechaIso(o.periodoDesde) && esFechaIso(o.periodoHasta) && o.periodoDesde <= o.periodoHasta;
  return {
    legible: o.legible === true,
    tipoDocumento: texto(o.tipoDocumento, 120),
    seFirma: o.seFirma === true,
    firmaOSello: firma === 'SI' || firma === 'NO' ? firma : 'DUDOSO',
    fechaVencimiento: esFechaIso(o.fechaVencimiento) ? o.fechaVencimiento : null,
    periodoDesde: periodoOk ? (o.periodoDesde as string) : null,
    periodoHasta: periodoOk ? (o.periodoHasta as string) : null,
    observaciones: texto(o.observaciones),
  };
}

/** Primer y último día del mes de la solicitud (AAAA-MM-DD). */
function limitesDelMes(p: PeriodoSolicitud): { inicio: string; fin: string } {
  if (p.desde && p.hasta) return { inicio: p.desde, fin: p.hasta };
  const mm = String(p.mes).padStart(2, '0');
  const ultimo = new Date(Date.UTC(p.anio, p.mes, 0)).getUTCDate();
  return { inicio: `${p.anio}-${mm}-01`, fin: `${p.anio}-${mm}-${String(ultimo).padStart(2, '0')}` };
}

/**
 * Compara con las reglas fijas. `hoy` es el día de Ecuador, AAAA-MM-DD. `solicitud` (opcional) es
 * el mes al que se entregó el documento: si el documento dice un periodo que no toca ese mes
 * (un periodo que cruza de mes, como 24 ago – 23 sep, vale para los dos), pide revisar.
 */
export function evaluarEntrega(l: LecturaEntrega, hoy: string, solicitud?: PeriodoSolicitud): ResultadoEvaluacion {
  const motivos: Motivo[] = [];

  if (!l.legible) {
    motivos.push({
      texto: 'No se pudo leer bien el documento (borroso, cortado o incompleto).',
      rechazo: 'El documento no se lee bien (borroso, cortado o incompleto). Vuelve a entregarlo con una copia clara y completa.',
    });
  } else {
    if (l.seFirma && l.firmaOSello === 'NO') {
      motivos.push({
        texto: 'No se ve firma ni sello.',
        rechazo: 'El documento no tiene firma ni sello. Vuelve a entregarlo firmado o sellado.',
      });
    } else if (l.seFirma && l.firmaOSello === 'DUDOSO') {
      motivos.push({
        texto: 'No está claro si tiene firma o sello.',
        rechazo: 'No se distingue la firma o el sello del documento. Vuelve a entregarlo con una copia donde se vea.',
      });
    }
    if (l.fechaVencimiento && l.fechaVencimiento < hoy) {
      const f = fechaLegible(l.fechaVencimiento);
      motivos.push({
        texto: `Está vencido: dice que valía hasta el ${f}.`,
        rechazo: `El documento está vencido (válido hasta el ${f}). Entrega uno vigente.`,
      });
    }
  }

  let periodoCoincide = false;
  if (l.legible && solicitud && l.periodoDesde && l.periodoHasta) {
    const mes = limitesDelMes(solicitud);
    if (l.periodoDesde <= mes.fin && l.periodoHasta >= mes.inicio) {
      periodoCoincide = true;
    } else {
      const del = fechaLegible(l.periodoDesde);
      const al = fechaLegible(l.periodoHasta);
      const pedido = `${MESES[solicitud.mes - 1]} de ${solicitud.anio}${solicitud.etiqueta ? ` (${solicitud.etiqueta})` : ''}`;
      motivos.push({
        texto: `Dice que corresponde al periodo del ${del} al ${al}, pero la solicitud es de ${pedido}.`,
        rechazo: `El documento corresponde al periodo del ${del} al ${al} y esta solicitud es de ${pedido}. Entrega el del periodo correcto.`,
      });
    }
  }

  if (motivos.length === 0) {
    const base = l.fechaVencimiento
      ? `Se lee bien${l.seFirma ? ', con firma o sello' : ''} y está vigente hasta el ${fechaLegible(l.fechaVencimiento)}.`
      : `Se lee bien${l.seFirma ? ' y tiene firma o sello' : ''}; no dice fecha de vencimiento.`;
    return {
      estado: 'PARECE_CORRECTO',
      motivos,
      resumen: periodoCoincide
        ? `${base} Su periodo (${fechaLegible(l.periodoDesde!)} al ${fechaLegible(l.periodoHasta!)}) corresponde a la solicitud.`
        : base,
      mensajeRechazo: '',
    };
  }
  return {
    estado: 'REVISAR',
    motivos,
    resumen: motivos.map((m) => m.texto).join(' '),
    mensajeRechazo: motivos.map((m) => m.rechazo).join(' '),
  };
}

/** Lo que se le pide al modelo. Solo observa: no recibe el nombre pedido, el mes ni la entidad. */
export function buildEntregaPrompt(o: { hoy: string; instruccionesDeLaEmpresa: string }): string {
  const extra = o.instruccionesDeLaEmpresa.trim()
    ? `\nDatos de la empresa sobre sus documentos (úsalos solo para entender mejor):\n${o.instruccionesDeLaEmpresa.trim()}\n`
    : '';
  return `Eres un lector de documentos administrativos de una empresa de seguridad en Ecuador. Te muestran UN documento entregado (puede ser un PDF o una foto). NO decides si está bien o mal: solo describes lo que ves. Hoy es ${o.hoy}.
${extra}
Responde SOLO un JSON con esta forma exacta:
{
  "legible": true | false,
  "tipoDocumento": "qué parece ser, en pocas palabras, o null",
  "seFirma": true | false,
  "firmaOSello": "SI" | "NO" | "DUDOSO",
  "fechaVencimiento": "AAAA-MM-DD" | null,
  "periodoDesde": "AAAA-MM-DD" | null,
  "periodoHasta": "AAAA-MM-DD" | null,
  "observaciones": "algo importante que notes, o null"
}

Reglas:
- "legible": false si el documento está borroso, cortado, vacío o le faltan partes tan importantes que no se puede revisar. No adivines el contenido.
- "seFirma": true si un documento de ese tipo normalmente lleva firma o sello (certificados, oficios, cartas, actas, planillas con responsable, contratos, constancias). false para documentos que no se firman (un listado generado por el sistema, una foto de cédula, un comprobante de pago automático).
- "firmaOSello": "SI" si ves una firma manuscrita, una firma electrónica o un sello; "NO" si el documento debería llevarla y claramente no la tiene; "DUDOSO" si no puedes asegurarlo (imagen pequeña, mancha que podría ser firma).
- "fechaVencimiento": SOLO si el propio documento escribe una fecha de vencimiento o de validez («válido hasta», «vigente hasta», «caduca»). Si dice una vigencia en días o meses desde otra fecha, calcula la fecha final. Si no dice nada, null. NUNCA uses la fecha de emisión como vencimiento y no inventes fechas. Si falta el año, null.
- "periodoDesde" y "periodoHasta": SOLO si el documento dice expresamente QUÉ PERIODO cubre o reporta (un informe «del 24 de agosto al 23 de septiembre de 2026», una planilla o un rol «de septiembre 2026», una factura «correspondiente a agosto»). Si dice solo un mes, usa el primer y el último día de ese mes. NO uses la fecha de emisión, la de una firma, la vigencia de un contrato ni la fecha de vencimiento. Si no dice qué periodo cubre, o falta el año, los dos null.
- No transcribas datos personales (cédulas, direcciones, teléfonos) en "observaciones".`;
}
