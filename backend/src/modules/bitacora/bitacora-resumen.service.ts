import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { VertexChatClient } from '../ai/vertex-chat.client';
import { AgentRunService } from '../agents/agent-run.service';
import {
  INSTRUCCIONES_BITACORA_RESUMEN_POR_DEFECTO,
  NOMBRE_AGENTE_BITACORA_RESUMEN,
  SCOPE_BITACORA_RESUMEN,
} from '../agents/agent-trabajadores.const';
import { BitacoraService } from './bitacora.service';
import { rangoDia } from './bitacora-fecha.util';
import { EventoHoja } from './bitacora-hoja.util';
import {
  CifrasDia,
  construirCifras,
  leerRespuestaModelo,
  mensajeParaModelo,
  PROMPT_SISTEMA_RESUMEN,
  textoBase,
} from './bitacora-resumen.util';

/** Cuántas veces se puede (re)generar el resumen de una persona en un mismo día. */
export const MAX_GENERACIONES_POR_DIA = 10;

export interface ResumenVista {
  fecha: string;
  userId: number;
  texto: string;
  puntos: string[];
  /** true = lo redactó la IA con las cifras; false = texto calculado con plantilla. */
  conIA: boolean;
  generadoPor: string | null;
  generadoEn: string;
  veces: number;
  /** Después de generarlo hubo actividad o anotaciones nuevas: conviene regenerarlo. */
  desactualizado: boolean;
  /** Se devolvió el ya guardado porque no había datos nuevos. */
  reutilizado?: boolean;
}

/**
 * «Resumen del día»: las cifras las calcula el código (exactas); la IA solo las redacta. Si la IA
 * no está disponible, falla o responde otra cosa, se guarda el resumen calculado con plantilla:
 * el botón siempre responde. Un resumen por persona y día, reutilizado mientras no haya datos nuevos.
 */
@Injectable()
export class BitacoraResumenService {
  private readonly logger = new Logger(BitacoraResumenService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly bitacora: BitacoraService,
    private readonly vertex: VertexChatClient,
    private readonly agentes: AgentRunService,
  ) {}

  /** El resumen guardado de ese día (o null), con la marca de si quedó viejo. */
  async obtener(userId: number, fecha: string): Promise<ResumenVista | null> {
    const fila = await this.prisma.bitacoraResumen.findUnique({
      where: { userId_fecha: { userId, fecha } },
    });
    if (!fila) return null;
    const marca = await this.marcaActual(userId, fecha);
    return this.vista(fila, fila.marcaDatos !== marca);
  }

  async generar(args: {
    userId: number;
    companyId: number;
    fecha: string;
    /** Quien pulsó el botón (la propia persona o alguien con permiso). */
    quien: { userId: number; nombre: string | null };
  }): Promise<ResumenVista> {
    const { userId, companyId, fecha, quien } = args;
    const { eventos, notas, tiempoExtra } = await this.cargar(userId, fecha);
    const marca = marcaDe(eventos, notas);
    const previo = await this.prisma.bitacoraResumen.findUnique({
      where: { userId_fecha: { userId, fecha } },
    });

    if (previo && previo.marcaDatos === marca) {
      return { ...(await this.vista(previo, false)), reutilizado: true };
    }
    if (eventos.length === 0 && notas.length === 0) {
      throw new BadRequestException(
        'No hay actividad registrada ni anotaciones ese día, así que no hay nada que resumir.',
      );
    }
    if (previo && previo.veces >= MAX_GENERACIONES_POR_DIA) {
      throw new BadRequestException(
        'Ya se generó este resumen muchas veces hoy. Inténtalo mañana o anota lo que falte en «Lo que anoté yo».',
      );
    }

    const cifras = construirCifras({
      fecha,
      eventos,
      notas: notas.map((n) => ({
        desde: n.desde,
        hasta: n.hasta,
        tipo: n.tipo,
        texto: n.texto,
      })),
      tiempoExtraMinutos: tiempoExtra,
    });
    const base = textoBase(cifras);
    const ia = await this.redactarConIA(cifras, base, { userId: quien.userId, nombre: quien.nombre, companyId, objetivo: userId });

    const datos = {
      companyId,
      texto: ia?.texto ?? base.texto,
      puntos: (ia?.puntos ?? base.puntos) as unknown as Prisma.InputJsonValue,
      cifras: cifras as unknown as Prisma.InputJsonValue,
      conIA: !!ia,
      modelo: ia?.modelo ?? null,
      tokens: ia?.tokens ?? null,
      marcaDatos: marca,
      generadoPorId: quien.userId,
      generadoEn: new Date(),
      veces: (previo?.veces ?? 0) + 1,
    };
    const fila = await this.prisma.bitacoraResumen.upsert({
      where: { userId_fecha: { userId, fecha } },
      create: { userId, fecha, ...datos },
      update: datos,
    });
    return this.vista(fila, false);
  }

