import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { CPHorariosService } from './horarios.service';
import { formatFechaISO, parseFechaUTC } from '../shared/fecha-rango.util';
import type { HorarioPdfData } from './horarios-pdf.service';
import { normalizarCedula } from './horarios-importar.util';
import {
  armarEjecutado,
  type CustodiaDelDia,
  type ResultadoEjecutado,
} from './horario-ejecutado.util';

const MS_HORA = 3_600_000;
/** Ecuador es UTC-5 todo el año: su día empieza a las 05:00 UTC. */
const diaEcuador = (d: Date) => new Date(d.getTime() - 5 * MS_HORA).toISOString().slice(0, 10);

export interface HorarioEjecutadoVista extends ResultadoEjecutado {
  horarioId: number;
  rango: { inicio: string; fin: string };
  estado: string;
  puestos: { id: number; nombre: string }[];
}

@Injectable()
export class CPHorariosEjecutadoService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly horarios: CPHorariosService,
  ) {}

  async ejecutado(id: number, companyId: number): Promise<HorarioEjecutadoVista> {
    const horario = await this.prisma.cPHorarioMensual.findFirst({
      where: { id, companyId },
      include: { celdas: true },
    });
    if (!horario) throw new NotFoundException('Horario mensual no encontrado');

    const inicio = formatFechaISO(parseFechaUTC(horario.fechaInicio));
    const fin = formatFechaISO(parseFechaUTC(horario.fechaFin));
    // Ventana de custodias en días de Ecuador: desde las 00:00 del primer día hasta las 24:00 del último.
    const desde = new Date(parseFechaUTC(horario.fechaInicio) + 5 * MS_HORA);
    const hasta = new Date(parseFechaUTC(horario.fechaFin) + 24 * MS_HORA + 5 * MS_HORA);

    const [puestos, codigos, ausencias, custodias] = await Promise.all([
      this.prisma.cPPuestoServicio.findMany({
        where: { contratoId: horario.contratoId, companyId },
        select: { id: true, nombre: true },
        orderBy: { nombre: 'asc' },
      }),
      this.prisma.cPCodigoTurno.findMany({ where: { companyId } }),
      this.prisma.cPAusencia.findMany({
        where: {
          companyId,
          contratoId: horario.contratoId,
          fecha: { gte: horario.fechaInicio, lte: horario.fechaFin },
          estado: { not: 'ANULADA' },
        },
      }),
      this.prisma.custodia.findMany({
        where: { companyId, fechaHoraSalida: { gte: desde, lt: hasta } },
        select: { numeroGuia: true, fechaHoraSalida: true, custodio1Cedula: true, custodio2Cedula: true },
      }),
    ]);

    const custodiasDelDia: CustodiaDelDia[] = custodias
      .filter((c) => c.fechaHoraSalida)
      .map((c) => ({
        fecha: diaEcuador(c.fechaHoraSalida as Date),
        guia: c.numeroGuia,
        cedulas: [c.custodio1Cedula, c.custodio2Cedula]
          .map((x) => normalizarCedula(x))
          .filter((x): x is string => !!x),
      }));

    const resultado = armarEjecutado(
      horario.celdas.map((c) => ({
        puestoId: c.puestoId,
        cedula: c.cedula,
        nombre: c.nombreGuardia,
        fecha: formatFechaISO(parseFechaUTC(c.fecha)),
        codigo: c.codigoTurno,
      })),
      ausencias.map((a) => ({
        puestoId: a.puestoId,
        fecha: formatFechaISO(parseFechaUTC(a.fecha)),
        cedula: a.cedula,
        estado: a.estado,
        motivo: a.motivo,
        reemplazoCedula: a.reemplazoCedula,
        reemplazoNombre: a.reemplazoNombre,
      })),
      custodiasDelDia,
      Object.fromEntries(codigos.map((c) => [c.codigo, { esDescanso: c.esDescanso, esCustodia: c.esCustodia }])),
    );

    return { ...resultado, horarioId: id, rango: { inicio, fin }, estado: horario.estado, puestos };
  }

  /** Mismos datos que el Excel del horario, pero con lo que realmente pasó (F = faltó). */
  async datosParaExcel(id: number, companyId: number): Promise<HorarioPdfData> {
    const [base, vista] = await Promise.all([this.horarios.getPdfData(id, companyId), this.ejecutado(id, companyId)]);
    const porPuesto = new Map<string, typeof vista.celdas>();
    const nombrePuesto = new Map(vista.puestos.map((p) => [p.id, p.nombre]));
    for (const c of vista.celdas) {
      const nombre = nombrePuesto.get(c.puestoId);
      if (!nombre) continue;
      porPuesto.set(nombre, [...(porPuesto.get(nombre) ?? []), c]);
    }
    return {
      ...base,
      titulo: 'GEMESEG — Horario EJECUTADO de Guardias (lo que realmente pasó; F = faltó)',
      hoja: 'Ejecutado',
      colorPorCodigo: { ...base.colorPorCodigo, F: '#feb2b2' },
      puestos: base.puestos.map((p) => {
        const filas = new Map<string, { cedula: string; nombreGuardia: string; porFecha: Record<string, string> }>();
        for (const c of porPuesto.get(p.nombre) ?? []) {
          const fila = filas.get(c.cedula) ?? { cedula: c.cedula, nombreGuardia: c.nombre, porFecha: {} };
          const codigo = c.estado === 'FALTO' ? 'F' : c.ejecutado;
          if (codigo) fila.porFecha[c.fecha] = codigo;
          filas.set(c.cedula, fila);
        }
        return { ...p, filas: Array.from(filas.values()) };
      }),
    };
  }
}
