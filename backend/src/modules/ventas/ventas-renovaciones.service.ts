import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PermissionsService } from '../permissions/permissions.service';
import { VentasOportunidadesService } from './ventas-oportunidades.service';
import { hoyEcuador, parseDiaContrato, sumarDias } from './agreement-status.util';

// Fase 4 (2026-10-18): renovaciones como oportunidad.
//
// Cada día (Cloud Scheduler → POST /ventas/renovaciones-cron/generar) se revisan los contratos
// de SERVICIO y, a los que ya están «Por vencer» (faltan 30 días o menos) o vencieron pero siguen
// dentro de sus días de gracia, se les abre UNA oportunidad «Renovación – contrato» en etapa
// Nueva, sin responsable (decisión de la usuaria): se avisa al equipo de Ventas y alguien la toma.
// Los productos, los contratos sin fecha de fin, los cancelados y los ya renovados no generan nada.
// Es idempotente: si el contrato ya tiene su oportunidad de renovación (abierta o cerrada) no se
// crea otra.

export const DIAS_AVISO_RENOVACION = 30;

export interface RenovacionGenerada {
  contratoId: number;
  oportunidadId: number;
  empresaId: number;
  cliente: string;
  contrato: string;
  fin: string;
  // Días que faltan para el fin; negativo = ya venció (dentro de la gracia).
  diasParaFin: number;
}