  // ───────────────────────── IA ─────────────────────────

  private async redactarConIA(
    cifras: CifrasDia,
    base: { texto: string; puntos: string[] },
    ctx: { userId: number; nombre: string | null; companyId: number; objetivo: number },
  ): Promise<{
    texto: string;
    puntos: string[];
    modelo: string;
    tokens: number;
  } | null> {
    const agente = await this.agentes.obtenerTrabajador(SCOPE_BITACORA_RESUMEN);
    const registro = {
      agentId: agente?.id ?? null,
      agentNombre: agente?.name ?? NOMBRE_AGENTE_BITACORA_RESUMEN,
      agentScope: SCOPE_BITACORA_RESUMEN,
      companyId: ctx.companyId,
      userId: ctx.userId,
      userNombre: ctx.nombre,
      accion: 'RESUMEN_DIA',
      entidadTipo: 'BitacoraResumen',
      entidadId: ctx.objetivo,
    };
    if ((agente && !agente.isActive) || !this.vertex.estaConfigurado()) {
      return null;
    }

    const propias = (agente?.instructions ?? '').trim();
    const sistema =
      propias && propias !== INSTRUCCIONES_BITACORA_RESUMEN_POR_DEFECTO.trim()
        ? `${PROMPT_SISTEMA_RESUMEN}\n\nInstrucciones de la empresa sobre cómo redactar (no cambian las reglas anteriores):\n${propias.slice(0, 1500)}`
        : PROMPT_SISTEMA_RESUMEN;

    const t0 = Date.now();
    const modelo = this.vertex.modeloPara('ligero');
    try {
      const r = await this.vertex.sendChat(
        sistema,
        [],
        mensajeParaModelo(cifras, base),
        { nivel: 'ligero', maxOutputTokens: 700 },
      );
      const leido = leerRespuestaModelo(r.reply);
      if (!leido) {
        await this.agentes.registrar({
          ...registro,
          resumen: 'La IA no devolvió el formato esperado; se usó el resumen calculado.',
          modelo,
          duracionMs: Date.now() - t0,
          exito: false,
          error: 'Respuesta con formato inesperado',
        });
        return null;
      }
      await this.agentes.registrar({
        ...registro,
        resumen: `Resumen redactado (${leido.puntos.length} puntos).`,
        modelo,
        // El cliente de IA informa solo el total de tokens: va en «entrada» para que cuente en Sistemas → Agentes.
        tokensEntrada: r.tokensUsed,
        duracionMs: Date.now() - t0,
        exito: true,
        detalle: { tokensTotales: r.tokensUsed, eventos: cifras.totalEventos },
      });
      return { ...leido, modelo, tokens: r.tokensUsed };
    } catch (err) {
      this.logger.warn(`Resumen del día con IA: ${(err as Error).message}`);
      await this.agentes.registrar({
        ...registro,
        resumen: 'No se pudo redactar con IA; se usó el resumen calculado.',
        modelo,
        duracionMs: Date.now() - t0,
        exito: false,
        error: 'La IA no respondió',
      });
      return null;
    }
  }

