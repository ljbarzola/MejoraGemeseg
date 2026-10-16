import { calcularEstadoContrato, esProducto, hoyEcuador } from './agreement-status.util';

// Ciclo de vida de un cliente. Se CALCULA, nunca se teclea: nadie lo marca a
// mano ni hay un proceso nocturno que lo actualice.
//
//   PROSPECTO  sin contrato ni oportunidad ganada todavía (negociando)
//   CLIENTE    aceptó (oportunidad ganada) o tiene un contrato vigente, por iniciar
//              o por vencer sin señales de riesgo. Si aceptó y aún no hay contrato
//              queda marcado `contratoPendiente` («Por contratar»)
//   EN_RIESGO  contrato vigente con señales de riesgo, o vencido dentro de sus días de gracia
//   EX_CLIENTE tuvo contratos y ya no tiene ninguno vigente (ni en gracia)
//   PERDIDO    nunca contrató y todas sus oportunidades se perdieron
//
// Un cliente nunca vuelve a ser lead: si un ex-cliente pide otro servicio entra
// como lead nuevo y se le suma una oportunidad (ver ventas-leads.service.ts).
export type CicloVida =
  | 'PROSPECTO'
  | 'CLIENTE'
  | 'EN_RIESGO'
  | 'EX_CLIENTE'
  | 'PERDIDO';

export const CICLOS_VIDA: CicloVida[] = [
  'PROSPECTO',
  'CLIENTE',
  'EN_RIESGO',
  'EX_CLIENTE',
  'PERDIDO',
];

export const ETIQUETA_CICLO: Record<CicloVida, string> = {
  PROSPECTO: 'Prospecto',
  CLIENTE: 'Cliente',
  EN_RIESGO: 'En riesgo',
  EX_CLIENTE: 'Ex-cliente',
  PERDIDO: 'Perdido',
};

// Días sin ninguna actividad (nota, llamada, cambio de etapa, documento) que
// vuelven «En riesgo» a un cliente con contrato vigente.
export const DIAS_SIN_ACTIVIDAD_RIESGO = 60;

// Días de gracia sugeridos al crear un contrato según su duración: los contratos
// largos suelen renovarse con más calma. La usuaria los fija por contrato.
export function graciaSugerida(
  inicio: Date,
  fin: Date | null | undefined,
): number {
  if (!fin) return 30;
  const dias = (fin.getTime() - inicio.getTime()) / (24 * 60 * 60 * 1000);
  return dias >= 180 ? 30 : 15;
}

export interface ContratoParaCiclo {
  status: string;
  // PRODUCTO = venta única: no vence ni se renueva, solo prueba que el cliente compró.
  kind?: string | null;
  startDate: Date;
  endDate: Date | null;
  graceDays: number;
}

export interface OportunidadParaCiclo {
  closedAt: Date | null;
  outcome: string | null;
  // Aceptada al registrar un cliente que ya venía contratando (originType
  // HISTORICO): cuenta como cliente mientras no haya contrato, pero no como una
  // aceptación nueva después de que venció el último.
  historica?: boolean;
}

export interface EntradaCiclo {
  contratos: ContratoParaCiclo[];
  oportunidades: OportunidadParaCiclo[];
  // Último movimiento de cualquier tipo del cliente (o null si no hay).
  ultimaActividad: Date | null;
  // El cliente (o una oportunidad abierta suya) tiene el siguiente paso vencido.
  seguimientoVencido: boolean;
}

export interface ResultadoCiclo {
  ciclo: CicloVida;
  razones: string[];
  // Aceptó pero todavía no tiene contrato que lo cubra: falta generarlo.
  contratoPendiente?: boolean;
}

const DIA_MS = 24 * 60 * 60 * 1000;
const diaUtc = (s: string) => Date.parse(`${s}T00:00:00.000Z`);

export function calcularCicloVida(
  e: EntradaCiclo,
  ahora: Date = new Date(),
): ResultadoCiclo {
  const hoy = hoyEcuador(ahora);
  const estados = e.contratos.map((c) => ({
    c,
    estado: calcularEstadoContrato(c, ahora),
  }));

  const hayVigente = estados.some(
    (x) =>
      x.estado === 'VIGENTE' ||
      x.estado === 'POR_VENCER' ||
      x.estado === 'POR_INICIAR',
  );

  const ganadas = e.oportunidades.filter(
    (o) => o.closedAt !== null && o.outcome === 'GANADA',
  );

  if (hayVigente) {
    const razones: string[] = [];
    if (estados.some((x) => x.estado === 'POR_VENCER')) {
      razones.push('Contrato por vencer');
    }
    if (e.ultimaActividad) {
      const dias = Math.floor(
        (diaUtc(hoy) -
          diaUtc(e.ultimaActividad.toISOString().slice(0, 10))) /
          DIA_MS,
      );
      if (dias > DIAS_SIN_ACTIVIDAD_RIESGO) {
        razones.push(`Sin actividad hace ${dias} días`);
      }
    }
    if (e.seguimientoVencido) razones.push('Seguimiento vencido');
    return {
      ciclo: razones.length > 0 ? 'EN_RIESGO' : 'CLIENTE',
      razones,
    };
  }

  // Vencido pero todavía dentro de los días de gracia de ese contrato: suele
  // haber una renovación en trámite, así que aún no es ex-cliente.
  const enGracia = estados.some((x) => {
    if (x.estado !== 'VENCIDO' || !x.c.endDate) return false;
    const limite =
      diaUtc(x.c.endDate.toISOString().slice(0, 10)) + x.c.graceDays * DIA_MS;
    return diaUtc(hoy) <= limite;
  });
  if (enGracia) {
    return {
      ciclo: 'EN_RIESGO',
      razones: ['Contrato vencido, dentro de los días de gracia'],
    };
  }

  if (e.contratos.length === 0 && ganadas.length > 0) {
    // Aceptó la cotización y solo falta la documentación: ya es cliente.
    return { ciclo: 'CLIENTE', razones: [], contratoPendiente: true };
  }

  if (e.contratos.length > 0) {
    // Aceptó algo NUEVO después de que terminó su último contrato (p. ej. otro
    // servicio): es cliente con un contrato por generar, no ex-cliente.
    const ultimoFin = Math.max(
      ...e.contratos.map((c) => (c.endDate ?? c.startDate).getTime()),
    );
    const aceptoDespues = ganadas.some(
      (o) => !o.historica && o.closedAt!.getTime() > ultimoFin,
    );
    if (aceptoDespues) {
      return { ciclo: 'CLIENTE', razones: [], contratoPendiente: true };
    }
    // Solo compró productos (no tiene ni tuvo un servicio recurrente): sigue
    // siendo cliente; una venta única no vence ni lo deja «en riesgo».
    if (e.contratos.every((c) => esProducto(c))) {
      return { ciclo: 'CLIENTE', razones: [] };
    }
    return { ciclo: 'EX_CLIENTE', razones: [] };
  }

  const todasPerdidas =
    e.oportunidades.length > 0 &&
    e.oportunidades.every((o) => o.closedAt !== null && o.outcome === 'PERDIDA');
  return { ciclo: todasPerdidas ? 'PERDIDO' : 'PROSPECTO', razones: [] };
}
