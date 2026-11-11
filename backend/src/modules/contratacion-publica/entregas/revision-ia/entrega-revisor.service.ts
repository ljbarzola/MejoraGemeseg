import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';
import { AgentRunService } from '../../../agents/agent-run.service';
import {
  INSTRUCCIONES_ENTREGAS_POR_DEFECTO,
  NOMBRE_AGENTE_ENTREGAS,
  SCOPE_ENTREGAS,
} from '../../../agents/agent-trabajadores.const';
import { Actor, EntregasService } from '../entregas.service';
import { CP_ENTREGA_REVISION_DDL } from './entrega-revision.schema';
import {
  EntregaLectorService,
  LecturaEntregaError,
  MAX_BYTES_ENTREGA,
  TIPOS_LEIBLES_ENTREGA,
} from './entrega-lector.service';
import { evaluarEntrega, type Motivo } from './entrega-revision.util';
import { cicloTextoCorto } from '../../shared/ciclo.util';

/** Una revisión que lleva más de esto «revisando» se da por perdida (la instancia se reinició) y se puede repetir. */
const REVISANDO_MAX_MS = 3 * 60 * 1000;

const sinInstruccionesPropias = (t: string) =>
  !t.trim() || t.trim() === INSTRUCCIONES_ENTREGAS_POR_DEFECTO.trim();

/** Día de Ecuador (UTC-5) como AAAA-MM-DD. */
const hoyEcuadorTexto = () => new Date(Date.now() - 5 * 3600_000).toISOString().slice(0, 10);

export interface RevisionIA {
  entregaId: number;
  /** REVISANDO | PARECE_CORRECTO | REVISAR | NO_LEIDO | ERROR */
  estado: string;
  tipoDocumento: string | null;
  resumen: string | null;
  motivos: string[];
  /** Motivo de rechazo propuesto; vacío si no hay nada que objetar. */
  mensajeRechazo: string;
  /** Por qué no se pudo revisar (NO_LEIDO / ERROR). */
  mensaje: string | null;
}

type Fila = {
  entregaId: number;
  estado: string;
  tipoDocumento: string | null;
  resumen: string | null;
  motivos: Prisma.JsonValue | null;
  mensajeRechazo: string | null;
  mensaje: string | null;
};

const aVista = (f: Fila): RevisionIA => ({
  entregaId: f.entregaId,
  estado: f.estado,
  tipoDocumento: f.tipoDocumento,
  resumen: f.resumen,
  motivos: Array.isArray(f.motivos) ? (f.motivos as unknown as Motivo[]).map((m) => m.texto) : [],
  mensajeRechazo: f.mensajeRechazo ?? '',
  mensaje: f.mensaje,
});

/**
 * Agente Revisor de Entregas: cuando alguien entrega un documento, lo lee y deja una nota para
 * quien aprueba («Parece correcto» o «Revisar: motivo»). Solo sugiere: aprobar y rechazar
 * siguen siendo de una persona. El modelo describe el documento y el código compara con reglas
 * fijas (entrega-revision.util.ts).
 *
 * Lo dispara el navegador de quien entrega justo después de entregar (una petición propia),
 * no un trabajo en segundo plano: en Cloud Run el servidor se puede apagar al responder.
 */
@Injectable()
export class EntregaRevisorService implements OnModuleInit {
  private readonly logger = new Logger(EntregaRevisorService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly entregas: EntregasService,
    private readonly lector: EntregaLectorService,
    private readonly agentRuns: AgentRunService,
  ) {}

  async onModuleInit() {
    try {
      for (const sql of CP_ENTREGA_REVISION_DDL) await this.prisma.$executeRawUnsafe(sql);
    } catch (err) {
      this.logger.warn(`No se pudo asegurar la tabla CPEntregaRevisionIA: ${(err as Error).message}`);
    }
  }

  /** Lo que dijo el agente de este documento (null si no hay, o si es de una entrega anterior). Solo el personal de CP. */
  async obtener(id: number, actor: Actor): Promise<RevisionIA | null> {
    this.exigirPersonalDeCP(actor);
    const e = await this.cargar(id, actor.companyId);
    const fila = await this.prisma.cPEntregaRevisionIA.findUnique({ where: { entregaId: id } });
    if (!fila || !this.vigente(fila.entregadoAt, e.entregadoAt)) return null;
    return aVista(fila);
  }