  // ───────────────────────── Datos del día ─────────────────────────

  private async cargar(userId: number, fecha: string) {
    const { desde, hasta } = rangoDia(fecha);
    const [eventos, notas, extras] = await Promise.all([
      this.prisma.bitacoraEvento.findMany({
        where: { userId, ocurridoEn: { gte: desde, lt: hasta } },
        orderBy: { ocurridoEn: 'asc' },
        select: {
          fuente: true,
          modulo: true,
          accion: true,
          ruta: true,
          nombre: true,
          titulo: true,
          minutos: true,
          ocurridoEn: true,
        },
      }),
      this.prisma.bitacoraNota.findMany({
        where: { userId, fecha, eliminadaEn: null },
        orderBy: [{ desde: { sort: 'asc', nulls: 'last' } }, { creadaEn: 'asc' }],
      }),
      this.prisma.bitacoraExtra.findMany({
        where: {
          userId,
          inicio: { gte: desde, lt: hasta },
          estado: { in: ['APROBADA', 'PENDIENTE'] },
        },
        select: { minutosContados: true },
      }),
    ]);
    return {
      eventos: eventos as EventoHoja[],
      notas,
      tiempoExtra: extras.reduce((s, e) => s + (e.minutosContados ?? 0), 0),
    };
  }

  /** La misma marca que `marcaDe`, calculada con consultas baratas (para saber si el resumen quedó viejo). */
  private async marcaActual(userId: number, fecha: string): Promise<string> {
    const { desde, hasta } = rangoDia(fecha);
    const [ev, notas] = await Promise.all([
      this.prisma.bitacoraEvento.aggregate({
        where: { userId, ocurridoEn: { gte: desde, lt: hasta } },
        _count: { _all: true },
        _max: { ocurridoEn: true },
      }),
      this.prisma.bitacoraNota.findMany({
        where: { userId, fecha, eliminadaEn: null },
        select: { creadaEn: true, editadaEn: true },
      }),
    ]);
    return armarMarca(ev._count._all, ev._max.ocurridoEn, notas);
  }

  private async vista(
    f: {
      userId: number;
      fecha: string;
      texto: string;
      puntos: unknown;
      conIA: boolean;
      generadoPorId: number | null;
      generadoEn: Date;
      veces: number;
    },
    desactualizado: boolean,
  ): Promise<ResumenVista> {
    const quien = f.generadoPorId
      ? await this.prisma.user.findUnique({
          where: { id: f.generadoPorId },
          select: { fullName: true },
        })
      : null;
    return {
      fecha: f.fecha,
      userId: f.userId,
      texto: f.texto,
      puntos: Array.isArray(f.puntos)
        ? f.puntos.filter((p): p is string => typeof p === 'string')
        : [],
      conIA: f.conIA,
      generadoPor: quien?.fullName ?? null,
      generadoEn: f.generadoEn.toISOString(),
      veces: f.veces,
      desactualizado,
    };
  }
}

function armarMarca(
  cantidadEventos: number,
  ultimoEvento: Date | null,
  notas: { creadaEn: Date; editadaEn: Date | null }[],
): string {
  const ultimaNota = notas.reduce(
    (m, n) => Math.max(m, (n.editadaEn ?? n.creadaEn).getTime()),
    0,
  );
  return `${cantidadEventos}|${ultimoEvento ? ultimoEvento.getTime() : 0}|${notas.length}|${ultimaNota}`;
}

function marcaDe(
  eventos: EventoHoja[],
  notas: { creadaEn: Date; editadaEn: Date | null }[],
): string {
  const ultimo = eventos.reduce<Date | null>(
    (m, e) => (!m || e.ocurridoEn > m ? e.ocurridoEn : m),
    null,
  );
  return armarMarca(eventos.length, ultimo, notas);
}
