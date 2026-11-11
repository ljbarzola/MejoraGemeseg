import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { CPHorariosImportarService } from './horarios-importar.service';
import { createHash } from 'crypto';
import { mismoNombre, normalizarCedula, normalizarTexto, periodoDeHoja, type BloqueExcel } from './horarios-importar.util';

export type TipoTurnoSugerido = '8H' | '12H' | '24H';

export interface BloqueAnalizado {
  /** Posición del bloque dentro de la hoja (así lo identifica el asistente al aplicar). */
  indice: number;
  titulo: string;
  /** Otro bloque de la hoja tiene el mismo título: solo se crea el primero. */
  repetido: boolean;
  personas: { fila: number; nombre: string; cedula: string | null }[];
  conCedula: number;
  sinCedula: number;
  codigos: string[];
  tipoTurnoSugerido: TipoTurnoSugerido;
}

export interface AnalisisImportacion {
  hojas: { nombre: string; puestos: number }[];
  hoja: string;
  bloques: BloqueAnalizado[];
  /** Periodo leído del nombre de la hoja y de sus columnas; null si el nombre no dice el mes. */
  periodo: { desde: string; hasta: string; diaCorte: number | null } | null;
}

export interface DatosImportacion {
  hoja: string;
  entidadId: number;
  numero: string;
  objeto: string;
  referenciaProceso?: string;
  fechaInicio: string;
  fechaFin: string;
  tipoCompra?: string;
  administradorNombre?: string;
  administradorCargo?: string;
  diaCorte?: number | null;
  /** Periodo del horario que se crea con los turnos del Excel. */
  horarioDesde: string;
  horarioHasta: string;
  bloques: { indice: number; tipoTurno: TipoTurnoSugerido }[];
}

export interface ResultadoImportacion {
  contratoId: number;
  horarioId: number;
  puestos: number;
  guardias: number;
  /** Personas del Excel sin cédula que no estaban en RRHH: quedan con un identificador temporal hasta tener la cédula. */
  sinCedula: { puesto: string; nombre: string }[];
  /** Personas sin cédula que ya existían en RRHH: se enlazaron por nombre con su cédula real. */
  enlazadasPorNombre: number;
  /** Turnos importados al horario; null si no se pudo importar (ver `avisos`). */
  celdas: number | null;
  avisos: string[];
}

const ES_FECHA = /^\d{4}-\d{2}-\d{2}$/;
const MS_DIA = 86_400_000;
const aFecha = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const TURNOS: TipoTurnoSugerido[] = ['8H', '12H', '24H'];

/** Identificador temporal de quien no tiene cédula: el mismo nombre da siempre el mismo (así sus turnos y su puesto coinciden). */
export function cedulaTemporal(nombre: string): string {
  return 'SC-' + createHash('sha1').update(normalizarTexto(nombre).split(' ').sort().join(' ')).digest('hex').slice(0, 10).toUpperCase();
}

/** 8 horas si usa códigos de jornada corta (D/8, D/9, D/10…); si no, 12 horas (día y noche). */
function turnoSugerido(codigos: string[]): TipoTurnoSugerido {
  return codigos.some((c) => /^D\/?(8|9|10)$/.test(c)) ? '8H' : '12H';
}

/**
 * Crear un contrato desde un Excel de horarios: en un solo paso deja el contrato, sus puestos, los guardias
 * de cada puesto (cédula y nombre del Excel) y un horario en borrador con los turnos. Es el atajo de lo
 * que antes eran varios pasos (crear contrato, crear puestos, asignar guardias, crear horario e importar).
 */
@Injectable()
export class ImportacionContratoService {
  private readonly logger = new Logger(ImportacionContratoService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly importador: CPHorariosImportarService,
  ) {}

  private bloquesDe(hoja: { bloques: BloqueExcel[] }): BloqueAnalizado[] {
    const vistos = new Set<string>();
    return hoja.bloques.map((b, indice) => {
      const titulo = b.titulo || `Puesto sin título (fila ${b.fila})`;
      const clave = titulo.toUpperCase();
      const repetido = vistos.has(clave);
      vistos.add(clave);
      const codigos = [...new Set(b.personas.flatMap((p) => p.turnos.map((t) => t.codigo)))].sort();
      const conCedula = b.personas.filter((p) => p.cedula).length;
      return {
        indice,
        titulo,
        repetido,
        personas: b.personas.map((p) => ({ fila: p.fila, nombre: p.nombre, cedula: p.cedula })),
        conCedula,
        sinCedula: b.personas.length - conCedula,
        codigos,
        tipoTurnoSugerido: turnoSugerido(codigos),
      };
    });
  }