  /** Estados de varios documentos de una vez (para la lista de «Por aprobar»). */
  async listar(ids: number[], actor: Actor): Promise<{ entregaId: number; estado: string }[]> {
    this.exigirPersonalDeCP(actor);
    const limpios = [...new Set(ids.filter((n) => Number.isInteger(n) && n > 0))].slice(0, 500);
    if (!limpios.length) return [];
    const [filas, entregas] = await Promise.all([
      this.prisma.cPEntregaRevisionIA.findMany({
        where: { entregaId: { in: limpios }, companyId: actor.companyId },
        select: { entregaId: true, estado: true, entregadoAt: true },
      }),
      this.prisma.cPEntregaDocumento.findMany({
        where: { id: { in: limpios }, solicitud: { companyId: actor.companyId } },
        select: { id: true, entregadoAt: true },
      }),
    ]);
    const entregadoAt = new Map(entregas.map((e) => [e.id, e.entregadoAt]));
    return filas
      .filter((f) => this.vigente(f.entregadoAt, entregadoAt.get(f.entregaId) ?? null))
      .map((f) => ({ entregaId: f.entregaId, estado: f.estado }));
  }

  /**
   * Revisa el documento entregado. Si ya hay una revisión de esta misma entrega no vuelve a llamar
   * a la IA (salvo un error, o si el personal de CP pide `volver`). Quien entrega puede dispararla
   * pero no ve el resultado: solo recibe el estado.
   */
  async revisar(id: number, actor: Actor, volver = false): Promise<{ estado: string; revision: RevisionIA | null }> {
    const e = await this.cargar(id, actor.companyId);
    const esResponsable = e.responsables.some((r) => r.userId === actor.userId);
    if (!esResponsable && !actor.puedeEscribir) throw new ForbiddenException('Este documento no te fue asignado.');
    if (e.estado !== 'ENTREGADO') {
      throw new BadRequestException('Solo se revisan los documentos entregados que esperan aprobación.');
    }

    const previa = await this.prisma.cPEntregaRevisionIA.findUnique({ where: { entregaId: id } });
    if (previa && this.vigente(previa.entregadoAt, e.entregadoAt)) {
      const enCurso = previa.estado === 'REVISANDO' && Date.now() - previa.updatedAt.getTime() < REVISANDO_MAX_MS;
      const terminada = ['PARECE_CORRECTO', 'REVISAR', 'NO_LEIDO'].includes(previa.estado);
      if (enCurso || (terminada && !(volver && actor.puedeEscribir))) {
        return this.responder(previa, actor);
      }
    }

    await this.guardar(id, actor.companyId, e.entregadoAt, { estado: 'REVISANDO' });
    const agente = await this.agentRuns.obtenerTrabajador(SCOPE_ENTREGAS);
    const base = {
      agentId: agente?.id ?? null,
      agentNombre: agente?.name ?? NOMBRE_AGENTE_ENTREGAS,
      agentScope: SCOPE_ENTREGAS,
      companyId: actor.companyId,
      userId: actor.userId,
      userNombre: null as string | null,
      accion: 'REVISAR_ENTREGA',
      entidadTipo: 'CPEntregaDocumento',
      entidadId: id,
    };

    const noLeido = async (mensaje: string) =>
      this.responder(
        await this.guardar(id, actor.companyId, e.entregadoAt, { estado: 'NO_LEIDO', mensaje }),
        actor,
      );

    if (agente && !agente.isActive) {
      return noLeido('El agente revisor está desactivado en Sistemas → Agentes. Revisa el documento a mano.');
    }
    if (!this.lector.estaConfigurado()) {
      return noLeido('La lectura con IA no está configurada en este entorno. Revisa el documento a mano.');
    }
    if (e.origen !== 'ARCHIVO') {
      return noLeido('Se entregó como enlace externo: el agente solo lee archivos subidos. Ábrelo y revísalo a mano.');
    }

    let archivo: { buffer: Buffer; mimeType: string };
    try {
      // Word y Excel llegan convertidos a PDF (misma conversión de la vista previa).
      archivo = await this.entregas.obtenerArchivo(id, actor, true, true);
    } catch (err) {
      const mensaje = this.mensajeDeFallo(err);
      await this.agentRuns.registrar({ ...base, resumen: 'No se pudo abrir el archivo.', exito: false, error: mensaje });
      return this.responder(
        await this.guardar(id, actor.companyId, e.entregadoAt, { estado: 'ERROR', mensaje }),
        actor,
      );
    }
    const mime = archivo.mimeType.split(';')[0].trim().toLowerCase();
    if (!(TIPOS_LEIBLES_ENTREGA as readonly string[]).includes(mime)) {
      return noLeido('El agente solo lee PDF, imágenes, Word y Excel. Descarga el archivo y revísalo a mano.');
    }
    if (archivo.buffer.length > MAX_BYTES_ENTREGA) {
      return noLeido('El archivo es demasiado grande para que el agente lo lea. Revísalo a mano.');
    }

    const hoy = hoyEcuadorTexto();
    try {
      const r = await this.lector.leer(
        archivo.buffer,
        mime,
        hoy,
        sinInstruccionesPropias(agente?.instructions ?? '') ? '' : agente!.instructions,
      );
      const ciclo = await this.entregas.cicloDeSolicitud(actor.companyId, e.solicitud.entidadId, e.solicitud.anio, e.solicitud.mes);
      const ev = evaluarEntrega(r.lectura, hoy, {
        anio: e.solicitud.anio,
        mes: e.solicitud.mes,
        desde: ciclo.desde,
        hasta: ciclo.hasta,
        etiqueta: ciclo.esCiclo ? cicloTextoCorto(ciclo) : null,
      });
      const guardada = await this.guardar(id, actor.companyId, e.entregadoAt, {
        estado: ev.estado,
        tipoDocumento: r.lectura.tipoDocumento,
        resumen: ev.resumen,
        motivos: ev.motivos as unknown as Prisma.InputJsonValue,
        mensajeRechazo: ev.mensajeRechazo || null,
        modelo: r.modelo,
      });
      await this.agentRuns.registrar({
        ...base,
        resumen: ev.estado === 'PARECE_CORRECTO' ? 'Parece correcto.' : `Pide revisar: ${ev.motivos.length} motivo(s).`,
        modelo: r.modelo,
        tokensEntrada: r.tokensEntrada,
        tokensSalida: r.tokensSalida,
        duracionMs: r.duracionMs,
        exito: true,
        detalle: {
          estado: ev.estado,
          legible: r.lectura.legible,
          seFirma: r.lectura.seFirma,
          firmaOSello: r.lectura.firmaOSello,
          conVencimiento: !!r.lectura.fechaVencimiento,
          conPeriodo: !!r.lectura.periodoDesde,
        },
      });
      return this.responder(guardada, actor);
    } catch (err: unknown) {
      const mensaje =
        err instanceof LecturaEntregaError ? err.message : 'No se pudo revisar el documento. Revísalo a mano.';
      if (!(err instanceof LecturaEntregaError)) {
        this.logger.error(`Revisión de la entrega ${id}: ${(err as Error).message}`);
      }
      await this.agentRuns.registrar({
        ...base,
        resumen: 'No se pudo revisar el documento.',
        modelo: err instanceof LecturaEntregaError ? err.modelo : null,
        duracionMs: err instanceof LecturaEntregaError ? err.duracionMs : null,
        exito: false,
        error: mensaje,
      });
      return this.responder(
        await this.guardar(id, actor.companyId, e.entregadoAt, { estado: 'ERROR', mensaje }),
        actor,
      );
    }
  }

