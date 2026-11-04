import { BadRequestException, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { NotificationsService } from '../../notifications/notifications.service';
import { PermissionsService } from '../../permissions/permissions.service';
import { CumplimientoEntidadService } from '../services/cumplimiento-entidad.service';
import {
  fechaDesdeTexto,
  hoyEcuador,
  textoDesdeFecha,
} from '../../contratacion-publica/entregas/entregas.util';
import {
  CONFIG_VIGILANTE_POR_DEFECTO,
  ConfigVigilante,
  ENLACE_AVISO_VENCIMIENTOS,
  hayAviso,
  MAX_DIAS_PLAZO,
  MAX_PLAZOS,
  MAX_REPETIR_DIAS,
  mensajeDelResumen,
  normalizarPlazos,
  resumirVigilancia,
  TITULO_AVISO_VENCIMIENTOS,
} from './vigilante.util';

/** Mismo SQL que prisma/migrations/20261030_rrhh_vigilante_vencimientos/migration.sql. */
const DDL: string[] = [
  `CREATE TABLE IF NOT EXISTS "RrhhVigilanteConfig" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "avisarDias" INTEGER[] NOT NULL DEFAULT ARRAY[30, 7, 0],
    "repetirVencidoDias" INTEGER NOT NULL DEFAULT 7,
    "resumenLunes" BOOLEAN NOT NULL DEFAULT true,
    "updatedBy" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RrhhVigilanteConfig_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "RrhhVigilanteConfig_companyId_key" ON "RrhhVigilanteConfig"("companyId")`,
];

/** Las 5 horas de diferencia de Ecuador: el día de Ecuador empieza a las 05:00 UTC. */
const MS_EMPIEZA_DIA_ECUADOR = 5 * 60 * 60 * 1000;

export interface ResultadoVigilanteEmpresa {
  companyId: number;
  activo: boolean;
  /** Documentos que vence y que ya se entregaron, revisados hoy. */
  revisados: number;
  vencidos: number;
  vencenHoy: number;
  porVencer: number;
  sinFecha: number;
  /** Requisitos que los guardias todavía no entregaron. */
  faltantes: number;
  destinatarios: number;
  /** Cuántas campanas se dejaron (0 en simulación o si hoy no hay nada que avisar). */
  avisos: number;
  /** Lo que diría el aviso (null si hoy no toca avisar). */
  mensaje: string | null;
}

/**
 * Vigilante de vencimientos de RRHH: una vez al día (Cloud Scheduler) revisa los documentos de los
 * guardias activos, y si alguno cruza un plazo deja UN aviso en la campana del personal de RRHH.
 * No manda correos ni toca documentos: el correo al guardia lo decide RRHH, uno por uno, con el botón
 * «Enviar recordatorio» de Cumplimiento (decisión del 2026-09-09).
 */
@Injectable()
export class VigilanteService implements OnModuleInit {
  private readonly logger = new Logger(VigilanteService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cumplimiento: CumplimientoEntidadService,
    private readonly notifications: NotificationsService,
    private readonly permissions: PermissionsService,
  ) {}

  // La tabla es nueva y solo la lee este código: un fallo aquí no tumba el servidor.
  async onModuleInit() {
    try {
      for (const sql of DDL) await this.prisma.$executeRawUnsafe(sql);
    } catch (err) {
      this.logger.warn(
        `No se pudo asegurar la tabla del vigilante de vencimientos: ${(err as Error).message}`,
      );
    }
  }

  async getConfig(companyId: number): Promise<ConfigVigilante> {
    const fila = await this.prisma.rrhhVigilanteConfig.findUnique({ where: { companyId } });
    if (!fila) return { ...CONFIG_VIGILANTE_POR_DEFECTO };
    return {
      activo: fila.activo,
      avisarDias: normalizarPlazos(fila.avisarDias),
      repetirVencidoDias: fila.repetirVencidoDias,
      resumenLunes: fila.resumenLunes,
    };
  }

  async guardarConfig(
    companyId: number,
    userId: number,
    dto: { activo?: boolean; avisarDias?: number[]; repetirVencidoDias?: number; resumenLunes?: boolean },
  ): Promise<ConfigVigilante> {
    const actual = await this.getConfig(companyId);
    const avisarDias = dto.avisarDias === undefined ? actual.avisarDias : normalizarPlazos(dto.avisarDias);
    if (dto.avisarDias !== undefined && avisarDias.length !== new Set(dto.avisarDias.map(Number)).size) {
      throw new BadRequestException(
        `Los plazos deben ser números enteros de 0 a ${MAX_DIAS_PLAZO} (máximo ${MAX_PLAZOS}).`,
      );
    }
    const repetir = dto.repetirVencidoDias ?? actual.repetirVencidoDias;
    if (!Number.isInteger(repetir) || repetir < 0 || repetir > MAX_REPETIR_DIAS) {
      throw new BadRequestException(
        `«Repetir cada» debe ser un número entero de 0 a ${MAX_REPETIR_DIAS} (0 = no repetir).`,
      );
    }
    const datos = {
      activo: dto.activo ?? actual.activo,
      avisarDias,
      repetirVencidoDias: repetir,
      resumenLunes: dto.resumenLunes ?? actual.resumenLunes,
      updatedBy: userId,
    };
    await this.prisma.rrhhVigilanteConfig.upsert({
      where: { companyId },
      update: datos,
      create: { companyId, ...datos },
    });
    return this.getConfig(companyId);
  }

  // Los documentos de la empresa con su día de vencimiento (medianoche UTC del día).
  private async documentosDe(companyId: number) {
    const { documentos, faltantes } = await this.cumplimiento.getDocumentosVigilados(companyId);
    return {
      documentos: documentos.map((d) => ({
        ...d,
        vence: d.vence ? fechaDesdeTexto(textoDesdeFecha(d.vence)) : null,
      })),
      faltantes,
    };
  }

  /**
   * «Probar ahora» (botón de Configuración): deja en la campana de QUIEN LO PULSA, y solo en la suya,
   * el resumen completo del estado actual (lo vencido, lo que vence en sus plazos, lo que no tiene fecha
   * y lo que falta), igual que se vería en el resumen del lunes. No avisa a nadie más y se puede repetir.
   */
  async probar(companyId: number, userId: number) {
    const config = await this.getConfig(companyId);
    const hoy = hoyEcuador();
    const { documentos, faltantes } = await this.documentosDe(companyId);
    const resumen = resumirVigilancia(documentos, config, hoy, { faltantes, forzarResumen: true });
    const detalle = mensajeDelResumen(resumen, config);
    const mensaje =
      detalle ||
      'Todo en orden: no hay documentos vencidos, por vencer, sin fecha ni faltantes.';
    await this.notifications.create({
      userId,
      companyId,
      title: `${TITULO_AVISO_VENCIMIENTOS} · prueba`,
      message: `Notificación de prueba: solo la ves tú.\n${mensaje}`,
      link: ENLACE_AVISO_VENCIMIENTOS,
    });
    return {
      revisados: documentos.length,
      vencidos: resumen.vencidosTotal,
      porVencer: resumen.porVencer.length + resumen.vencenHoy.length,
      sinFecha: resumen.sinFecha.length,
      faltantes: resumen.faltantes.length,
      mensaje,
    };
  }

  /**
   * La corrida diaria: recorre todas las empresas con guardias y deja el aviso en la campana de RRHH.
   * `dryRun` calcula todo sin dejar ninguna campana.
   */
  async procesar(
    opciones: { dryRun?: boolean; ahora?: Date } = {},
  ): Promise<{ fecha: string; empresas: ResultadoVigilanteEmpresa[] }> {
    const ahora = opciones.ahora ?? new Date();
    const hoy = hoyEcuador(ahora);
    const empresas = await this.cumplimiento.companiesConGuardias();

    const resultados: ResultadoVigilanteEmpresa[] = [];
    for (const companyId of empresas) {
      try {
        resultados.push(await this.procesarEmpresa(companyId, hoy, opciones.dryRun === true));
      } catch (err) {
        // Un fallo en una empresa no debe impedir revisar las demás.
        this.logger.error(
          `Vigilante de vencimientos: falló la empresa ${companyId}: ${(err as Error).message}`,
        );
      }
    }
    return { fecha: textoDesdeFecha(hoy), empresas: resultados };
  }

  private async procesarEmpresa(
    companyId: number,
    hoy: Date,
    dryRun: boolean,
  ): Promise<ResultadoVigilanteEmpresa> {
    const config = await this.getConfig(companyId);
    const vacio: ResultadoVigilanteEmpresa = {
      companyId,
      activo: config.activo,
      revisados: 0,
      vencidos: 0,
      vencenHoy: 0,
      porVencer: 0,
      sinFecha: 0,
      faltantes: 0,
      destinatarios: 0,
      avisos: 0,
      mensaje: null,
    };
    if (!config.activo) return vacio;

    const { documentos, faltantes } = await this.documentosDe(companyId);
    const resumen = resumirVigilancia(documentos, config, hoy, { faltantes });
    const toca = hayAviso(resumen, config);
    const destinatarios = await this.permissions.getCompanyUserIdsWithWriteAccess(companyId, 'RRHH');

    const resultado: ResultadoVigilanteEmpresa = {
      ...vacio,
      revisados: documentos.length,
      vencidos: resumen.vencidos.length,
      vencenHoy: resumen.vencenHoy.length,
      porVencer: resumen.porVencer.length,
      sinFecha: resumen.sinFecha.length,
      faltantes: resumen.faltantes.length,
      destinatarios: destinatarios.length,
      mensaje: toca ? mensajeDelResumen(resumen, config) : null,
    };
    if (!toca || dryRun || destinatarios.length === 0 || !resultado.mensaje) return resultado;

    // Repetir la corrida el mismo día (reintento de Cloud Scheduler) no duplica la campana.
    const desde = new Date(hoy.getTime() + MS_EMPIEZA_DIA_ECUADOR);
    for (const userId of destinatarios) {
      const yaAvisada = await this.prisma.notification.findFirst({
        where: { userId, companyId, title: TITULO_AVISO_VENCIMIENTOS, createdAt: { gte: desde } },
        select: { id: true },
      });
      if (yaAvisada) continue;
      try {
        await this.notifications.create({
          userId,
          companyId,
          title: TITULO_AVISO_VENCIMIENTOS,
          message: resultado.mensaje,
          link: ENLACE_AVISO_VENCIMIENTOS,
        });
        resultado.avisos++;
      } catch (err) {
        this.logger.warn(`No se pudo avisar al usuario ${userId}: ${(err as Error).message}`);
      }
    }
    return resultado;
  }
}
