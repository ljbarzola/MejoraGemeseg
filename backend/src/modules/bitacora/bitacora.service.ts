import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { BITACORA_DDL } from './bitacora.schema';
import { esFechaValida, hoyEcuador, rangoDia } from './bitacora-fecha.util';
import { construirHoja, HojaDia } from './bitacora-hoja.util';
import {
  calcularMetricas,
  desdeDelPeriodo,
  Metricas,
  resolverPeriodo,
} from './bitacora-metricas.util';
import {
  ACCION_POR_METODO,
  esRutaExcluida,
  idDeParams,
  idDeRespuesta,
  moduloDeRuta,
  nombreDeRespuesta,
  normalizarRuta,
} from './bitacora-registro.util';

/** Forma mínima de la petición que necesita el registro (req.user lo pone JwtStrategy). */
export interface PeticionAutenticada {
  method: string;
  route?: { path?: string };
  params?: Record<string, string>;
  user?: { userId: number; companyId: number | null; role?: string };
}

/** Quien hace la petición, tal como lo deja JwtStrategy. */
export interface UsuarioBitacora {
  userId: number;
  companyId: number | null;
  role: string;
}

export interface EstadoBitacora {
  /** La empresa tiene la sección encendida (lo decide un super administrador). */
  empresaActiva: boolean;
  /** La persona tiene o tuvo la hoja activada (aparece «Mi hoja del día» en su menú). */
  registrada: boolean;
  /** Hoy se le está registrando. */
  activa: boolean;
  desde: string | null;
  /** Puede activar y desactivar hojas (administradores y gerentes). */
  puedeAdministrar: boolean;
}

export interface ActivacionPersona {
  userId: number;
  nombre: string;
  cargo: string | null;
  email: string;
  activa: boolean;
  desde: string | null;
  cambiadaEn: string | null;
  cambiadaPor: string | null;
}

export interface ResumenPersona {
  userId: number;
  nombre: string;
  cargo: string | null;
  /** Hoy se le está registrando; false = solo se muestra su historial. */
  activa: boolean;
  primera: string | null;
  ultima: string | null;
  totalEventos: number;
  accionesApp: number;
  eventosGoogle: number;
  huecosLargos: number;
  mayorHuecoMinutos: number;
}

/** Roles que deciden a quién se le activa la hoja del día. */
const ROLES_QUE_ACTIVAN = ['ADMIN', 'MANAGER'];
const CACHE_EMPRESA_MS = 60_000;
// Corto a propósito: dejar de registrar a alguien debe notarse casi al instante.
const CACHE_PERSONA_MS = 15_000;
const REPETIDO_MS = 30_000;

