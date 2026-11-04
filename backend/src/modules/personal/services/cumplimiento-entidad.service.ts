import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { DriveService } from './drive.service';
import { MovimientoPersonalService } from './movimiento-personal.service';

export type RequisitoEstado =
  'CUMPLIDO' | 'FALTANTE' | 'VENCIDO' | 'POR_VENCER';

// Plazo por defecto (días) desde el que un documento pasa a «por vencer» si la empresa no configuró plazos de aviso.
const VENTANA_POR_VENCER_POR_DEFECTO = 30;

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

  /**
   * Desde cuántos días antes un documento pasa a «por vencer» (amarillo): el plazo MÁS LEJANO de los avisos de
   * vencimientos que RRHH configuró (Configuración → Avisos de vencimientos; 30 si no hay). Es una sola regla
   * para el semáforo y para la primera notificación, ya no una anticipación distinta por requisito. Si la
   * tabla de configuración todavía no existe, usa el valor por defecto en vez de romper Cumplimiento.
   */
  async ventanaPorVencerDias(companyId: number): Promise<number> {
    try {
      const fila = await this.prisma.rrhhVigilanteConfig.findUnique({
        where: { companyId },
        select: { avisarDias: true },
      });
      if (!fila || fila.avisarDias.length === 0) return VENTANA_POR_VENCER_POR_DEFECTO;
      return Math.max(...fila.avisarDias);
    } catch {
      return VENTANA_POR_VENCER_POR_DEFECTO;
    }
  }

  async getComplianceForGuardia(companyId: number, cedula: string, ventanaDias?: number) {
    const ventanaAviso = ventanaDias ?? (await this.ventanaPorVencerDias(companyId));
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
  // Asignaciones vigentes de guardias que siguen trabajando.
  private async asignacionesVisibles(companyId: number) {
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
    return asignacionesActivas.filter((a) => !fueraSet.has(a.cedula));
  }

  /** Empresas que tienen al menos un guardia con asignación vigente (las que vigila el vigilante). */
  async companiesConGuardias(): Promise<number[]> {
    const filas = await this.prisma.asignacionGuardia.findMany({
      where: { fechaFin: null },
      select: { companyId: true },
      distinct: ['companyId'],
    });
    return filas.map((f) => f.companyId);
  }

  /**
   * Para el vigilante de vencimientos: cada documento que vence (requisito con duración) y que el
   * guardia ya entregó, con su fecha de vencimiento (null = falta cargarla), y aparte los
   * requisitos que todavía no entregó (`faltantes`).
   */
  async getDocumentosVigilados(companyId: number) {
    const asignaciones = await this.asignacionesVisibles(companyId);
    const documentos: {
      cedula: string;
      guardia: string;
      entidad: string;
      documento: string;
      vence: Date | null;
    }[] = [];
    const faltantes: { cedula: string; guardia: string; entidad: string; documento: string }[] = [];
    // Uno por uno: el pool de conexiones de producción es chico.
    const ventana = await this.ventanaPorVencerDias(companyId);
    for (const asignacion of asignaciones) {
      const compliance = await this.getComplianceForGuardia(companyId, asignacion.cedula, ventana);
      for (const r of compliance.requisitos) {
        const requisito = r.requisito as { nombre: string; duracionValor: number | null };
        if (!r.documento) {
          faltantes.push({
            cedula: asignacion.cedula,
            guardia: asignacion.nombreGuardia,
            entidad: asignacion.entidad.nombre,
            documento: requisito.nombre,
          });
          continue;
        }
        if (!requisito.duracionValor) continue;
        documentos.push({
          cedula: asignacion.cedula,
          guardia: asignacion.nombreGuardia,
          entidad: asignacion.entidad.nombre,
          documento: requisito.nombre,
          vence: r.documento.expiryDate,
        });
      }
    }
    return { documentos, faltantes };
  }

  async getComplianceOverview(companyId: number) {
    const asignacionesVisibles = await this.asignacionesVisibles(companyId);
    const ventana = await this.ventanaPorVencerDias(companyId);

    const overview = await Promise.all(
      asignacionesVisibles.map(async (asignacion) => {
        const compliance = await this.getComplianceForGuardia(
          companyId,
          asignacion.cedula,
          ventana,
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
