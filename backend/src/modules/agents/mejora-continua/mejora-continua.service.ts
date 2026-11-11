import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { NotificationsService } from '../../notifications/notifications.service';
import { GmailMailService } from '../../mail/gmail-mail.service';
import { PermissionsService } from '../../permissions/permissions.service';
import { AgentRunService } from '../agent-run.service';
import { MEJORA_CONTINUA_DDL } from './mejora-continua.schema';
import {
  ACCIONES_DECISION,
  AccionDecision,
  ESTADOS_DECIDIBLES,
  ESTADOS_PROPUESTA,
  ESTADOS_QUE_OCUPAN_CUPO,
  EstadoPropuesta,
  LIMITE_APROBADAS_A_LA_VEZ,
  armarBrief,
  esSemanaValida,
  listaDeTextos,
  normalizarPropuesta,
  semanaEcuador,
} from './mejora-continua.util';

export const NOMBRE_AGENTE_MEJORA = 'Agente de Mejora Continua';
export const SCOPE_MEJORA = 'MEJORA_CONTINUA';
const RUTA_PANTALLA = '/sistemas/mejora-continua';
const PREFIJO_ASUNTO = '[Mejora continua]';

export interface FilaPropuesta {
  id: number;
  semana: string;
  tipo: string;
  titulo: string;
  queSeAutomatiza: string | null;
  decisionHumana: string | null;
  plan: string[];
  impacto: string | null;
  esfuerzo: string | null;
  riesgo: string | null;
  lineaBlanca: boolean;
  evidencia: string | null;
  dependeDe: string | null;
  porQueAhora: string | null;
  comoProbarBarato: string | null;
  horasAhorradasMes: number | null;
  estado: EstadoPropuesta;
  motivo: string | null;
  comentarioCambios: string | null;
  revision: number;
  historial: unknown[];
  companyId: number | null;
  decididoPorId: number | null;
  decididoPorNombre: string | null;
  decididoEn: Date | null;
  hechaEn: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface FilaInforme {
  id: number;
  semana: string;
  tipo: string;
  companyId: number | null;
  contenido: Record<string, unknown>;
  createdAt: Date;
}

/** Quién toma la decisión: una persona de la app, o la persona a través de una sesión de Claude. */
export interface Decisor {
  id: number | null;
  nombre: string;
}

export interface UsuarioSolicitante {
  userId: number;
  companyId: number | null;
}

/**
 * Libro de propuestas del Agente de Mejora Continua. El «cerebro» (las rutinas del
 * lunes y del viernes) vive FUERA de la app, en Claude: aquí solo se guarda lo que
 * proponen, lo que Leidy decide y lo que se hizo, y se avisa. «El agente lee, el
 * sistema juzga, la persona decide» (PLAN_AGENTES_IA.md, decisiones).
 */
@Injectable()
export class MejoraContinuaService implements OnModuleInit {
  private readonly logger = new Logger(MejoraContinuaService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly runs: AgentRunService,
    private readonly notificaciones: NotificationsService,
    private readonly mail: GmailMailService,
    private readonly permisos: PermissionsService,
  ) {}

  async onModuleInit() {
    try {
      for (const sql of MEJORA_CONTINUA_DDL) await this.prisma.$executeRawUnsafe(sql);
    } catch (err) {
      this.logger.warn(
        `No se pudieron asegurar las tablas de Mejora continua: ${(err as Error).message}`,
      );
    }
  }

  private empresaResuelta: { id: number | null; en: number } | null = null;

  /**
   * Empresa a la que pertenecen las propuestas que llegan de las rutinas. Manda la variable
   * MEJORA_CONTINUA_COMPANY_ID; si no existe, se usa la única empresa que tiene equipo de Sistemas
   * (personas con «Escribir» marcado de forma explícita). Con varias empresas no se adivina: queda
   * sin empresa (solo la ve el super administrador) y se avisa en el log.
   */
  private async empresaDeLasRutinas(): Promise<number | null> {
    const n = parseInt(process.env.MEJORA_CONTINUA_COMPANY_ID ?? '', 10);
    if (Number.isFinite(n) && n > 0) return n;
    const guardada = this.empresaResuelta;
    if (guardada && Date.now() - guardada.en < 10 * 60 * 1000) return guardada.id;
    let id: number | null = null;
    try {
      const equipo = await this.permisos.getUsersWithExplicitSectionWrite('SISTEMAS');
      const empresas = [...new Set(equipo.map((u) => u.companyId))];
      if (empresas.length === 1) id = empresas[0];
      else if (empresas.length > 1) {
        this.logger.warn('Varias empresas tienen equipo de Sistemas: define MEJORA_CONTINUA_COMPANY_ID.');
      }
    } catch (err) {
      this.logger.warn(`No se pudo deducir la empresa de Mejora continua: ${(err as Error).message}`);
    }
    this.empresaResuelta = { id, en: Date.now() };
    return id;
  }