@Injectable()
export class BitacoraService implements OnModuleInit {
  private readonly logger = new Logger(BitacoraService.name);
  private readonly cacheEmpresa = new Map<
    number,
    { activa: boolean; hasta: number }
  >();
  private readonly cachePersona = new Map<
    number,
    { activa: boolean; hasta: number }
  >();
  private readonly ultimas = new Map<string, number>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificaciones: NotificationsService,
  ) {}

  async onModuleInit() {
    try {
      for (const sql of BITACORA_DDL) {
        await this.prisma.$executeRawUnsafe(sql);
      }
    } catch (err) {
      this.logger.warn(
        `No se pudieron asegurar las tablas de la Bitácora: ${(err as Error).message}`,
      );
    }
  }

  // ───────────────────────── Quién se registra ─────────────────────────

  /** ¿La empresa tiene encendida la sección BITACORA? Mientras no, no se registra nada. */
  async empresaActiva(companyId: number | null): Promise<boolean> {
    if (!companyId) return false;
    const ahora = Date.now();
    const guardada = this.cacheEmpresa.get(companyId);
    if (guardada && guardada.hasta > ahora) return guardada.activa;
    const fila = await this.prisma.companySection.findFirst({
      where: { companyId, section: 'BITACORA' },
      select: { id: true },
    });
    const activa = !!fila;
    this.cacheEmpresa.set(companyId, {
      activa,
      hasta: ahora + CACHE_EMPRESA_MS,
    });
    return activa;
  }

  /** ¿Hoy se le registra la hoja a esta persona? Por defecto no: hace falta empresa encendida Y persona activada. */
  async personaActiva(
    userId: number,
    companyId: number | null,
  ): Promise<boolean> {
    if (!companyId || !(await this.empresaActiva(companyId))) return false;
    const ahora = Date.now();
    const guardada = this.cachePersona.get(userId);
    if (guardada && guardada.hasta > ahora) return guardada.activa;
    const fila = await this.prisma.bitacoraActivacion.findUnique({
      where: { userId },
      select: { activa: true },
    });
    const activa = fila?.activa === true;
    this.cachePersona.set(userId, { activa, hasta: ahora + CACHE_PERSONA_MS });
    return activa;
  }

  private puedeActivar(user: UsuarioBitacora): boolean {
    return !!user.companyId && ROLES_QUE_ACTIVAN.includes(user.role);
  }

  async estado(user: UsuarioBitacora): Promise<EstadoBitacora> {
    const empresaActiva = await this.empresaActiva(user.companyId);
    const fila = empresaActiva
      ? await this.prisma.bitacoraActivacion.findUnique({
          where: { userId: user.userId },
          select: { activa: true, desde: true },
        })
      : null;
    return {
      empresaActiva,
      registrada: !!fila,
      activa: fila?.activa === true,
      desde: fila?.desde ? fila.desde.toISOString() : null,
      puedeAdministrar: empresaActiva && this.puedeActivar(user),
    };
  }

  /** Devuelve la empresa de quien administra; si no es administrador o gerente, o la bitácora está apagada, falla con un mensaje claro. */
  async exigirAdministrador(user: UsuarioBitacora): Promise<number> {
    if (!this.puedeActivar(user) || !user.companyId) {
      throw new ForbiddenException(
        'Solo los administradores y gerentes de la empresa pueden administrar la bitácora.',
      );
    }
    if (!(await this.empresaActiva(user.companyId))) {
      throw new ForbiddenException(
        'La bitácora no está encendida para tu empresa.',
      );
    }
    return user.companyId;
  }

  /**
   * Lo que la pantalla de Configuración muestra de Google: cuántas personas se
   * leen y cuándo fue el último evento de Google que quedó guardado.
   */
  async resumenGoogle(
    companyId: number,
  ): Promise<{ personasActivas: number; ultimoEvento: string | null }> {
    const [personasActivas, ultimo] = await Promise.all([
      this.prisma.bitacoraActivacion.count({
        where: { activa: true, user: { companyId, isActive: true } },
      }),
      this.prisma.bitacoraEvento.aggregate({
        where: { companyId, fuente: 'GOOGLE' },
        _max: { ocurridoEn: true },
      }),
    ]);
    return {
      personasActivas,
      ultimoEvento: ultimo._max.ocurridoEn?.toISOString() ?? null,
    };
  }

  /** Todas las personas activas de la empresa con su estado (por defecto, ninguna activada). */
  async listarActivaciones(
    user: UsuarioBitacora,
  ): Promise<ActivacionPersona[]> {
    const companyId = await this.exigirAdministrador(user);
    const personas = await this.prisma.user.findMany({
      where: { companyId, isActive: true },
      select: {
        id: true,
        fullName: true,
        position: true,
        email: true,
        bitacoraActivacion: {
          select: {
            activa: true,
            desde: true,
            actualizadaEn: true,
            activadaPor: { select: { fullName: true } },
          },
        },
      },
      orderBy: { fullName: 'asc' },
    });
    return personas.map((p) => ({
      userId: p.id,
      nombre: p.fullName,
      cargo: p.position,
      email: p.email,
      activa: p.bitacoraActivacion?.activa === true,
      desde: p.bitacoraActivacion?.desde?.toISOString() ?? null,
      cambiadaEn: p.bitacoraActivacion?.actualizadaEn.toISOString() ?? null,
      cambiadaPor: p.bitacoraActivacion?.activadaPor?.fullName ?? null,
    }));
  }

  /**
   * Activa o desactiva la hoja de una persona y le avisa. Desactivar conserva lo
   * ya registrado y solo deja de registrar. Si no cambia nada, no hace nada ni avisa.
   */
  async cambiarActivacion(
    user: UsuarioBitacora,
    personaId: number,
    activa: boolean,
  ): Promise<ActivacionPersona> {
    const companyId = await this.exigirAdministrador(user);
    const persona = await this.prisma.user.findFirst({
      where: { id: personaId, companyId, isActive: true },
      select: { id: true },
    });
    if (!persona) {
      throw new NotFoundException(
        'No se encontró a esa persona en tu empresa.',
      );
    }

    const previa = await this.prisma.bitacoraActivacion.findUnique({
      where: { userId: personaId },
      select: { activa: true },
    });
    if ((previa?.activa ?? false) !== activa) {
      const ahora = new Date();
      await this.prisma.bitacoraActivacion.upsert({
        where: { userId: personaId },
        create: {
          userId: personaId,
          activa,
          desde: activa ? ahora : null,
          activadaPorId: user.userId,
          actualizadaEn: ahora,
        },
        update: {
          activa,
          ...(activa ? { desde: ahora } : {}),
          activadaPorId: user.userId,
          actualizadaEn: ahora,
        },
      });
      this.cachePersona.delete(personaId);
      await this.avisarCambio(personaId, companyId, activa);
    }

    const lista = await this.listarActivaciones(user);
    return lista.find((p) => p.userId === personaId) as ActivacionPersona;
  }

  /** Aviso a la persona: debe saber cuándo se le empieza o se le deja de registrar. */
  private async avisarCambio(
    userId: number,
    companyId: number,
    activa: boolean,
  ): Promise<void> {
    try {
      await this.notificaciones.create({
        userId,
        companyId,
        title: activa
          ? 'Se activó tu hoja del día'
          : 'Se desactivó tu hoja del día',
        message: activa
          ? 'Desde ahora se registra tu actividad en app.gemeseg y en tu cuenta de Google. En «Mi hoja del día» ves exactamente qué se registra.'
          : 'Ya no se registra tu actividad. Lo registrado antes sigue disponible en «Mi hoja del día».',
        link: '/bitacora/mi-hoja',
      });
    } catch (err) {
      this.logger.warn(
        `No se pudo avisar a la persona: ${(err as Error).message}`,
      );
    }
  }

  // ───────────────────────── Registro de acciones ─────────────────────────

  /**
   * Anota una acción de la persona que acaba de salir bien, solo si a esa
   * persona se le registra la hoja. Nunca rompe la petición: cualquier fallo se
   * deja en el log del servidor y se sigue.
   */
  async registrarAccion(
    req: PeticionAutenticada,
    respuesta: unknown,
  ): Promise<void> {
    try {
      const accion = ACCION_POR_METODO[req.method];
      if (!accion) return;
      const ruta = normalizarRuta(req.route?.path);
      if (!ruta) return;
      if (ruta === '/auth/login') {
        await this.registrarSesion(respuesta);
        return;
      }
      const user = req.user;
      if (!user?.userId || !user.companyId || esRutaExcluida(ruta)) return;
      if (!(await this.personaActiva(user.userId, user.companyId))) return;
      const entidadId =
        (accion === 'CREAR' ? idDeRespuesta(respuesta) : null) ??
        idDeParams(req.params);
      if (this.esRepetido(user.userId, accion, ruta, entidadId)) return;
      await this.prisma.bitacoraEvento.create({
        data: {
          userId: user.userId,
          companyId: user.companyId,
          fuente: 'APP',
          modulo: moduloDeRuta(ruta),
          accion,
          ruta,
          entidadId,
          nombre: nombreDeRespuesta(respuesta),
        },
      });
    } catch (err) {
      this.logger.warn(
        `No se pudo anotar la acción: ${(err as Error).message}`,
      );
    }
  }

  /** Entrar a app.gemeseg también es actividad: sin esto, quien solo lee pantallas no tendría «primera actividad». */
  private async registrarSesion(respuesta: unknown): Promise<void> {
    const usuario = (
      respuesta as { user?: { id?: unknown; companyId?: unknown } }
    )?.user;
    const userId = usuario?.id;
    const companyId = usuario?.companyId;
    if (typeof userId !== 'number' || typeof companyId !== 'number') return;
    if (!(await this.personaActiva(userId, companyId))) return;
    if (this.esRepetido(userId, 'SESION', '/auth/login', null)) return;
    await this.prisma.bitacoraEvento.create({
      data: {
        userId,
        companyId,
        fuente: 'APP',
        modulo: 'auth',
        accion: 'SESION',
        ruta: '/auth/login',
      },
    });
  }

  /** Un guardado automático que repite la misma acción cada pocos segundos no debe llenar la tabla. */
  private esRepetido(
    userId: number,
    accion: string,
    ruta: string,
    entidadId: number | null,
  ): boolean {
    const ahora = Date.now();
    const clave = `${userId}|${accion}|${ruta}|${entidadId ?? ''}`;
    const previo = this.ultimas.get(clave);
    if (previo !== undefined && ahora - previo < REPETIDO_MS) return true;
    if (this.ultimas.size > 5000) {
      for (const [k, t] of this.ultimas) {
        if (ahora - t > REPETIDO_MS) this.ultimas.delete(k);
      }
    }
    this.ultimas.set(clave, ahora);
    return false;
  }

  // ───────────────────────── Consulta de hojas ─────────────────────────

  /** Valida el día pedido (por defecto, hoy en Ecuador). */
  resolverFecha(fecha?: string): string {
    if (!fecha) return hoyEcuador();
    if (!esFechaValida(fecha)) {
      throw new BadRequestException(
        'La fecha no es válida. Usa el formato AAAA-MM-DD.',
      );
    }
    return fecha;
  }

  async hojaDe(userId: number, fecha: string): Promise<HojaDia> {
    const { desde, hasta } = rangoDia(fecha);
    const eventos = await this.prisma.bitacoraEvento.findMany({
      where: { userId, ocurridoEn: { gte: desde, lt: hasta } },
      orderBy: { ocurridoEn: 'asc' },
      select: {
        fuente: true,
        modulo: true,
        accion: true,
        ruta: true,
        nombre: true,
        ocurridoEn: true,
      },
    });
    return construirHoja(fecha, eventos);
  }

  /** Métricas del equipo en los últimos 7, 14 o 30 días (hasta hoy, hora de Ecuador). */
  async metricas(companyId: number, dias?: unknown): Promise<Metricas> {
    const periodo = resolverPeriodo(dias);
    const hoy = hoyEcuador();
    const desde = desdeDelPeriodo(periodo, hoy);
    const [personasActivas, eventos] = await Promise.all([
      this.prisma.bitacoraActivacion.count({
        where: { activa: true, user: { companyId, isActive: true } },
      }),
      this.prisma.bitacoraEvento.findMany({
        where: {
          companyId,
          ocurridoEn: { gte: rangoDia(desde).desde, lt: rangoDia(hoy).hasta },
        },
        select: { userId: true, fuente: true, modulo: true, ocurridoEn: true },
      }),
    ]);
    return calcularMetricas(eventos, desde, periodo, personasActivas);
  }

  /**
   * Una fila por persona con la hoja activada, más quienes ya no la tienen pero
   * sí registraron algo ese día (su historial se conserva).
   */
  async resumenEquipo(
    companyId: number,
    fecha: string,
  ): Promise<ResumenPersona[]> {
    const { desde, hasta } = rangoDia(fecha);
    const [activaciones, eventos] = await Promise.all([
      this.prisma.bitacoraActivacion.findMany({
        where: { user: { companyId, isActive: true } },
        select: { userId: true, activa: true },
      }),
      this.prisma.bitacoraEvento.findMany({
        where: { companyId, ocurridoEn: { gte: desde, lt: hasta } },
        orderBy: { ocurridoEn: 'asc' },
        select: {
          userId: true,
          fuente: true,
          modulo: true,
          accion: true,
          ruta: true,
          nombre: true,
          ocurridoEn: true,
        },
      }),
    ]);

    const activas = new Set(
      activaciones.filter((a) => a.activa).map((a) => a.userId),
    );
    const ids = [...new Set([...activas, ...eventos.map((e) => e.userId)])];
    const personas = ids.length
      ? await this.prisma.user.findMany({
          where: { id: { in: ids }, companyId },
          select: { id: true, fullName: true, position: true },
          orderBy: { fullName: 'asc' },
        })
      : [];

    const porPersona = new Map<number, typeof eventos>();
    for (const e of eventos) {
      const lista = porPersona.get(e.userId);
      if (lista) lista.push(e);
      else porPersona.set(e.userId, [e]);
    }

    return personas.map((p) => {
      const propios = porPersona.get(p.id) ?? [];
      const hoja = construirHoja(fecha, propios);
      return {
        userId: p.id,
        nombre: p.fullName,
        cargo: p.position,
        activa: activas.has(p.id),
        primera: hoja.primera,
        ultima: hoja.ultima,
        totalEventos: hoja.totalEventos,
        accionesApp: propios.filter((e) => e.fuente === 'APP').length,
        eventosGoogle: propios.filter((e) => e.fuente === 'GOOGLE').length,
        huecosLargos: hoja.huecos.length,
        mayorHuecoMinutos: hoja.huecos.reduce(
          (m, h) => Math.max(m, h.minutos),
          0,
        ),
      };
    });
  }

  /** La persona debe ser de la misma empresa que quien consulta. */
  async personaDeLaEmpresa(companyId: number, userId: number) {
    const persona = await this.prisma.user.findFirst({
      where: { id: userId, companyId },
      select: {
        id: true,
        fullName: true,
        position: true,
        bitacoraActivacion: { select: { activa: true } },
      },
    });
    if (!persona) {
      throw new NotFoundException(
        'No se encontró a esa persona en tu empresa.',
      );
    }
    return {
      id: persona.id,
      fullName: persona.fullName,
      position: persona.position,
      activa: persona.bitacoraActivacion?.activa === true,
    };
  }

  /** Deja constancia de quién miró la hoja de quién. Si falla, no impide la consulta. */
  async registrarConsulta(
    consultorId: number,
    personaId: number,
    fecha: string,
  ) {
    if (consultorId === personaId) return;
    try {
      await this.prisma.bitacoraConsulta.create({
        data: { consultorId, personaId, fecha },
      });
    } catch (err) {
      this.logger.warn(
        `No se pudo anotar la consulta: ${(err as Error).message}`,
      );
    }
  }
}
