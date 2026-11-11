import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import ExcelJS from 'exceljs';
import { PrismaService } from '../../../prisma/prisma.service';
import { listaFechasEnRango } from '../shared/fecha-rango.util';
import {
  detectarBloques,
  elegirPuesto,
  mapearColumnasAFechas,
  mismoNombre,
  type BloqueExcel,
} from './horarios-importar.util';

export interface ImportGuardia {
  fila: number;
  nombre: string;
  cedula: string | null;
  estado: 'OK' | 'NO_ASIGNADO' | 'SIN_TURNOS' | 'REPETIDO';
  guardiaNombre?: string; // el nombre que tiene el sistema
  celdas: number;
}

export interface ImportPuesto {
  titulo: string;
  puestoId: number | null;
  puestoNombre: string | null;
  guardias: ImportGuardia[];
}

export interface ImportResultado {
  hojas: { nombre: string; puestos: number }[];
  hoja: string;
  rango: { inicio: string; fin: string };
  puestos: ImportPuesto[];
  codigosDesconocidos: { codigo: string; veces: number }[];
  totalCeldas: number;
  avisos: string[];
  puedeAplicar: boolean;
  aplicado: boolean;
}

interface CeldaNueva {
  puestoId: number;
  cedula: string;
  nombreGuardia: string;
  fecha: string;
  codigoTurno: string;
}

const MAX_BYTES = 10 * 1024 * 1024;

/** Valor de una celda de Excel como texto simple (fórmulas, texto con formato, fechas). */
function textoCelda(v: ExcelJS.CellValue): string {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === 'object') {
    const o = v as any;
    if (o.result !== undefined && o.result !== null) return String(o.result);
    if (Array.isArray(o.richText)) return o.richText.map((r: any) => r.text).join('');
    if (o.text !== undefined) return String(o.text);
    return '';
  }
  return String(v);
}