const DIA_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class VentasRenovacionesService {
  private readonly logger = new Logger(VentasRenovacionesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly oportunidades: VentasOportunidadesService,
    private readonly notifications: NotificationsService,
    private readonly permissions: PermissionsService,
  ) {}

  /**
   * Abre las oportunidades de renovación que falten. `dryRun` solo cuenta y lista lo que crearía.
   * `companyId` limita la revisión a una empresa (por defecto, todas).
   */
  async generar(opts: { dryRun?: boolean; companyId?: number } = {}) {
    const hoy = hoyEcuador();
    const hoyD = parseDiaContrato(hoy)!;
    const limite = sumarDias(hoyD, DIAS_AVISO_RENOVACION);

    const candidatos = await this.prisma.salesAgreement.findMany({
      where: {
        kind: 'SERVICIO',
        status: 'ACTIVO',
        endDate: { not: null, lte: limite },
        ...(opts.companyId ? { companyId: opts.companyId } : {}),
      },
      include: {
        salesClient: { select: { id: true, name: true } },
        services: { select: { serviceId: true } },
      },
      orderBy: [{ endDate: 'asc' }, { id: 'asc' }],
    });

    // Ya vencidos pero pasada la gracia: el cliente ya es Inactivo, no se persigue.
    const vigentes = candidatos.filter((c) => {
      const fin = c.endDate!.getTime();
      return hoyD.getTime() <= fin + c.graceDays * DIA_MS;
    });

    const existentes = vigentes.length
      ? await this.prisma.salesOpportunity.findMany({
          where: { renewsAgreementId: { in: vigentes.map((c) => c.id) } },
          select: { renewsAgreementId: true },
        })
      : [];
    const yaTienen = new Set(existentes.map((o) => o.renewsAgreementId));
    const pendientes = vigentes.filter((c) => !yaTienen.has(c.id));

    const creadas: RenovacionGenerada[] = [];
    const errores: { contratoId: number; error: string }[] = [];
    const etapaInicial = new Map<number, string | null>();

    for (const c of pendientes) {
      const fin = c.endDate!.toISOString().slice(0, 10);
      const diasParaFin = Math.round((c.endDate!.getTime() - hoyD.getTime()) / DIA_MS);
      const nombre = c.title || `Contrato #${c.id}`;
      if (opts.dryRun) {
        creadas.push({
          contratoId: c.id,
          oportunidadId: 0,
          empresaId: c.companyId,
          cliente: c.salesClient.name,
          contrato: nombre,
          fin,
          diasParaFin,
        });
        continue;
      }
      try {
        if (!etapaInicial.has(c.companyId)) {
          const e = await this.prisma.salesClientStage.findFirst({
            where: { companyId: c.companyId, isInitial: true },
          });
          etapaInicial.set(c.companyId, e?.key ?? null);
        }
        const opp = await this.prisma.$transaction(async (tx) => {
          const o = await this.oportunidades.crearInicial(tx, {
            companyId: c.companyId,
            salesClientId: c.salesClientId,
            status: etapaInicial.get(c.companyId) ?? null,
            // El sistema no es un usuario: se firma con quien creó el contrato.
            createdBy: c.createdBy,
            assignedUserId: null,
            originType: 'RENOVACION',
            renewsAgreementId: c.id,
            serviceIds: c.services.map((s) => s.serviceId),
            title: `Renovación – ${nombre}`.slice(0, 150),
            notes: `Creada sola por el sistema: ${diasParaFin >= 0 ? `el contrato termina el ${fin} (faltan ${diasParaFin} día${diasParaFin === 1 ? '' : 's'})` : `el contrato terminó el ${fin} y sigue dentro de sus ${c.graceDays} días de gracia`}.`,
          });
          await this.oportunidades.espejarCliente(tx, c.salesClientId);
          return o;
        });
        creadas.push({
          contratoId: c.id,
          oportunidadId: opp.id,
          empresaId: c.companyId,
          cliente: c.salesClient.name,
          contrato: nombre,
          fin,
          diasParaFin,
        });
        await this.avisarEquipo(c.companyId, c.salesClient.name, nombre, fin, diasParaFin);
      } catch (err) {
        const mensaje = err instanceof Error ? err.message : 'error desconocido';
        this.logger.error(`No se pudo crear la renovación del contrato #${c.id}: ${mensaje}`);
        errores.push({ contratoId: c.id, error: mensaje });
      }
    }

    return {
      dryRun: !!opts.dryRun,
      revisados: candidatos.length,
      sinGraciaYa: candidatos.length - vigentes.length,
      yaTenian: vigentes.length - pendientes.length,
      creadas,
      errores,
    };
  }

  // Aviso en la campana a los de Ventas con «Escribir» marcado, igual que un posible cliente nuevo.
  // Un fallo acá nunca debe deshacer la oportunidad ya creada.
  private async avisarEquipo(
    companyId: number,
    cliente: string,
    contrato: string,
    fin: string,
    diasParaFin: number,
  ) {
    try {
      const equipo = (
        await this.permissions.getUsersWithExplicitSectionWrite('VENTAS')
      ).filter((u) => u.companyId === companyId);
      const cuando =
        diasParaFin > 0
          ? `termina el ${fin} (faltan ${diasParaFin} día${diasParaFin === 1 ? '' : 's'})`
          : diasParaFin === 0
            ? `termina hoy (${fin})`
            : `terminó el ${fin} y sigue en sus días de gracia`;
      for (const persona of equipo) {
        try {
          await this.notifications.create({
            userId: persona.id,
            companyId: persona.companyId,
            title: 'Renovación por atender',
            message: `${cliente}: el contrato «${contrato}» ${cuando}. Se abrió su oportunidad de renovación en Oportunidades, sin responsable: tómala con «Asignarme».`,
            link: '/ventas/oportunidades',
          });
        } catch (err) {
          this.logger.error(
            `No se pudo avisar al usuario ${persona.id} de la renovación de ${cliente}: ${(err as Error).message}`,
          );
        }
      }
    } catch (err) {
      this.logger.error(
        `No se pudo avisar de la renovación de ${cliente}: ${(err as Error).message}`,
      );
    }
  }

  // Un contrato renovado a mano con «Renovar» cierra su oportunidad abierta como ganada.
  async alRenovarManual(companyId: number, userId: number, contratoId: number) {
    return this.oportunidades.cerrarRenovacionesAbiertas(
      companyId,
      contratoId,
      userId,
      'GANADA',
      'El contrato se renovó desde Contratos.',
    );
  }

  // Un contrato cancelado ya no se renueva: su oportunidad abierta se cierra como perdida.
  async alCancelar(companyId: number, userId: number, contratoId: number) {
    return this.oportunidades.cerrarRenovacionesAbiertas(
      companyId,
      contratoId,
      userId,
      'PERDIDA',
      'El contrato se canceló, así que ya no hay nada que renovar.',
    );
  }

  // Un contrato eliminado se lleva sus oportunidades de renovación ABIERTAS (sin FK, no se borrarían solas).
  async alEliminar(companyId: number, contratoId: number) {
    const abiertas = await this.prisma.salesOpportunity.findMany({
      where: { companyId, renewsAgreementId: contratoId, closedAt: null },
      select: { id: true },
    });
    for (const o of abiertas) {
      await this.oportunidades.remove(companyId, o.id);
    }
    return abiertas.length;
  }
}
