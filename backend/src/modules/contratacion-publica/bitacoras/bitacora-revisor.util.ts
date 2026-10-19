// El revisor de bitácoras: compara lo que los guardias anotaron en la hoja con lo
// que decía el horario del puesto ese día. Es código fijo, no el modelo: el
// modelo solo LEE la foto (sin conocer el horario, para que no "arregle" un
// nombre equivocado), y aquí se decide qué está bien y qué no, siempre igual y
// con un mensaje que nombra a la persona, el día y el turno.

import {
  emparejarGuardia,
  similitudTexto,
  UMBRAL_NOMBRE_SEGURO,
  type GuardiaPuesto,
} from './nombre-guardia.util';
import { diferenciaMinutos, TOLERANCIA_MINUTOS } from './bitacora.util';

export type Severidad = 'ALTA' | 'MEDIA' | 'BAJA';

export type TipoHallazgo =
  | 'GUARDIA_DISTINTO' // el horario decía A y la bitácora trae a B
  | 'GUARDIA_AUSENTE' // le tocaba trabajar y no aparece
  | 'GUARDIA_NO_PROGRAMADO' // aparece, pero ese día le tocaba descanso o no tenía turno
  | 'GUARDIA_NO_ASIGNADO' // el nombre no es ninguno de los guardias del puesto
  | 'HORARIO_DISTINTO' // anotó otras horas que las de su turno
  | 'SIN_HORAS' // no se leyó la hora de entrada o salida
  | 'NOMBRE_DUDOSO' // se parece a un guardia, pero no es seguro
  | 'NOMBRE_AMBIGUO' // se parece igual a dos guardias del puesto
  | 'LECTURA_DUDOSA' // el agente marcó la línea como poco legible
  | 'NO_HORARIO' // no hay horario cargado para ese día
  | 'HORARIO_NO_APROBADO' // el horario de ese día sigue en borrador o fue rechazado
  | 'FECHA_FUERA_DE_CONTRATO'
  | 'PUESTO_DISTINTO' // la hoja dice otro puesto que el elegido al subirla
  | 'FECHA_YA_CARGADA'; // otra bitácora del mismo puesto ya cubre ese día

export interface HallazgoRevision {
  fecha: string | null;
  tipo: TipoHallazgo;
  severidad: Severidad;
  mensaje: string;
  /** Estable entre revisiones: permite recordar lo que la persona ya resolvió. */
  clave: string;
}

export interface RegistroLeido {
  fecha: string;
  guardia: string;
  horaEntrada: string | null;
  horaSalida: string | null;
  legible: boolean;
}

export interface CeldaHorario {
  fecha: string;
  cedula: string;
  nombre: string;
  codigo: string;
}

export interface CodigoTurnoInfo {
  nombre: string;
  esDescanso: boolean;
  horaInicio: string | null;
  horaFin: string | null;
}

export interface EntradaRevision {
  /** Días que cubre la hoja (YYYY-MM-DD). */
  fechas: string[];
  registros: RegistroLeido[];
  guardiasPuesto: GuardiaPuesto[];
  /** Celdas del horario para esas fechas (de cualquier horario del contrato que las cubra). */
  celdas: CeldaHorario[];
  /** Estado del horario que cubre cada día; un día sin entrada no tiene horario. */
  horarioPorFecha: Record<string, string>;
  codigos: Record<string, CodigoTurnoInfo>;
  contrato: { fechaInicio: string; fechaFin: string };
  puestoNombre: string;
  entidadNombre: string;
  puestoLeido: string | null;
  /** Fechas que otra bitácora del mismo puesto ya cubre -> numero de esa bitácora. */
  fechasYaCargadas: Record<string, number>;
  toleranciaMinutos?: number;
}

export interface EmparejamientoRegistro {
  /** Posición en `registros`. */
  indice: number;
  cedula: string | null;
  nombre: string | null;
  coincidencia: number;
}

