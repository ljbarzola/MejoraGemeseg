/**
 * Horario «ejecutado»: lo que realmente pasó, armado SOLO con código fijo a partir del
 * horario programado, las faltas registradas con «No llegó» (y su reemplazo) y las custodias
 * del módulo Custodias. No guarda nada ni opina con IA: es el cuadro «Programado vs Ejecutado»
 * que hoy se arma a mano en Excel.
 */

import { normalizarCedula } from './horarios-importar.util';

export interface CeldaProgramada {
  puestoId: number;
  cedula: string;
  nombre: string;
  fecha: string; // YYYY-MM-DD
  codigo: string;
}

export interface AusenciaRegistrada {
  puestoId: number;
  fecha: string;
  cedula: string;
  /** POR_CUBRIR | CUBIERTA (las anuladas no se pasan). */
  estado: string;
  motivo: string;
  reemplazoCedula: string | null;
  reemplazoNombre: string | null;
}

export interface CustodiaDelDia {
  /** Día de Ecuador de la salida. */
  fecha: string;
  guia: string;
  /** Cédulas de los custodios (las de personas sin cédula no entran). */
  cedulas: string[];
}

export interface CodigoParaEjecutado {
  esDescanso: boolean;
  esCustodia: boolean;
}

export type EstadoEjecutado = 'IGUAL' | 'FALTO' | 'CUBRE';

export interface CeldaEjecutada {
  puestoId: number;
  cedula: string;
  nombre: string;
  fecha: string;
  programado: string | null;
  ejecutado: string | null;
  estado: EstadoEjecutado;
  detalle: string | null;
}

export interface AvisoCustodia {
  tipo: 'DC_SIN_CUSTODIA' | 'CUSTODIA_SIN_DC';
  puestoId: number;
  cedula: string;
  nombre: string;
  fecha: string;
  texto: string;
}

export interface ResultadoEjecutado {
  celdas: CeldaEjecutada[];
  avisos: AvisoCustodia[];
  resumen: { faltas: number; cubiertas: number; sinCubrir: number; avisosCustodia: number };
}

const MOTIVOS: Record<string, string> = {
  NO_AVISO: 'no avisó',
  ENFERMEDAD: 'enfermedad',
  PERMISO: 'permiso',
  OTRO: 'otro motivo',
};

export function armarEjecutado(
  celdas: CeldaProgramada[],
  ausencias: AusenciaRegistrada[],
  custodias: CustodiaDelDia[],
  codigos: Record<string, CodigoParaEjecutado>,
): ResultadoEjecutado {
  const faltaDe = new Map<string, AusenciaRegistrada>();
  for (const a of ausencias) faltaDe.set(`${a.puestoId}|${a.fecha}|${a.cedula}`, a);

  const salida: CeldaEjecutada[] = celdas.map((c) => ({
    puestoId: c.puestoId,
    cedula: c.cedula,
    nombre: c.nombre,
    fecha: c.fecha,
    programado: c.codigo,
    ejecutado: c.codigo,
    estado: 'IGUAL' as EstadoEjecutado,
    detalle: null,
  }));
  const indice = new Map(salida.map((c, i) => [`${c.puestoId}|${c.fecha}|${c.cedula}`, i]));

  let faltas = 0;
  let cubiertas = 0;
  for (const a of ausencias) {
    const i = indice.get(`${a.puestoId}|${a.fecha}|${a.cedula}`);
    if (i === undefined) continue; // la falta no corresponde a una celda de este horario
    const c = salida[i];
    const codigoQueSeCubre = c.programado;
    faltas++;
    const motivo = MOTIVOS[a.motivo] ?? a.motivo;
    c.estado = 'FALTO';
    c.ejecutado = null;
    if (a.estado === 'CUBIERTA' && a.reemplazoCedula) {
      cubiertas++;
      c.detalle = `Faltó (${motivo}); cubrió ${a.reemplazoNombre ?? a.reemplazoCedula}.`;
      const j = indice.get(`${a.puestoId}|${a.fecha}|${a.reemplazoCedula}`);
      const detalle = `Cubre a ${c.nombre}.`;
      if (j !== undefined) {
        salida[j].ejecutado = codigoQueSeCubre;
        salida[j].estado = 'CUBRE';
        salida[j].detalle = detalle;
      } else {
        const nueva: CeldaEjecutada = {
          puestoId: a.puestoId,
          cedula: a.reemplazoCedula,
          nombre: a.reemplazoNombre ?? a.reemplazoCedula,
          fecha: a.fecha,
          programado: null,
          ejecutado: codigoQueSeCubre,
          estado: 'CUBRE',
          detalle,
        };
        indice.set(`${a.puestoId}|${a.fecha}|${a.reemplazoCedula}`, salida.length);
        salida.push(nueva);
      }
    } else {
      c.detalle = `Faltó (${motivo}); nadie lo cubrió.`;
    }
  }

  // Cruce con Custodias: solo avisa, nunca cambia el horario (la persona decide).
  const custodiaPor = new Map<string, string>();
  for (const cu of custodias) for (const ced of cu.cedulas) custodiaPor.set(`${cu.fecha}|${ced}`, cu.guia);

  const avisos: AvisoCustodia[] = [];
  for (const c of salida) {
    if (c.estado === 'FALTO') continue;
    const cedNorm = normalizarCedula(c.cedula);
    const guia = cedNorm ? custodiaPor.get(`${c.fecha}|${cedNorm}`) : undefined;
    const info = c.ejecutado ? codigos[c.ejecutado] : undefined;
    if (info?.esCustodia && !guia) {
      avisos.push({
        tipo: 'DC_SIN_CUSTODIA',
        puestoId: c.puestoId,
        cedula: c.cedula,
        nombre: c.nombre,
        fecha: c.fecha,
        texto: 'Está marcado como día de custodia, pero no hay una custodia registrada ese día a su nombre. Revisar si hizo la custodia.',
      });
    } else if (!info?.esCustodia && guia) {
      avisos.push({
        tipo: 'CUSTODIA_SIN_DC',
        puestoId: c.puestoId,
        cedula: c.cedula,
        nombre: c.nombre,
        fecha: c.fecha,
        texto: `Tiene la custodia ${guia} ese día, pero su turno en el horario es ${c.ejecutado ?? 'ninguno'}.`,
      });
    }
  }

  salida.sort(
    (a, b) => a.puestoId - b.puestoId || a.nombre.localeCompare(b.nombre, 'es') || a.fecha.localeCompare(b.fecha),
  );
  avisos.sort((a, b) => a.fecha.localeCompare(b.fecha) || a.nombre.localeCompare(b.nombre, 'es'));

  return {
    celdas: salida,
    avisos,
    resumen: { faltas, cubiertas, sinCubrir: faltas - cubiertas, avisosCustodia: avisos.length },
  };
}