  /** Lee el Excel y dice qué puestos encontró (no guarda nada). */
  async analizar(archivo: Buffer, hojaPedida?: string): Promise<AnalisisImportacion> {
    const libro = await this.importador.leerLibro(archivo);
    const hojas = libro.map((h) => ({ nombre: h.nombre, puestos: h.bloques.length }));
    const elegida =
      libro.find((h) => h.nombre === hojaPedida) ?? (hojaPedida ? undefined : libro.find((h) => h.bloques.length > 0));
    if (!elegida) {
      throw new BadRequestException(
        hojaPedida ? 'Esa hoja no existe en el archivo.' : 'No encontré ningún puesto con el formato «NOMBRES Y APELLIDOS» en el archivo.',
      );
    }
    const masColumnas = elegida.bloques.reduce<BloqueExcel | null>((m, b) => (!m || b.columnasDia.length > m.columnasDia.length ? b : m), null);
    const hoy = new Date(Date.now() - 5 * 3600_000).toISOString().slice(0, 10);
    const periodo = masColumnas ? periodoDeHoja(elegida.nombre, masColumnas.columnasDia, hoy) : null;
    return { hojas, hoja: elegida.nombre, bloques: this.bloquesDe(elegida), periodo };
  }

  async aplicar(
    actor: { userId: number; companyId: number },
    archivo: Buffer,
    d: DatosImportacion,
  ): Promise<ResultadoImportacion> {
    const faltan = (v: unknown) => typeof v !== 'string' || !v.trim();
    if (!d || faltan(d.numero) || faltan(d.objeto) || !Number.isInteger(d.entidadId)) {
      throw new BadRequestException('Completa la entidad, el número de contrato y el objeto.');
    }
    for (const f of [d.fechaInicio, d.fechaFin, d.horarioDesde, d.horarioHasta]) {
      if (!ES_FECHA.test(f ?? '')) throw new BadRequestException('Las fechas del contrato y del horario tienen que ser AAAA-MM-DD.');
    }
    if (d.fechaFin < d.fechaInicio) throw new BadRequestException('La fecha de fin del contrato no puede ser anterior a la de inicio.');
    if (d.horarioHasta < d.horarioDesde) throw new BadRequestException('El fin del horario no puede ser anterior a su inicio.');
    if ((aFecha(d.horarioHasta).getTime() - aFecha(d.horarioDesde).getTime()) / MS_DIA > 62) {
      throw new BadRequestException('El horario cubre como máximo 62 días.');
    }
    if (!Array.isArray(d.bloques) || d.bloques.length === 0) {
      throw new BadRequestException('Marca al menos un puesto del Excel para crear.');
    }
    if (d.diaCorte != null && (!Number.isInteger(d.diaCorte) || d.diaCorte < 1 || d.diaCorte > 31)) {
      throw new BadRequestException('El día de corte tiene que ser un número del 1 al 31.');
    }

    const entidad = await this.prisma.cPEntidadPublica.findFirst({ where: { id: d.entidadId, companyId: actor.companyId } });
    if (!entidad) throw new BadRequestException('Entidad pública no encontrada.');

    const analisis = await this.analizar(archivo, d.hoja);
    const porIndice = new Map(analisis.bloques.map((b) => [b.indice, b]));
    const elegidos: { bloque: BloqueAnalizado; tipoTurno: TipoTurnoSugerido }[] = [];
    const avisos: string[] = [];
    const titulos = new Set<string>();
    for (const sel of d.bloques) {
      const b = porIndice.get(sel.indice);
      if (!b) throw new BadRequestException('Uno de los puestos marcados ya no está en el Excel. Vuelve a subir el archivo.');
      if (!TURNOS.includes(sel.tipoTurno)) throw new BadRequestException(`El tipo de turno de «${b.titulo}» no es válido.`);
      const clave = b.titulo.toUpperCase();
      if (b.repetido || titulos.has(clave)) {
        avisos.push(`El puesto «${b.titulo}» aparece más de una vez en la hoja: solo se creó el primero.`);
        continue;
      }
      titulos.add(clave);
      elegidos.push({ bloque: b, tipoTurno: sel.tipoTurno });
    }
    if (elegidos.length === 0) throw new BadRequestException('Ninguno de los puestos marcados se puede crear.');

    const sinCedula: ResultadoImportacion['sinCedula'] = [];
    let enlazadasPorNombre = 0;
    let totalGuardias = 0;
    // Quien no trae cédula en el Excel: si ya está en RRHH se usa su cédula real; si no, un identificador temporal.
    const enRrhh = await this.prisma.employeeDriveFolder.findMany({
      where: { companyId: actor.companyId },
      select: { cedula: true, employeeName: true },
    });

    // Contrato, puestos, guardias y horario vacío: todo o nada.
    const creado = await this.prisma.$transaction(async (tx) => {
      const contrato = await tx.cPContrato.create({
        data: {
          companyId: actor.companyId,
          entidadId: d.entidadId,
          numero: d.numero.trim(),
          objeto: d.objeto.trim(),
          referenciaProceso: d.referenciaProceso?.trim() || null,
          fechaInicio: aFecha(d.fechaInicio),
          fechaFin: aFecha(d.fechaFin),
          tipoCompra: d.tipoCompra?.trim() || null,
          administradorNombre: d.administradorNombre?.trim() || null,
          administradorCargo: d.administradorCargo?.trim() || null,
          diaCorte: d.diaCorte ?? null,
          createdBy: actor.userId,
        },
      });
      for (const { bloque, tipoTurno } of elegidos) {
        // Una persona por cédula (los suplentes suelen repetirse); sin cédula no se puede asignar.
        const guardias = new Map<string, string>();
        for (const p of bloque.personas) {
          let ced = normalizarCedula(p.cedula);
          if (!ced) {
            const conocida = enRrhh.find((e) => mismoNombre(e.employeeName, p.nombre));
            if (conocida) {
              ced = normalizarCedula(conocida.cedula) ?? conocida.cedula;
              enlazadasPorNombre++;
            } else {
              ced = cedulaTemporal(p.nombre);
              sinCedula.push({ puesto: bloque.titulo, nombre: p.nombre });
            }
          }
          if (!guardias.has(ced)) guardias.set(ced, p.nombre);
        }
        const puesto = await tx.cPPuestoServicio.create({
          data: {
            companyId: actor.companyId,
            contratoId: contrato.id,
            nombre: bloque.titulo,
            tipoTurno,
            cantidadGuardias: Math.max(1, guardias.size),
            guardiasSimultaneosRequeridos: 1,
          },
        });
        if (guardias.size > 0) {
          await tx.cPPuestoGuardia.createMany({
            data: [...guardias.entries()].map(([cedula, nombreGuardia]) => ({ puestoId: puesto.id, cedula, nombreGuardia })),
          });
        }
        totalGuardias += guardias.size;
      }
      const inicio = aFecha(d.horarioDesde);
      const horario = await tx.cPHorarioMensual.create({
        data: {
          companyId: actor.companyId,
          contratoId: contrato.id,
          fechaInicio: inicio,
          fechaFin: aFecha(d.horarioHasta),
          anio: inicio.getUTCFullYear(),
          mes: inicio.getUTCMonth() + 1,
          createdBy: actor.userId,
        },
      });
      return { contratoId: contrato.id, horarioId: horario.id };
    });

    // Los turnos: el mismo importador de horarios (puestos por nombre, guardias por cédula). Si algo falla (por ejemplo
    // códigos de turno sin configurar) el contrato y los puestos ya quedaron creados y el horario queda vacío en borrador.
    let celdas: number | null = null;
    try {
      const r = await this.importador.importar(creado.horarioId, actor.companyId, archivo, d.hoja, true);
      celdas = r.totalCeldas;
      // «N puestos del Excel no existen en este contrato» es lo esperado aquí (el libro trae los de muchos clientes).
      avisos.push(...r.avisos.filter((x) => !/puesto\(s\) del Excel no existen en este contrato/.test(x)));
    } catch (err) {
      const msg = (err as { response?: { message?: string } })?.response?.message ?? (err as Error).message;
      this.logger.warn(`Importación de turnos del contrato ${creado.contratoId}: ${msg}`);
      avisos.push(`Los turnos no se importaron: ${msg} El horario quedó vacío en borrador; usa «Importar Excel» dentro del horario cuando lo resuelvas.`);
    }
    if (enlazadasPorNombre > 0) {
      avisos.push(`${enlazadasPorNombre} persona(s) sin cédula en el Excel ya estaban en RRHH: se asignaron con su cédula por el nombre.`);
    }
    if (sinCedula.length > 0) {
      avisos.push(`${sinCedula.length} persona(s) no tienen cédula y no están en RRHH: quedaron asignadas con un identificador temporal. Completa su cédula cuando la tengas.`);
    }

    return { ...creado, puestos: elegidos.length, guardias: totalGuardias, sinCedula, enlazadasPorNombre, celdas, avisos };
  }
}