export interface EsperadoDelDia {
  cedula: string;
  nombre: string;
  codigo: string;
  codigoNombre: string | null;
  descanso: boolean;
  horaInicio: string | null;
  horaFin: string | null;
}

export type ResultadoBitacora =
  'CONFORME' | 'A_REVISAR' | 'CON_ERRORES' | 'SIN_COMPARAR';

export interface SalidaRevision {
  emparejamientos: EmparejamientoRegistro[];
  esperadoPorFecha: Record<string, EsperadoDelDia[]>;
  hallazgos: HallazgoRevision[];
  resultado: ResultadoBitacora;
}

/** "2026-09-28" -> "28/09" (el año solo estorba en un mensaje). */
export function fechaCorta(iso: string): string {
  const [, m, d] = iso.split('-');
  return `${d}/${m}`;
}

const claveNombre = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

function describirTurno(
  codigo: string,
  c: CodigoTurnoInfo | undefined,
): string {
  return c?.horaInicio && c?.horaFin
    ? `turno ${codigo} de ${c.horaInicio} a ${c.horaFin}`
    : `turno ${codigo}`;
}

export function revisarBitacora(entrada: EntradaRevision): SalidaRevision {
  const tolerancia = entrada.toleranciaMinutos ?? TOLERANCIA_MINUTOS;
  const hallazgos: HallazgoRevision[] = [];
  const agregar = (
    h: Omit<HallazgoRevision, 'clave'> & { clave?: string },
    sujeto = '',
  ) =>
    hallazgos.push({
      ...h,
      clave: h.clave ?? `${h.tipo}|${h.fecha ?? '-'}|${sujeto}`,
    });

  // 1) Quién es cada nombre leído (una sola vez por línea).
  const emparejamientos: EmparejamientoRegistro[] = [];
  const empar = entrada.registros.map((r, indice) => {
    const e = emparejarGuardia(r.guardia, entrada.guardiasPuesto);
    emparejamientos.push({
      indice,
      cedula: e.guardia?.cedula ?? null,
      nombre: e.guardia?.nombre ?? null,
      coincidencia: Math.round(e.coincidencia * 100) / 100,
    });
    return e;
  });

  // 2) La hoja dice otro puesto que el elegido al subirla.
  if (entrada.puestoLeido) {
    const contra = Math.max(
      similitudTexto(entrada.puestoLeido, entrada.puestoNombre),
      similitudTexto(
        entrada.puestoLeido,
        `${entrada.entidadNombre} ${entrada.puestoNombre}`,
      ),
    );
    if (contra < 0.5) {
      agregar({
        fecha: null,
        tipo: 'PUESTO_DISTINTO',
        severidad: 'MEDIA',
        mensaje: `La hoja dice «${entrada.puestoLeido}», pero se subió como «${entrada.puestoNombre}» (${entrada.entidadNombre}). Revisa que sea la bitácora de ese puesto.`,
      });
    }
  }

  const esperadoPorFecha: Record<string, EsperadoDelDia[]> = {};
  const fechas = [...new Set(entrada.fechas)].sort();
  let diasComparados = 0;

  for (const fecha of fechas) {
    const f = fechaCorta(fecha);

    if (
      fecha < entrada.contrato.fechaInicio ||
      fecha > entrada.contrato.fechaFin
    ) {
      agregar({
        fecha,
        tipo: 'FECHA_FUERA_DE_CONTRATO',
        severidad: 'MEDIA',
        mensaje: `El ${f} está fuera de la vigencia del contrato (${fechaCorta(entrada.contrato.fechaInicio)} al ${fechaCorta(entrada.contrato.fechaFin)}). Revisa la fecha que se leyó.`,
      });
    }
    if (entrada.fechasYaCargadas[fecha]) {
      agregar({
        fecha,
        tipo: 'FECHA_YA_CARGADA',
        severidad: 'BAJA',
        mensaje: `El ${f} de este puesto ya está en la bitácora n.º ${entrada.fechasYaCargadas[fecha]}. Puede ser una hoja repetida.`,
      });
    }

    const estadoHorario = entrada.horarioPorFecha[fecha];
    if (!estadoHorario) {
      agregar({
        fecha,
        tipo: 'NO_HORARIO',
        severidad: 'MEDIA',
        mensaje: `No hay un horario cargado que cubra el ${f}, así que no se puede comparar quién debía estar. Carga el horario de ese período.`,
      });
      continue;
    }
    diasComparados++;
    if (estadoHorario !== 'APROBADO') {
      agregar({
        fecha,
        tipo: 'HORARIO_NO_APROBADO',
        severidad: 'BAJA',
        mensaje: `El horario del ${f} está en ${estadoHorario.toLowerCase()}, no aprobado: la comparación puede cambiar cuando se apruebe.`,
      });
    }

    // Lo que decía el horario ese día.
    const celdasDia = entrada.celdas.filter((c) => c.fecha === fecha);
    const esperado: EsperadoDelDia[] = celdasDia.map((c) => {
      const info = entrada.codigos[c.codigo];
      return {
        cedula: c.cedula,
        nombre: c.nombre,
        codigo: c.codigo,
        codigoNombre: info?.nombre ?? null,
        descanso: !!info?.esDescanso,
        horaInicio: info?.horaInicio ?? null,
        horaFin: info?.horaFin ?? null,
      };
    });
    esperadoPorFecha[fecha] = esperado;
    const trabajan = esperado.filter((e) => !e.descanso);
    const porCedula = new Map(esperado.map((e) => [e.cedula, e]));

    // Líneas de ese día, y quién es cada una.
    const lineas = entrada.registros
      .map((r, i) => ({ r, i, e: empar[i] }))
      .filter((x) => x.r.fecha === fecha);

    const presentes = new Map<string, (typeof lineas)[number]>();
    const desconocidos: typeof lineas = [];
    for (const l of lineas) {
      const cedula = l.e.guardia?.cedula;
      if (!cedula) desconocidos.push(l);
      else if (!presentes.has(cedula)) presentes.set(cedula, l);
    }

    // Quien aparece sin que le tocara trabajar (libre, sin turno o sin ser del puesto).
    const intrusos: { nombre: string; motivo: string; sujeto: string }[] = [];
    presentes.forEach((l, cedula) => {
      if (trabajan.some((t) => t.cedula === cedula)) return;
      const programado = porCedula.get(cedula);
      intrusos.push({
        nombre: l.e.guardia!.nombre,
        sujeto: cedula,
        motivo: programado
          ? `ese día el horario lo marca ${programado.codigoNombre ?? programado.codigo} (${programado.codigo})`
          : 'ese día no tenía turno en el horario',
      });
    });
    for (const l of desconocidos) {
      intrusos.push({
        nombre: l.r.guardia,
        sujeto: claveNombre(l.r.guardia),
        motivo: 'no es ninguno de los guardias asignados al puesto',
      });
    }
    const ausentes = trabajan.filter((t) => !presentes.has(t.cedula));

    // Quien aparece en lugar de quien debía estar se cuenta como UN hallazgo.
    const pares = Math.min(intrusos.length, ausentes.length);
    for (let i = 0; i < pares; i++) {
      const debia = ausentes[i];
      const vino = intrusos[i];
      agregar(
        {
          fecha,
          tipo: 'GUARDIA_DISTINTO',
          severidad: 'ALTA',
          mensaje: `El ${f} el horario decía ${debia.nombre} (${describirTurno(debia.codigo, entrada.codigos[debia.codigo])}), pero la bitácora trae a ${vino.nombre}: ${vino.motivo}.`,
        },
        `${debia.cedula}>${vino.sujeto}`,
      );
    }
    for (const v of intrusos.slice(pares)) {
      const noAsignado = v.motivo.startsWith('no es ninguno');
      agregar(
        {
          fecha,
          tipo: noAsignado ? 'GUARDIA_NO_ASIGNADO' : 'GUARDIA_NO_PROGRAMADO',
          severidad: 'ALTA',
          mensaje: `El ${f} aparece ${v.nombre} en la bitácora, pero ${v.motivo}.`,
        },
        v.sujeto,
      );
    }
    for (const a of ausentes.slice(pares)) {
      agregar(
        {
          fecha,
          tipo: 'GUARDIA_AUSENTE',
          severidad: 'ALTA',
          mensaje: `El ${f} le tocaba trabajar a ${a.nombre} (${describirTurno(a.codigo, entrada.codigos[a.codigo])}) y no aparece en la bitácora.`,
        },
        a.cedula,
      );
    }

    // Quien sí debía estar: ¿cuadran las horas, se entiende el nombre?
    for (const t of trabajan) {
      const l = presentes.get(t.cedula);
      if (!l) continue;
      const info = entrada.codigos[t.codigo];
      const ini = info?.horaInicio;
      const fin = info?.horaFin;
      const { horaEntrada, horaSalida } = l.r;

      if (ini && fin) {
        if (!horaEntrada || !horaSalida) {
          agregar(
            {
              fecha,
              tipo: 'SIN_HORAS',
              severidad: 'BAJA',
              mensaje: `El ${f} no se leyó ${!horaEntrada && !horaSalida ? 'la hora de entrada ni la de salida' : !horaEntrada ? 'la hora de entrada' : 'la hora de salida'} de ${t.nombre}.`,
            },
            t.cedula,
          );
        } else {
          const dEntrada = diferenciaMinutos(horaEntrada, ini);
          const dSalida = diferenciaMinutos(horaSalida, fin);
          if (dEntrada > tolerancia || dSalida > tolerancia) {
            agregar(
              {
                fecha,
                tipo: 'HORARIO_DISTINTO',
                severidad: 'MEDIA',
                mensaje: `El ${f} ${t.nombre} anotó ${horaEntrada}–${horaSalida}, pero le tocaba ${describirTurno(t.codigo, info)} (se tolera ${tolerancia} min).`,
              },
              t.cedula,
            );
          }
        }
      }

      if (l.e.ambiguo) {
        agregar(
          {
            fecha,
            tipo: 'NOMBRE_AMBIGUO',
            severidad: 'MEDIA',
            mensaje: `El ${f} «${l.r.guardia}» se parece a más de un guardia del puesto; se tomó como ${t.nombre}. Confírmalo.`,
          },
          t.cedula,
        );
      } else if (l.e.coincidencia < UMBRAL_NOMBRE_SEGURO) {
        agregar(
          {
            fecha,
            tipo: 'NOMBRE_DUDOSO',
            severidad: 'BAJA',
            mensaje: `El ${f} la hoja dice «${l.r.guardia}»; se tomó como ${t.nombre}, pero no es una coincidencia segura.`,
          },
          t.cedula,
        );
      }
      if (!l.r.legible) {
        agregar(
          {
            fecha,
            tipo: 'LECTURA_DUDOSA',
            severidad: 'BAJA',
            mensaje: `El ${f} la línea de ${t.nombre} se leyó con dudas. Compárala con la foto.`,
          },
          t.cedula,
        );
      }
    }
  }

  const severidades = hallazgos.map((h) => h.severidad);
  let resultado: ResultadoBitacora;
  if (diasComparados === 0) resultado = 'SIN_COMPARAR';
  else if (severidades.includes('ALTA')) resultado = 'CON_ERRORES';
  else if (severidades.length) resultado = 'A_REVISAR';
  else resultado = 'CONFORME';

  return { emparejamientos, esperadoPorFecha, hallazgos, resultado };
}
