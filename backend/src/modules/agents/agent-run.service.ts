import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AGENT_RUN_DDL } from './agent-run.schema';
import {
  INSTRUCCIONES_BITACORAS_POR_DEFECTO,
  NOMBRE_AGENTE_BITACORAS,
  SCOPE_BITACORAS,
} from './agent-trabajadores.const';

export interface RegistroDeAgente {
  agentId: number | null;
  agentNombre: string;
  agentScope: string | null;
  companyId: number | null;
  userId: number | null;
  userNombre: string | null;
  accion: string;
  resumen?: string | null;
  entidadTipo?: string | null;
  entidadId?: number | null;
  modelo?: string | null;
  tokensEntrada?: number | null;
  tokensSalida?: number | null;
  duracionMs?: number | null;
  exito: boolean;
  error?: string | null;
  detalle?: Record<string, unknown> | null;
}

export interface AgenteTrabajador {
  id: number;
  name: string;
  isActive: boolean;
  instructions: string;
  scope: string;
}

/**
 * Registro de actividad de los agentes que trabajan solos (tabla AgentRun) y
 * siembra de esos agentes en el catálogo. Un fallo al registrar nunca debe
 * deshacer el trabajo del agente: solo se deja constancia en el log.
 */
@Injectable()
export class AgentRunService implements OnModuleInit {
  private readonly logger = new Logger(AgentRunService.name);

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    try {
      for (const sql of AGENT_RUN_DDL) await this.prisma.$executeRawUnsafe(sql);
    } catch (err) {
      this.logger.warn(
        `No se pudo asegurar la tabla AgentRun: ${(err as Error).message}`,
      );
    }
    try {
      await this.sembrarRevisorDeBitacoras();
    } catch (err) {
      this.logger.warn(
        `No se pudo sembrar el Agente Revisor de Bitácoras: ${(err as Error).message}`,
      );
    }
  }

  // Nunca pisa uno que ya exista: su texto se edita desde Sistemas → Agentes.
  private async sembrarRevisorDeBitacoras() {
    const existe = await this.prisma.agent.findFirst({
      where: { createdBy: null, scope: SCOPE_BITACORAS },
      select: { id: true },
    });
    if (existe) return;
    await this.prisma.agent.create({
      data: {
        name: NOMBRE_AGENTE_BITACORAS,
        instructions: INSTRUCCIONES_BITACORAS_POR_DEFECTO,
        scope: SCOPE_BITACORAS,
        isDefault: false,
      },
    });
  }

  /** El agente trabajador de un scope (null si aún no existe). */
  async obtenerTrabajador(scope: string): Promise<AgenteTrabajador | null> {
    return this.prisma.agent.findFirst({
      where: { createdBy: null, scope },
      select: {
        id: true,
        name: true,
        isActive: true,
        instructions: true,
        scope: true,
      },
    });
  }

  async registrar(r: RegistroDeAgente): Promise<void> {
    try {
      await this.prisma.agentRun.create({
        data: {
          agentId: r.agentId,
          agentNombre: r.agentNombre,
          agentScope: r.agentScope,
          companyId: r.companyId,
          userId: r.userId,
          userNombre: r.userNombre,
          accion: r.accion,
          resumen: r.resumen ?? null,
          entidadTipo: r.entidadTipo ?? null,
          entidadId: r.entidadId ?? null,
          modelo: r.modelo ?? null,
          tokensEntrada: r.tokensEntrada ?? null,
          tokensSalida: r.tokensSalida ?? null,
          duracionMs: r.duracionMs ?? null,
          exito: r.exito,
          error: r.error ? r.error.slice(0, 1000) : null,
          detalle: r.detalle
            ? (r.detalle as Prisma.InputJsonObject)
            : undefined,
        },
      });
    } catch (err) {
      this.logger.warn(
        `No se pudo registrar la actividad del agente: ${(err as Error).message}`,
      );
    }
  }

  /** `companyId` null = super admin: ve todas las empresas. */
  async listar(
    companyId: number | null,
    filtros: {
      agentId?: number;
      exito?: boolean;
      limit?: number;
      offset?: number;
    },
  ) {
    const where = {
      ...(companyId !== null ? { companyId } : {}),
      ...(filtros.agentId ? { agentId: filtros.agentId } : {}),
      ...(filtros.exito !== undefined ? { exito: filtros.exito } : {}),
    };
    const limit = Math.min(Math.max(filtros.limit ?? 50, 1), 200);
    const [total, items] = await Promise.all([
      this.prisma.agentRun.count({ where }),
      this.prisma.agentRun.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: Math.max(filtros.offset ?? 0, 0),
      }),
    ]);
    return { total, items };
  }

  /** Por agente, lo ocurrido en los últimos `dias`. */
  async resumen(companyId: number | null, dias = 30) {
    const desde = new Date(Date.now() - Math.max(dias, 1) * 86400000);
    const runs = await this.prisma.agentRun.findMany({
      where: {
        ...(companyId !== null ? { companyId } : {}),
        createdAt: { gte: desde },
      },
      select: {
        agentId: true,
        agentNombre: true,
        exito: true,
        duracionMs: true,
        tokensEntrada: true,
        tokensSalida: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });
    const porAgente = new Map<
      string,
      {
        agentId: number | null;
        agentNombre: string;
        ejecuciones: number;
        errores: number;
        duraciones: number[];
        tokens: number;
        ultima: Date;
      }
    >();
    for (const r of runs) {
      const clave = `${r.agentId ?? 'x'}|${r.agentNombre}`;
      const a = porAgente.get(clave) ?? {
        agentId: r.agentId,
        agentNombre: r.agentNombre,
        ejecuciones: 0,
        errores: 0,
        duraciones: [],
        tokens: 0,
        ultima: r.createdAt,
      };
      a.ejecuciones++;
      if (!r.exito) a.errores++;
      if (r.duracionMs !== null) a.duraciones.push(r.duracionMs);
      a.tokens += (r.tokensEntrada ?? 0) + (r.tokensSalida ?? 0);
      porAgente.set(clave, a);
    }
    return {
      dias,
      agentes: [...porAgente.values()].map((a) => ({
        agentId: a.agentId,
        agentNombre: a.agentNombre,
        ejecuciones: a.ejecuciones,
        errores: a.errores,
        duracionPromedioMs: a.duraciones.length
          ? Math.round(
              a.duraciones.reduce((x, y) => x + y, 0) / a.duraciones.length,
            )
          : null,
        tokens: a.tokens,
        ultima: a.ultima,
      })),
    };
  }
}
