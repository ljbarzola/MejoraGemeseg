import {
  describirAccion,
  describirEvento,
  duracionCorta,
  moduloEtiqueta,
  EventoDescribible,
} from './bitacora-etiquetas.util';

/** Un hueco es un silencio entre dos acciones seguidas de al menos este tiempo. */
export const HUECO_MINIMO_MINUTOS = 60;
/** Acciones iguales (mismo módulo y tipo) a menos de este tiempo se muestran como una sola fila. */
export const AGRUPAR_MINUTOS = 10;

export interface EventoHoja extends EventoDescribible {
  ocurridoEn: Date;
}

export interface FilaHoja {
  desde: string;
  hasta: string;
  fuente: string;
  modulo: string;
  moduloEtiqueta: string;
  texto: string;
  veces: number;
  /** Solo sitios web: minutos sumados en esa fila. */
  minutos?: number;
}

export interface HuecoHoja {
  desde: string;
  hasta: string;
  minutos: number;
}

export interface HojaDia {
  fecha: string;
  primera: string | null;
  ultima: string | null;
  totalEventos: number;
  huecoMinimoMinutos: number;
  huecos: HuecoHoja[];
  filas: FilaHoja[];
}

const MIN = 60_000;

/**
 * Arma la hoja de un día a partir de los eventos de una persona.
 * Solo cuenta lo que quedó registrado: quien trabaja fuera de la app y de Google
 * aparece con pocas filas, y la hoja no puede decir más que eso.
 */
export function construirHoja(
  fecha: string,
  eventos: EventoHoja[],
  huecoMinimo: number = HUECO_MINIMO_MINUTOS,
): HojaDia {
  const orden = [...eventos].sort(
    (a, b) => a.ocurridoEn.getTime() - b.ocurridoEn.getTime(),
  );

  // Un tramo de navegador ocupa varios minutos: el silencio empieza cuando termina, no cuando empieza.
  let finMayor = orden.length ? finDe(orden[0]) : 0;
  const huecos: HuecoHoja[] = [];
  for (let i = 1; i < orden.length; i++) {
    const inicio = orden[i].ocurridoEn.getTime();
    const minutos = Math.floor((inicio - finMayor) / MIN);
    if (minutos >= huecoMinimo) {
      huecos.push({
        desde: new Date(finMayor).toISOString(),
        hasta: orden[i].ocurridoEn.toISOString(),
        minutos,
      });
    }
    finMayor = Math.max(finMayor, finDe(orden[i]));
  }

  return {
    fecha,
    primera: orden.length ? orden[0].ocurridoEn.toISOString() : null,
    ultima: orden.length ? new Date(finMayor).toISOString() : null,
    totalEventos: orden.length,
    huecoMinimoMinutos: huecoMinimo,
    huecos,
    filas: agrupar(orden),
  };
}

/** Cuándo termina el evento: los sitios web duran sus minutos, el resto es un instante. */
function finDe(e: EventoHoja): number {
  const extra =
    e.fuente === 'EXTENSION' ? Math.max(0, (e.minutos ?? 1) - 1) * MIN : 0;
  return e.ocurridoEn.getTime() + extra;
}

function claveGrupo(e: EventoHoja): string {
  // Dos sitios web distintos nunca se juntan en una fila.
  const sitio = e.fuente === 'EXTENSION' ? (e.nombre ?? '') : '';
  return `${e.fuente}|${e.modulo}|${e.accion}|${e.ruta ?? ''}|${sitio}`;
}

function agrupar(orden: EventoHoja[]): FilaHoja[] {
  const grupos: EventoHoja[][] = [];
  for (const e of orden) {
    const ultimo = grupos[grupos.length - 1];
    const previo = ultimo?.[ultimo.length - 1];
    if (
      previo &&
      claveGrupo(previo) === claveGrupo(e) &&
      e.ocurridoEn.getTime() - previo.ocurridoEn.getTime() <=
        AGRUPAR_MINUTOS * MIN
    ) {
      ultimo.push(e);
    } else {
      grupos.push([e]);
    }
  }
  return grupos.map(filaDeGrupo);
}

function filaDeGrupo(g: EventoHoja[]): FilaHoja {
  const primero = g[0];
  const ultimo = g[g.length - 1];
  if (primero.fuente === 'EXTENSION') {
    const minutos = g.reduce((s, e) => s + (e.minutos ?? 0), 0);
    return {
      desde: primero.ocurridoEn.toISOString(),
      // El último tramo dura sus propios minutos: la fila termina cuando ese tramo termina.
      hasta: new Date(
        ultimo.ocurridoEn.getTime() +
          Math.max(0, (ultimo.minutos ?? 1) - 1) * MIN,
      ).toISOString(),
      fuente: primero.fuente,
      modulo: primero.modulo,
      moduloEtiqueta: moduloEtiqueta(primero.modulo),
      texto: `${describirAccion(primero)}: ${primero.nombre ?? ''} (${duracionCorta(minutos)})`,
      veces: g.length,
      minutos,
    };
  }
  const texto = g.length === 1 ? describirEvento(primero) : textoGrupo(g);
  return {
    desde: primero.ocurridoEn.toISOString(),
    hasta: ultimo.ocurridoEn.toISOString(),
    fuente: primero.fuente,
    modulo: primero.modulo,
    moduloEtiqueta: moduloEtiqueta(primero.modulo),
    texto,
    veces: g.length,
  };
}

function textoGrupo(g: EventoHoja[]): string {
  const base = `${describirAccion(g[0])} (${g.length} veces)`;
  const nombres = [
    ...new Set(g.map((e) => e.nombre).filter((n): n is string => !!n)),
  ];
  if (nombres.length === 0) return base;
  const visibles = nombres
    .slice(0, 3)
    .map((n) => `«${n}»`)
    .join(', ');
  const resto = nombres.length - 3;
  return resto > 0
    ? `${base}: ${visibles} y ${resto} más`
    : `${base}: ${visibles}`;
}