  /** Una persona de empresa solo ve lo de su empresa; el super administrador (sin empresa) ve todo. */
  private async cargarPropuesta(id: number, quien?: UsuarioSolicitante): Promise<FilaPropuesta> {
    const filas = await this.prisma.$queryRawUnsafe<FilaPropuesta[]>(
      `SELECT * FROM "AgentPropuesta" WHERE "id" = $1`,
      id,
    );
    const p = filas[0];
    if (!p) throw new NotFoundException('Propuesta no encontrada');
    if (quien && quien.companyId !== null && p.companyId !== quien.companyId) {
      throw new NotFoundException('Propuesta no encontrada');
    }
    return p;
  }

  /** Quién decide cuando es una persona de la app. */
  async decisorDe(userId: number): Promise<Decisor> {
    const u = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { fullName: true },
    });
    return { id: userId, nombre: u?.fullName ?? 'Usuario' };
  }

  // ─────────────────────────── Pantalla de Sistemas ───────────────────────────

  async panel(quien: UsuarioSolicitante) {
    const filtro = quien.companyId !== null ? `WHERE "companyId" = ${Number(quien.companyId)}` : '';
    const propuestas = await this.prisma.$queryRawUnsafe<FilaPropuesta[]>(
      `SELECT * FROM "AgentPropuesta" ${filtro} ORDER BY "createdAt" DESC, "id" DESC LIMIT 300`,
    );
    const informes = await this.prisma.$queryRawUnsafe<FilaInforme[]>(
      `SELECT * FROM "AgentMejoraInforme" ${filtro} ORDER BY "createdAt" DESC LIMIT 12`,
    );
    const porEstado: Record<string, number> = {};
    for (const e of ESTADOS_PROPUESTA) porEstado[e] = 0;
    let horasMes = 0;
    for (const p of propuestas) {
      porEstado[p.estado] = (porEstado[p.estado] ?? 0) + 1;
      if (p.estado === 'HECHA' && p.horasAhorradasMes) horasMes += p.horasAhorradasMes;
    }
    const ocupan = propuestas.filter((p) => ESTADOS_QUE_OCUPAN_CUPO.includes(p.estado)).length;
    return {
      semanaActual: semanaEcuador(),
      propuestas,
      informes,
      resumen: {
        porEstado,
        horasAhorradasMes: Math.round(horasMes * 10) / 10,
        cupo: {
          limite: LIMITE_APROBADAS_A_LA_VEZ,
          ocupados: ocupan,
        },
      },
    };
  }

  /** Cifras para la tarjeta del Dashboard de Sistemas. */
  async tarjetaDashboard(quien: UsuarioSolicitante) {
    const p = await this.panel(quien);
    return {
      pendientes: p.resumen.porEstado.PENDIENTE + p.resumen.porEstado.CAMBIOS_PEDIDOS,
      enCurso: p.resumen.porEstado.PLAN_APROBADO + p.resumen.porEstado.EN_CURSO,
      hechas: p.resumen.porEstado.HECHA,
      horasAhorradasMes: p.resumen.horasAhorradasMes,
      semanaActual: p.semanaActual,
    };
  }

  async decidir(
    id: number,
    accion: string,
    datos: { motivo?: unknown; comentario?: unknown },
    decisor: Decisor,
    quien?: UsuarioSolicitante,
  ) {
    if (!(ACCIONES_DECISION as string[]).includes(accion)) {
      throw new BadRequestException('Acción no válida');
    }
    const p = await this.cargarPropuesta(id, quien);
    if (!ESTADOS_DECIDIBLES.includes(p.estado)) {
      throw new BadRequestException('Esta propuesta ya no admite esa decisión');
    }
    const motivo = typeof datos.motivo === 'string' ? datos.motivo.trim().slice(0, 1500) : '';
    const comentario =
      typeof datos.comentario === 'string' ? datos.comentario.trim().slice(0, 2000) : '';

    let estado: EstadoPropuesta;
    switch (accion as AccionDecision) {
      case 'APROBAR': {
        if (p.estado === 'PLAN_APROBADO') throw new BadRequestException('El plan ya está aprobado');
        const ocupan = await this.contarCupoOcupado(p.companyId);
        if (ocupan >= LIMITE_APROBADAS_A_LA_VEZ) {
          throw new BadRequestException(
            `Ya hay ${ocupan} propuestas aprobadas o en curso (el máximo a la vez es ${LIMITE_APROBADAS_A_LA_VEZ}). Termina o rechaza una antes de aprobar otra.`,
          );
        }
        estado = 'PLAN_APROBADO';
        break;
      }
      case 'PEDIR_CAMBIOS':
        if (!comentario) throw new BadRequestException('Escribe qué quieres que cambie en el plan');
        estado = 'CAMBIOS_PEDIDOS';
        break;
      case 'RECHAZAR':
        if (!motivo) throw new BadRequestException('Escribe el motivo del rechazo: así el agente aprende');
        estado = 'RECHAZADA';
        break;
      default:
        estado = 'MAS_TARDE';
    }

    const historial = this.agregarAlHistorial(p.historial, {
      en: new Date().toISOString(),
      por: decisor.nombre,
      accion,
      ...(motivo ? { motivo } : {}),
      ...(comentario ? { comentario } : {}),
    });
    await this.prisma.$executeRawUnsafe(
      `UPDATE "AgentPropuesta"
         SET "estado" = $2, "motivo" = $3, "comentarioCambios" = $4, "historial" = $5::jsonb,
             "decididoPorId" = $6, "decididoPorNombre" = $7, "decididoEn" = NOW(), "updatedAt" = NOW()
       WHERE "id" = $1`,
      id,
      estado,
      accion === 'RECHAZAR' ? motivo : p.motivo,
      accion === 'PEDIR_CAMBIOS' ? comentario : p.comentarioCambios,
      JSON.stringify(historial),
      decisor.id,
      decisor.nombre,
    );
    return this.cargarPropuesta(id, quien);
  }

  /** De PLAN_APROBADO a EN_CURSO, y de ahí a HECHA (con las horas ahorradas reales, si se conocen). */
  async cambiarProgreso(
    id: number,
    estado: string,
    datos: { horasAhorradasMes?: unknown },
    decisor: Decisor,
    quien?: UsuarioSolicitante,
  ) {
    if (estado !== 'EN_CURSO' && estado !== 'HECHA') {
      throw new BadRequestException('Solo se puede pasar a «En curso» o «Hecha»');
    }
    const p = await this.cargarPropuesta(id, quien);
    const permitido =
      (estado === 'EN_CURSO' && p.estado === 'PLAN_APROBADO') ||
      (estado === 'HECHA' && (p.estado === 'EN_CURSO' || p.estado === 'PLAN_APROBADO'));
    if (!permitido) throw new BadRequestException('Ese cambio de estado no corresponde ahora');
    let horas: number | null = p.horasAhorradasMes;
    if (estado === 'HECHA' && typeof datos.horasAhorradasMes === 'number' && Number.isFinite(datos.horasAhorradasMes)) {
      horas = Math.min(Math.max(datos.horasAhorradasMes, 0), 1000);
    }
    const historial = this.agregarAlHistorial(p.historial, {
      en: new Date().toISOString(),
      por: decisor.nombre,
      accion: estado,
    });
    await this.prisma.$executeRawUnsafe(
      `UPDATE "AgentPropuesta"
         SET "estado" = $2, "horasAhorradasMes" = $3, "historial" = $4::jsonb,
             "hechaEn" = CASE WHEN $2 = 'HECHA' THEN NOW() ELSE "hechaEn" END, "updatedAt" = NOW()
       WHERE "id" = $1`,
      id,
      estado,
      horas,
      JSON.stringify(historial),
    );
    return this.cargarPropuesta(id, quien);
  }

  /** Brief para abrir una sesión de Claude con el plan aprobado. Solo si el plan está aprobado o en curso. */
  async brief(id: number, quien?: UsuarioSolicitante) {
    const p = await this.cargarPropuesta(id, quien);
    if (p.estado !== 'PLAN_APROBADO' && p.estado !== 'EN_CURSO') {
      throw new ForbiddenException('El brief solo se arma cuando el plan está aprobado');
    }
    return { id: p.id, titulo: p.titulo, brief: armarBrief(p) };
  }

  private async contarCupoOcupado(companyId: number | null): Promise<number> {
    const filas = await this.prisma.$queryRawUnsafe<{ n: number }[]>(
      `SELECT COUNT(*)::int AS n FROM "AgentPropuesta"
        WHERE "estado" IN ('PLAN_APROBADO','EN_CURSO')
          AND "companyId" IS NOT DISTINCT FROM $1::int`,
      companyId,
    );
    return filas[0]?.n ?? 0;
  }

  private agregarAlHistorial(actual: unknown[], evento: Record<string, unknown>): unknown[] {
    const base = Array.isArray(actual) ? actual : [];
    return [...base, evento].slice(-30);
  }

  // ─────────────────────────── Puerta de las rutinas ───────────────────────────

  /**
   * Lo que el agente necesita leer antes de proponer: su memoria de decisiones, el cupo
   * libre y datos AGREGADOS de uso real (nunca nombres ni contenido de personas).
   */
  async memoria() {
    const companyId = await this.empresaDeLasRutinas();
    const filtro = companyId !== null ? `WHERE "companyId" = ${companyId}` : '';
    const propuestas = await this.prisma.$queryRawUnsafe<FilaPropuesta[]>(
      `SELECT "id","semana","tipo","titulo","estado","motivo","comentarioCambios","plan","revision",
              "horasAhorradasMes","decididoEn","hechaEn","createdAt"
         FROM "AgentPropuesta" ${filtro} ORDER BY "createdAt" DESC LIMIT 120`,
    );
    const informes = await this.prisma.$queryRawUnsafe<FilaInforme[]>(
      `SELECT * FROM "AgentMejoraInforme" ${filtro} ORDER BY "createdAt" DESC LIMIT 6`,
    );
    const ocupan = propuestas.filter((p) => ESTADOS_QUE_OCUPAN_CUPO.includes(p.estado)).length;
    return {
      semanaActual: semanaEcuador(),
      cupo: {
        limite: LIMITE_APROBADAS_A_LA_VEZ,
        ocupados: ocupan,
        libres: Math.max(LIMITE_APROBADAS_A_LA_VEZ - ocupan, 0),
      },
      propuestas,
      informes,
      uso: await this.usoReal(companyId),
    };
  }

  /** Cifras de uso de los últimos 30 días. Cada bloque es opcional: si falla, se omite. */
  private async usoReal(companyId: number | null) {
    const desde = new Date(Date.now() - 30 * 86400000);
    const uso: Record<string, unknown> = { dias: 30 };
    try {
      uso.agentes = await this.runs.resumen(companyId, 30);
    } catch (err) {
      this.logger.warn(`Uso real (agentes): ${(err as Error).message}`);
    }
    try {
      const tickets = await this.prisma.ticketSoporte.groupBy({
        by: ['tipo', 'estado'],
        where: { ...(companyId !== null ? { companyId } : {}), createdAt: { gte: desde } },
        _count: { _all: true },
      });
      const mejorasAbiertas = await this.prisma.ticketSoporte.findMany({
        where: {
          ...(companyId !== null ? { companyId } : {}),
          tipo: 'MEJORA',
          estado: { not: 'RESUELTO' },
        },
        select: { titulo: true },
        orderBy: { createdAt: 'desc' },
        take: 10,
      });
      uso.soporte = {
        ultimos30Dias: tickets.map((t) => ({ tipo: t.tipo, estado: t.estado, total: t._count._all })),
        mejorasSolicitadasSinResolver: mejorasAbiertas.map((t) => t.titulo),
      };
    } catch (err) {
      this.logger.warn(`Uso real (soporte): ${(err as Error).message}`);
    }
    try {
      const eventos = await this.prisma.bitacoraEvento.groupBy({
        by: ['modulo'],
        where: {
          fuente: 'APP',
          ocurridoEn: { gte: desde },
          ...(companyId !== null ? { companyId } : {}),
        },
        _count: { _all: true },
      });
      uso.actividadPorModulo = eventos
        .map((e) => ({ modulo: e.modulo, acciones: e._count._all }))
        .sort((a, b) => b.acciones - a.acciones);
    } catch (err) {
      this.logger.warn(`Uso real (bitácora): ${(err as Error).message}`);
    }
    return uso;
  }

  /** Lunes: guarda las propuestas del agente, el informe de la semana y avisa. */
  async recibirPropuestas(body: Record<string, unknown>, opciones: { dryRun: boolean }) {
    const semana = esSemanaValida(body.semana) ? body.semana : semanaEcuador();
    const lista = Array.isArray(body.propuestas) ? body.propuestas : [];
    if (lista.length === 0) throw new BadRequestException('No llegó ninguna propuesta');
    if (lista.length > 8) throw new BadRequestException('Demasiadas propuestas (máximo 8 por semana)');

    const validas: ReturnType<typeof normalizarPropuesta>[] = lista.map(normalizarPropuesta);
    const errores = validas.flatMap((v) => (v.ok ? [] : [v.error]));
    // El filtro global de errores solo deja pasar `message`: el detalle va dentro del texto.
    if (errores.length) {
      throw new BadRequestException(`Propuestas no válidas: ${errores.join(' | ')}`);
    }
    const propuestas = validas.flatMap((v) => (v.ok ? [v.value] : []));

    const informe = {
      alertasRiesgo: listaDeTextos(body.alertasRiesgo),
      aprendizaje: typeof body.aprendizaje === 'string' ? body.aprendizaje.trim().slice(0, 3000) : null,
      mdDesactualizados: listaDeTextos(body.mdDesactualizados),
      modelosUsados: this.objetoPlano(body.modelosUsados),
    };

    if (opciones.dryRun) {
      return { dryRun: true, semana, propuestas: propuestas.length, informe };
    }

    const companyId = await this.empresaDeLasRutinas();
    const creadas: number[] = [];
    const omitidas: string[] = [];
    for (const p of propuestas) {
      const repetida = await this.prisma.$queryRawUnsafe<{ id: number }[]>(
        `SELECT "id" FROM "AgentPropuesta"
          WHERE "semana" = $1 AND LOWER("titulo") = LOWER($2) AND "companyId" IS NOT DISTINCT FROM $3::int`,
        semana,
        p.titulo,
        companyId,
      );
      if (repetida.length) {
        omitidas.push(p.titulo);
        continue;
      }
      const fila = await this.prisma.$queryRawUnsafe<{ id: number }[]>(
        `INSERT INTO "AgentPropuesta"
           ("semana","tipo","titulo","queSeAutomatiza","decisionHumana","plan","impacto","esfuerzo","riesgo",
            "lineaBlanca","evidencia","dependeDe","porQueAhora","comoProbarBarato","horasAhorradasMes","companyId")
         VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16::int)
         RETURNING "id"`,
        semana,
        p.tipo,
        p.titulo,
        p.queSeAutomatiza,
        p.decisionHumana,
        JSON.stringify(p.plan),
        p.impacto,
        p.esfuerzo,
        p.riesgo,
        p.lineaBlanca,
        p.evidencia,
        p.dependeDe,
        p.porQueAhora,
        p.comoProbarBarato,
        p.horasAhorradasMes,
        companyId,
      );
      creadas.push(fila[0].id);
    }
    await this.guardarInforme(semana, 'LUNES', companyId, informe);

    const titulos = propuestas.filter((p) => !omitidas.includes(p.titulo)).map((p) => p.titulo);
    if (creadas.length > 0) {
      await this.avisar(
        companyId,
        `Mejora continua: ${creadas.length} propuesta${creadas.length === 1 ? '' : 's'} para la semana ${semana}`,
        `El agente dejó propuestas para revisar: ${titulos.join(' · ')}`,
        `Propuestas de la semana ${semana} para revisar:\n\n${titulos.map((t) => `• ${t}`).join('\n')}`,
        `${PREFIJO_ASUNTO} Propuestas de la semana ${semana}`,
      );
    }
    await this.runs.registrar({
      agentId: null,
      agentNombre: NOMBRE_AGENTE_MEJORA,
      agentScope: SCOPE_MEJORA,
      companyId,
      userId: null,
      userNombre: null,
      accion: 'PROPONER_MEJORAS',
      resumen: `${creadas.length} propuestas guardadas (${omitidas.length} repetidas omitidas)`,
      modelo: this.modeloPrincipal(informe.modelosUsados),
      exito: true,
      detalle: { semana, ids: creadas, modelosUsados: informe.modelosUsados },
    });
    return { semana, creadas, omitidas };
  }

  /** Viernes: guarda el resumen de la semana y avisa. */
  async recibirCierre(body: Record<string, unknown>, opciones: { dryRun: boolean }) {
    const semana = esSemanaValida(body.semana) ? body.semana : semanaEcuador();
    const companyId = await this.empresaDeLasRutinas();
    const horas =
      typeof body.horasAhorradasEstimadas === 'number' && Number.isFinite(body.horasAhorradasEstimadas)
        ? Math.min(Math.max(body.horasAhorradasEstimadas, 0), 10000)
        : null;
    const contenido = {
      mejorado: listaDeTextos(body.mejorado),
      falto: listaDeTextos(body.falto),
      rechazado: listaDeTextos(body.rechazado),
      aprendizaje: typeof body.aprendizaje === 'string' ? body.aprendizaje.trim().slice(0, 3000) : null,
      focoSugerido: typeof body.focoSugerido === 'string' ? body.focoSugerido.trim().slice(0, 1500) : null,
      horasAhorradasEstimadas: horas,
      mdDesactualizados: listaDeTextos(body.mdDesactualizados),
      modelosUsados: this.objetoPlano(body.modelosUsados),
    };
    if (opciones.dryRun) return { dryRun: true, semana, contenido };

    await this.guardarInforme(semana, 'VIERNES', companyId, contenido);
    const lineas = (t: string, l: string[]) => (l.length ? `${t}:\n${l.map((x) => `• ${x}`).join('\n')}\n` : '');
    await this.avisar(
      companyId,
      `Mejora continua: resumen de la semana ${semana}`,
      `Mejorado: ${contenido.mejorado.length} · Faltó: ${contenido.falto.length} · Rechazado: ${contenido.rechazado.length}`,
      [
        `Resumen de la semana ${semana}\n`,
        lineas('Mejorado', contenido.mejorado),
        lineas('Faltó', contenido.falto),
        lineas('Rechazado', contenido.rechazado),
        contenido.aprendizaje ? `Lo que aprendí: ${contenido.aprendizaje}\n` : '',
        horas !== null ? `Horas humanas ahorradas (estimadas): ${horas}\n` : '',
        contenido.focoSugerido ? `Foco sugerido para el lunes: ${contenido.focoSugerido}` : '',
      ].join('\n'),
      `${PREFIJO_ASUNTO} Resumen de la semana ${semana}`,
    );
    await this.runs.registrar({
      agentId: null,
      agentNombre: NOMBRE_AGENTE_MEJORA,
      agentScope: SCOPE_MEJORA,
      companyId,
      userId: null,
      userNombre: null,
      accion: 'CIERRE_SEMANAL',
      resumen: `Resumen de ${semana}: ${contenido.mejorado.length} mejoradas, ${contenido.falto.length} pendientes`,
      modelo: this.modeloPrincipal(contenido.modelosUsados),
      exito: true,
      detalle: { semana, modelosUsados: contenido.modelosUsados },
    });
    return { semana, guardado: true };
  }

  /** El agente reescribe el plan que Leidy pidió cambiar: vuelve a PENDIENTE para que lo revise otra vez. */
  async revisarPlan(id: number, body: Record<string, unknown>) {
    const p = await this.cargarPropuesta(id);
    if (p.estado !== 'CAMBIOS_PEDIDOS') {
      throw new BadRequestException('Solo se reescribe el plan de una propuesta con cambios pedidos');
    }
    const plan = Array.isArray(body.plan)
      ? body.plan
          .map((x) => (typeof x === 'string' ? x.trim().slice(0, 400) : ''))
          .filter(Boolean)
          .slice(0, 10)
      : [];
    if (plan.length === 0) throw new BadRequestException('Falta el plan nuevo');
    const queSeAutomatiza =
      typeof body.queSeAutomatiza === 'string' && body.queSeAutomatiza.trim()
        ? body.queSeAutomatiza.trim().slice(0, 2000)
        : p.queSeAutomatiza;
    const historial = this.agregarAlHistorial(p.historial, {
      en: new Date().toISOString(),
      por: NOMBRE_AGENTE_MEJORA,
      accion: 'REESCRIBIO_PLAN',
      planAnterior: p.plan,
      comentarioAtendido: p.comentarioCambios,
    });
    await this.prisma.$executeRawUnsafe(
      `UPDATE "AgentPropuesta"
         SET "plan" = $2::jsonb, "queSeAutomatiza" = $3, "estado" = 'PENDIENTE',
             "revision" = "revision" + 1, "historial" = $4::jsonb, "updatedAt" = NOW()
       WHERE "id" = $1`,
      id,
      JSON.stringify(plan),
      queSeAutomatiza,
      JSON.stringify(historial),
    );
    const actualizada = await this.cargarPropuesta(id);
    await this.avisar(
      p.companyId,
      `Mejora continua: plan corregido de «${p.titulo}»`,
      'El agente reescribió el plan con tus cambios. Revísalo y apruébalo o pide más cambios.',
      `El plan de «${p.titulo}» se reescribió con los cambios que pediste. Revísalo en la pantalla.`,
      `${PREFIJO_ASUNTO} Plan corregido: ${p.titulo}`,
    );
    return actualizada;
  }

  private async guardarInforme(
    semana: string,
    tipo: 'LUNES' | 'VIERNES',
    companyId: number | null,
    contenido: unknown,
  ) {
    const existente = await this.prisma.$queryRawUnsafe<{ id: number }[]>(
      `SELECT "id" FROM "AgentMejoraInforme"
        WHERE "semana" = $1 AND "tipo" = $2 AND "companyId" IS NOT DISTINCT FROM $3::int`,
      semana,
      tipo,
      companyId,
    );
    if (existente.length) {
      await this.prisma.$executeRawUnsafe(
        `UPDATE "AgentMejoraInforme" SET "contenido" = $2::jsonb, "createdAt" = NOW() WHERE "id" = $1`,
        existente[0].id,
        JSON.stringify(contenido),
      );
      return;
    }
    await this.prisma.$executeRawUnsafe(
      `INSERT INTO "AgentMejoraInforme" ("semana","tipo","companyId","contenido") VALUES ($1,$2,$3::int,$4::jsonb)`,
      semana,
      tipo,
      companyId,
      JSON.stringify(contenido),
    );
  }

  private objetoPlano(v: unknown): Record<string, string> {
    if (!v || typeof v !== 'object' || Array.isArray(v)) return {};
    const salida: Record<string, string> = {};
    for (const [k, val] of Object.entries(v as Record<string, unknown>).slice(0, 12)) {
      if (typeof val === 'string') salida[k.slice(0, 60)] = val.slice(0, 120);
    }
    return salida;
  }

  private modeloPrincipal(modelos: Record<string, string>): string | null {
    return modelos.director ?? Object.values(modelos)[0] ?? null;
  }

  // ─────────────────────────── Avisos ───────────────────────────

  /**
   * Campana para el equipo de Sistemas de la empresa de las rutinas (personas con «Escribir»
   * marcado de forma explícita en Sistemas) y correo SOLO a las direcciones de
   * MEJORA_CONTINUA_CORREO. Sin empresa configurada no hay campana (las notificaciones la exigen);
   * sin esa variable no sale ningún correo (regla de Leidy: correos reales solo a cuentas que ella designe).
   */
  private async avisar(
    companyId: number | null,
    titulo: string,
    mensaje: string,
    cuerpoCorreo: string,
    asunto: string,
  ) {
    if (companyId !== null) {
      try {
        const equipo = await this.permisos.getUsersWithExplicitSectionWrite('SISTEMAS');
        for (const u of equipo.filter((x) => x.companyId === companyId)) {
          const ya = await this.prisma.notification.findFirst({
            where: { userId: u.id, title: titulo, createdAt: { gte: new Date(Date.now() - 86400000) } },
            select: { id: true },
          });
          if (ya) continue;
          await this.notificaciones.create({
            userId: u.id,
            companyId,
            title: titulo,
            message: mensaje.slice(0, 500),
            link: RUTA_PANTALLA,
          });
        }
      } catch (err) {
        this.logger.warn(`No se pudo crear el aviso en la campana: ${(err as Error).message}`);
      }
    }
    const destinos = (process.env.MEJORA_CONTINUA_CORREO ?? '')
      .split(',')
      .map((d) => d.trim())
      .filter(Boolean);
    const base = (process.env.FRONTEND_URL || '').replace(/\/$/, '');
    for (const to of destinos) {
      try {
        await this.mail.sendMail({
          to,
          subject: asunto,
          bodyText: `${cuerpoCorreo}\n\nVer y decidir: ${base}${RUTA_PANTALLA}\n\nEste es un aviso automático del Agente de Mejora Continua.`,
        });
      } catch (err) {
        this.logger.warn(`No se pudo enviar el correo a ${to}: ${(err as Error).message}`);
      }
    }
  }
}
