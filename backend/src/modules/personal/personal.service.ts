import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { MovimientoPersonalService } from './services/movimiento-personal.service';
import { CumplimientoEntidadService } from './services/cumplimiento-entidad.service';

@Injectable()
export class PersonalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly movimientoPersonalService: MovimientoPersonalService,
    private readonly cumplimientoEntidadService: CumplimientoEntidadService,
  ) {}

  async getDashboard(companyId: number) {
    const now = new Date();
    const [
      vacantesAbiertas,
      activeCertifications,
      pendingContracts,
      alertCount,
      driveCustodios,
      candidatosCustodio,
      asignacionesActivas,
      cedulasFuera,
      movimientosEnProceso,
      complianceOverview,
    ] = await Promise.all([
      // Antes contaba filas de `Candidate` (el Kanban de Sistema B, que no es
      // el flujo real de contratación — ver .agents/modules/reclutamiento.md
      // Sprint 6). El Reclutamiento real vive en Drive vía JobPosition, así
      // que la vacante abierta es el número que de verdad refleja actividad.
      this.prisma.jobPosition.count({ where: { companyId, estado: 'ABIERTA' } }),
      this.prisma.certification.count({
        where: { companyId, status: 'ACTIVE' },
      }),
      this.prisma.contract.count({ where: { companyId, status: 'DRAFT' } }),
      // Mismo criterio que CertificationService.getAlerts: sin el `gte` el KPI
      // sumaba certificaciones ya vencidas y no cuadraba con la lista de alertas.
      this.prisma.certification.count({
        where: {
          companyId,
          status: 'ACTIVE',
          expiryDate: {
            gte: now,
            lte: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000),
          },
        },
      }),
      this.prisma.employeeDriveFolder.findMany({
        where: { companyId, folderType: 'CUSTODIAS' },
        select: { cedula: true },
      }),
      this.prisma.candidate.findMany({
        where: {
          companyId,
          positionApplied: { contains: 'custodio', mode: 'insensitive' },
        },
        select: { cedula: true },
      }),
      this.prisma.asignacionGuardia.findMany({
        where: { companyId, fechaFin: null },
        select: { cedula: true },
      }),
      this.movimientoPersonalService.getCedulasFuera(companyId),
      this.prisma.movimientoPersonal.count({
        where: { companyId, estado: 'EN_PROCESO' },
      }),
      this.cumplimientoEntidadService.getComplianceOverview(companyId),
    ]);

    // Mismo criterio que GuardiasList.tsx/CustodiasService.getAvailableCustodios
    // para decidir quién cuenta como "guardia activo": unión de carpetas de
    // Drive tipo CUSTODIAS + candidatos de reclutamiento con puesto "custodio",
    // excluyendo a quien ya registró salida completada.
    const fueraSet = new Set(cedulasFuera);
    const guardiaCedulas = new Set<string>();
    driveCustodios.forEach((f) => guardiaCedulas.add(f.cedula));
    candidatosCustodio.forEach((c) => guardiaCedulas.add(c.cedula));
    fueraSet.forEach((c) => guardiaCedulas.delete(c));
    const asignadasSet = new Set(asignacionesActivas.map((a) => a.cedula));
    const guardiasSinAsignacion = Array.from(guardiaCedulas).filter(
      (c) => !asignadasSet.has(c),
    ).length;

    const documentosVencidosOPorVencer = complianceOverview.reduce(
      (acc, item) =>
        acc + item.requisitosVencidos.length + item.requisitosPorVencer.length,
      0,
    );

    return {
      vacantesAbiertas,
      activeCertifications,
      pendingContracts,
      alertCount,
      guardiasSinAsignacion,
      documentosVencidosOPorVencer,
      movimientosEnProceso,
    };
  }
}