  // ------------------------------------------------------------------ interno

  private exigirPersonalDeCP(actor: Actor) {
    if (!actor.puedeEscribir) throw new ForbiddenException('Solo el personal de Contratación Pública ve esta revisión.');
  }

  /** La revisión corresponde a la entrega actual (mismo momento de entrega). */
  private vigente(revisada: Date | null, actual: Date | null): boolean {
    return !!revisada && !!actual && revisada.getTime() === actual.getTime();
  }

  private responder(fila: Fila, actor: Actor) {
    return { estado: fila.estado, revision: actor.puedeEscribir ? aVista(fila) : null };
  }

  private async cargar(id: number, companyId: number) {
    const e = await this.prisma.cPEntregaDocumento.findFirst({
      where: { id, solicitud: { companyId } },
      select: {
        id: true,
        estado: true,
        origen: true,
        entregadoAt: true,
        responsables: { select: { userId: true } },
        solicitud: { select: { anio: true, mes: true, entidadId: true } },
      },
    });
    if (!e) throw new NotFoundException('Documento no encontrado');
    return e;
  }

  private guardar(
    entregaId: number,
    companyId: number,
    entregadoAt: Date | null,
    datos: {
      estado: string;
      tipoDocumento?: string | null;
      resumen?: string | null;
      motivos?: Prisma.InputJsonValue;
      mensajeRechazo?: string | null;
      mensaje?: string | null;
      modelo?: string | null;
    },
  ) {
    // Cada guardado reemplaza la fila entera: nada de una revisión anterior se arrastra.
    const valores = {
      estado: datos.estado,
      entregadoAt,
      tipoDocumento: datos.tipoDocumento ?? null,
      resumen: datos.resumen ?? null,
      motivos: datos.motivos ?? undefined,
      mensajeRechazo: datos.mensajeRechazo ?? null,
      mensaje: datos.mensaje ?? null,
      modelo: datos.modelo ?? null,
    };
    return this.prisma.cPEntregaRevisionIA.upsert({
      where: { entregaId },
      create: { entregaId, companyId, ...valores },
      update: { ...valores, motivos: datos.motivos ?? ([] as Prisma.InputJsonValue) },
    });
  }

  private mensajeDeFallo(err: unknown): string {
    const m = (err as { message?: string })?.message;
    return typeof m === 'string' && m.length < 200 ? m : 'No se pudo abrir el archivo para revisarlo.';
  }
}