@Injectable()
export class CPHorariosImportarService {
  private readonly logger = new Logger(CPHorariosImportarService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Lee el Excel y dice qué haría, sin guardar nada (aplicar=false), o lo
   * guarda (aplicar=true). Las dos llamadas leen el archivo de nuevo: así no
   * queda nada pendiente en el servidor entre la vista previa y el «Aplicar».
   */
  async importar(
    horarioId: number,
    companyId: number,
    archivo: Buffer,
    hojaPedida: string | undefined,
    aplicar: boolean,
  ): Promise<ImportResultado> {
    const horario = await this.prisma.cPHorarioMensual.findFirst({ where: { id: horarioId, companyId } });
    if (!horario) throw new BadRequestException('Horario no encontrado');
    if (horario.estado !== 'BORRADOR') {
      throw new BadRequestException('El horario solo se puede editar en estado Borrador');
    }
    const porHoja = await this.leerLibro(archivo);
    const hojas = porHoja.map((h) => ({ nombre: h.nombre, puestos: h.bloques.length }));

    const elegida =
      porHoja.find((h) => h.nombre === hojaPedida) ??
      (hojaPedida ? undefined : porHoja.find((h) => h.bloques.length > 0));
    if (!elegida) {
      throw new BadRequestException(
        hojaPedida ? 'Esa hoja no existe en el archivo.' : 'No encontré ningún puesto con el formato «NOMBRES Y APELLIDOS» en el archivo.',
      );
    }

    const fechasRango = listaFechasEnRango(horario.fechaInicio, horario.fechaFin);
    const [puestos, codigos] = await Promise.all([
      this.prisma.cPPuestoServicio.findMany({
        where: { contratoId: horario.contratoId, companyId },
        include: { guardias: true },
      }),
      this.prisma.cPCodigoTurno.findMany({ where: { companyId, activo: true } }),
    ]);
    const codigoPorTexto = new Map(codigos.map((c) => [c.codigo.trim().toUpperCase(), c.codigo]));

    const avisos: string[] = [];
    const desconocidos = new Map<string, number>();
    const celdas: CeldaNueva[] = [];
    const resultadoPuestos: ImportPuesto[] = [];
    const puestosYaVistos = new Set<number>();

    for (const b of elegida.bloques) {
      const puesto = elegirPuesto(b.titulo, puestos);
      const info: ImportPuesto = {
        titulo: b.titulo || `(sin título, fila ${b.fila})`,
        puestoId: puesto?.id ?? null,
        puestoNombre: puesto?.nombre ?? null,
        guardias: [],
      };
      resultadoPuestos.push(info);
      if (!puesto) continue;
      if (puestosYaVistos.has(puesto.id)) {
        avisos.push(`El puesto «${puesto.nombre}» aparece dos veces en la hoja; solo se usó el primero.`);
        info.puestoId = null;
        continue;
      }
      puestosYaVistos.add(puesto.id);
      this.leerBloque(b, puesto, fechasRango, codigoPorTexto, desconocidos, celdas, info, avisos);
    }

    if (!resultadoPuestos.some((p) => p.puestoId !== null)) {
      avisos.push('Ningún puesto del Excel coincide con los puestos de este contrato. Revisa que los nombres sean iguales.');
    }
    const sinPuesto = resultadoPuestos.filter((p) => p.puestoId === null).length;
    if (sinPuesto > 0) avisos.push(`${sinPuesto} puesto(s) del Excel no existen en este contrato y no se importan.`);

    const codigosDesconocidos = [...desconocidos.entries()].map(([codigo, veces]) => ({ codigo, veces }));
    const puedeAplicar = celdas.length > 0 && codigosDesconocidos.length === 0;
    if (codigosDesconocidos.length > 0) {
      avisos.push('Hay códigos de turno que el sistema no conoce. Créalos en «Códigos de turno» y vuelve a subir el archivo.');
    }

    const resultado: ImportResultado = {
      hojas,
      hoja: elegida.nombre,
      rango: { inicio: fechasRango[0], fin: fechasRango[fechasRango.length - 1] },
      puestos: resultadoPuestos,
      codigosDesconocidos,
      totalCeldas: celdas.length,
      avisos,
      puedeAplicar,
      aplicado: false,
    };

    if (!aplicar) return resultado;
    if (!puedeAplicar) {
      throw new BadRequestException(
        codigosDesconocidos.length
          ? 'Hay códigos de turno sin configurar; no se importó nada.'
          : 'No hay turnos para importar.',
      );
    }

    // Solo se reemplazan las celdas de las personas que vienen en el Excel;
    // el resto del puesto queda como estaba.
    await this.prisma.$transaction(async (tx) => {
      const porPersona = new Map<string, CeldaNueva[]>();
      for (const c of celdas) {
        const k = `${c.puestoId}|${c.cedula}`;
        porPersona.set(k, [...(porPersona.get(k) ?? []), c]);
      }
      for (const lista of porPersona.values()) {
        await tx.cPHorarioCelda.deleteMany({
          where: { horarioId, puestoId: lista[0].puestoId, cedula: lista[0].cedula },
        });
      }
      await tx.cPHorarioCelda.createMany({
        data: celdas.map((c) => ({
          horarioId,
          puestoId: c.puestoId,
          cedula: c.cedula,
          nombreGuardia: c.nombreGuardia,
          fecha: new Date(c.fecha),
          codigoTurno: c.codigoTurno,
        })),
      });
    });
    return { ...resultado, aplicado: true };
  }

  /**
   * Abre el libro de Excel y lo convierte, hoja por hoja, en los bloques de puestos que detecta
   * (`detectarBloques`). También lo usa el asistente que crea un contrato desde un Excel.
   */
  async leerLibro(archivo: Buffer): Promise<{ nombre: string; bloques: BloqueExcel[] }[]> {
    if (!archivo?.length) throw new BadRequestException('Falta el archivo de Excel');
    if (archivo.length > MAX_BYTES) throw new BadRequestException('El archivo pesa más de 10 MB');
    const wb = new ExcelJS.Workbook();
    try {
      await wb.xlsx.load(archivo as any);
    } catch (e: any) {
      this.logger.warn(`Excel de horario ilegible: ${e?.message}`);
      throw new BadRequestException('No se pudo leer el archivo. Tiene que ser un Excel (.xlsx).');
    }
    if (!wb.worksheets.length) throw new BadRequestException('El Excel no tiene hojas');
    return wb.worksheets.map((ws) => {
      const m: string[][] = [];
      ws.eachRow({ includeEmpty: false }, (row, i) => {
        const fila: string[] = [];
        row.eachCell({ includeEmpty: false }, (c, col) => {
          fila[col - 1] = textoCelda(c.value).replace(/\s+/g, ' ').trim();
        });
        m[i - 1] = fila;
      });
      return { nombre: ws.name, bloques: detectarBloques(m) };
    });
  }

  private leerBloque(
    b: BloqueExcel,
    puesto: { id: number; nombre: string; guardias: { cedula: string; nombreGuardia: string }[] },
    fechasRango: string[],
    codigoPorTexto: Map<string, string>,
    desconocidos: Map<string, number>,
    celdas: CeldaNueva[],
    info: ImportPuesto,
    avisos: string[],
  ) {
    const fechaDeColumna = mapearColumnasAFechas(b.columnasDia, fechasRango);
    const fueraDeRango = b.columnasDia.length - fechaDeColumna.size;
    if (fueraDeRango > 0) {
      avisos.push(`«${puesto.nombre}»: ${fueraDeRango} columna(s) de día del Excel no caen dentro de las fechas de este horario y se ignoran.`);
    }
    const usadas = new Map<string, number>(); // cédula del sistema → fila del Excel

    for (const p of b.personas) {
      const porCedula = p.cedula ? puesto.guardias.find((g) => g.cedula === p.cedula) : undefined;
      const guardia = porCedula ?? puesto.guardias.find((g) => mismoNombre(g.nombreGuardia, p.nombre));
      const fila: ImportGuardia = {
        fila: p.fila,
        nombre: p.nombre,
        cedula: p.cedula,
        estado: 'OK',
        guardiaNombre: guardia?.nombreGuardia,
        celdas: 0,
      };
      info.guardias.push(fila);

      if (!guardia) {
        fila.estado = 'NO_ASIGNADO';
        continue;
      }
      if (usadas.has(guardia.cedula)) {
        fila.estado = 'REPETIDO';
        continue;
      }
      if (p.palabras.length) {
        avisos.push(`«${puesto.nombre}», fila ${p.fila}: «${p.palabras.join('», «')}» está escrito letra por letra y no se importa como turno (esos días quedan vacíos).`);
      }
      const propias = p.turnos.filter((t) => fechaDeColumna.has(t.col));
      if (!propias.length) {
        fila.estado = 'SIN_TURNOS';
        continue;
      }
      usadas.set(guardia.cedula, p.fila);
      for (const t of propias) {
        const codigo = codigoPorTexto.get(t.codigo);
        if (!codigo) {
          desconocidos.set(t.codigo, (desconocidos.get(t.codigo) ?? 0) + 1);
          continue;
        }
        celdas.push({
          puestoId: puesto.id,
          cedula: guardia.cedula,
          nombreGuardia: guardia.nombreGuardia,
          fecha: fechaDeColumna.get(t.col)!,
          codigoTurno: codigo,
        });
        fila.celdas++;
      }
    }
  }
}
