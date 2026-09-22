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
    const [
      vacantesAbiertas,
      pendingContracts,
      driveCustodios,
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
      this.prisma.contract.count({ where: { companyId, status: 'DRAFT' } }),
      this.prisma.employeeDriveFolder.findMany({
        where: { companyId, folderType: 'CUSTODIAS' },
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
    // para decidir quién cuenta como "guardia activo": carpetas de Drive tipo
    // CUSTODIAS, excluyendo a quien ya registró salida completada. (Antes
    // también unía candidatos del Kanban con puesto "custodio" — eliminado
    // 2026-09-17 por no ser un flujo real, ver .agents/modules/recursos-humanos.md.)
    const fueraSet = new Set(cedulasFuera);
    const guardiaCedulas = new Set<string>();
    driveCustodios.forEach((f) => guardiaCedulas.add(f.cedula));
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
      pendingContracts,
      guardiasSinAsignacion,
      documentosVencidosOPorVencer,
      movimientosEnProceso,
    };
  }
}
