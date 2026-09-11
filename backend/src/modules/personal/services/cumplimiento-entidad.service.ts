import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { DriveService } from './drive.service';
import { MovimientoPersonalService } from './movimiento-personal.service';

export type RequisitoEstado =
  'CUMPLIDO' | 'FALTANTE' | 'VENCIDO' | 'POR_VENCER';

// Factores de conversión a días — DIAS es exacto, SEMANAS es exacto (7 días
// calendario), MESES usa 30 como aproximación (alcanza para decidir si ya se
// entró en la "ventana" de aviso, no se necesita precisión calendario real).
const ANTICIPACION_DIAS_POR_UNIDAD: Record<string, number> = {
  DIAS: 1,
  SEMANAS: 7,
  MESES: 30,
};

function anticipacionEnDias(valor: number, unidad: string): number {
  return valor * (ANTICIPACION_DIAS_POR_UNIDAD[unidad] ?? 1);
}

export interface RequisitoConEstado {
  requisito: unknown;
  estado: RequisitoEstado;
  documento?: {
    id: number;
    fileName: string;
    fileUrl: string;
    driveFileId: string;
    issueDate: Date | null;
    expiryDate: Date | null;
  };
}

@Injectable()
export class CumplimientoEntidadService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly driveService: DriveService,
    private readonly movimientoPersonalService: MovimientoPersonalService,
  ) {}

  // Requisitos que aplican a una entidad: los GLOBAL (mínimo de toda la
  // empresa), los del tipo de la entidad (PUBLICA/PRIVADA), y los específicos
  // de esta entidad (aplicaA='ENTIDAD' && entidadId coincide).
  async getRequisitosAplicables(companyId: number, entidadId: number) {
    const entidad = await this.prisma.entidad.findFirst({
      where: { id: entidadId, companyId },
    });
    if (!entidad) throw new NotFoundException('Entidad no encontrada');

    return this.prisma.requisitoDocumento.findMany({
      where: {
        companyId,
        OR: [
          { aplicaA: 'GLOBAL' },
          { aplicaA: entidad.tipo },
          { aplicaA: 'ENTIDAD', entidadId: entidad.id },
        ],
      },
      orderBy: { nombre: 'asc' },
    });
  }

  async getComplianceForGuardia(companyId: number, cedula: string) {
    const asignacion = await this.prisma.asignacionGuardia.findFirst({
      where: { companyId, cedula, fechaFin: null },
      include: { entidad: true },
      orderBy: { fechaInicio: 'desc' },
    });

    if (!asignacion) {
      return {
        cedula,
        tieneAsignacion: false,
        mensaje: 'Este guardia no tiene una asignación activa.',
        asignacion: null,
        entidad: null,
        requisitos: [] as RequisitoConEstado[],
      };
    }

    const requisitos = await this.getRequisitosAplicables(
      companyId,
      asignacion.entidadId,
    );

    const documentos = await this.prisma.employeeDocument.findMany({
      where: { companyId, cedula, folder: 'CUSTODIAS' },
      orderBy: { createdAt: 'desc' },
    });

    const now = new Date();
    const requisitosConEstado = requisitos.map((requisito) => {
      const documento = this.driveService.findMatchingDocument(
        documentos,
        requisito.nombre,
      );

      let estado: RequisitoEstado;
      if (!documento) {
        estado = 'FALTANTE';
      } else if (!requisito.duracionValor) {
        // Requisito configurado como "no vence": ignorar cualquier
        // expiryDate que Drive haya extraído del documento — nunca debe
        // avisar como VENCIDO/POR_VENCER.
        estado = 'CUMPLIDO';
      } else if (documento.expiryDate && documento.expiryDate < now) {
        estado = 'VENCIDO';
      } else if (documento.expiryDate) {
        const diasParaVencer = Math.round(
          (documento.expiryDate.getTime() - now.getTime()) /
            (1000 * 60 * 60 * 24),
        );
        const ventanaAviso = anticipacionEnDias(
          requisito.anticipacionValor,
          requisito.anticipacionUnidad,
        );
        estado = diasParaVencer <= ventanaAviso ? 'POR_VENCER' : 'CUMPLIDO';
      } else {
        estado = 'CUMPLIDO';
      }

      return {
        requisito,
        estado,
        documento: documento
          ? {
              id: documento.id,
              fileName: documento.fileName,
              fileUrl: documento.fileUrl,
              driveFileId: documento.driveFileId,
              issueDate: documento.issueDate,
              expiryDate: documento.expiryDate,
            }
          : undefined,
      };
    });

    return {
      cedula,
      tieneAsignacion: true,
      mensaje: null,
      asignacion,
      entidad: asignacion.entidad,
      requisitos: requisitosConEstado,
    };
  }

  // Corre getComplianceForGuardia para cada AsignacionGuardia vigente de la
  // empresa (fechaFin null) y devuelve una lista plana ordenada con los peores
  // casos primero (más faltantes+vencidos primero), mismo criterio de
  // "peor primero" con desempates en cascada que ya usa
  // DriveService.syncReclutamientoCandidates para priorizar candidatos.
  async getComplianceOverview(companyId: number) {
    const [asignacionesActivas, cedulasFuera] = await Promise.all([
      this.prisma.asignacionGuardia.findMany({
        where: { companyId, fechaFin: null },
        include: { entidad: true },
      }),
      this.movimientoPersonalService.getCedulasFuera(companyId),
    ]);

    // Un guardia con salida ya completada no debe aparecer en Cumplimiento,
    // aunque el sync de Drive todavía no haya cerrado su AsignacionGuardia
    // (ej. su carpeta sigue en Drive pero ya no trabaja para la empresa).
    const fueraSet = new Set(cedulasFuera);
    const asignacionesVisibles = asignacionesActivas.filter(
      (a) => !fueraSet.has(a.cedula),
    );

    const overview = await Promise.all(
      asignacionesVisibles.map(async (asignacion) => {
        const compliance = await this.getComplianceForGuardia(
          companyId,
          asignacion.cedula,
        );

        const requisitosFaltantes = compliance.requisitos.filter(
          (r) => r.estado === 'FALTANTE',
        );
        const requisitosVencidos = compliance.requisitos.filter(
          (r) => r.estado === 'VENCIDO',
        );
        const requisitosPorVencer = compliance.requisitos.filter(
          (r) => r.estado === 'POR_VENCER',
        );
        const cumplidos = compliance.requisitos.filter(
          (r) => r.estado === 'CUMPLIDO',
        ).length;

        return {
          asignacion,
          entidad: asignacion.entidad,
          requisitosFaltantes,
          requisitosVencidos,
          requisitosPorVencer,
          totalRequisitos: compliance.requisitos.length,
          cumplidos,
        };
      }),
    );

    overview.sort(
      (a, b) =>
        b.requisitosFaltantes.length +
          b.requisitosVencidos.length -
          (a.requisitosFaltantes.length + a.requisitosVencidos.length) ||
        b.requisitosVencidos.length - a.requisitosVencidos.length ||
        b.requisitosPorVencer.length - a.requisitosPorVencer.length ||
        a.cumplidos - b.cumplidos ||
        a.asignacion.nombreGuardia.localeCompare(b.asignacion.nombreGuardia),
    );

    return overview;
  }
}
