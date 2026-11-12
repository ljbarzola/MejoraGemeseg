import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { BitacoraService, UsuarioBitacora } from './bitacora.service';
import { esFechaValida, hoyEcuador } from './bitacora-fecha.util';
import {
  calcularSaldo,
  cierreAutomatico,
  DEUDA_MAXIMA_MINUTOS,
  MotivoCierre,
  minutosActivos,
  minutosContados,
  minutosDeExtra,
  REGLAS_POR_DEFECTO,
  ReglasExtra,
  Saldo,
} from './bitacora-extra.util';
import {
  diasDeTexto,
  Horario,
  VentanaExtra,
} from './bitacora-extension.util';

const MIN = 60_000;
const HISTORIAL_PERSONA = 30;
const HISTORIAL_DIAS_EQUIPO = 45;

export interface ExtraVista {
  id: number;
  inicio: string;
  fin: string | null;
  cierre: string | null;
  /** Minutos con actividad real fuera del horario (en una ventana abierta, hasta ahora). */
  minutos: number;
  /** Lo que cuenta tras la tolerancia. */
  minutosContados: number;
  estado: string;
  notaJefe: string | null;
  resueltoEn: string | null;
}

export interface DeudaVista {
  id: number;
  fecha: string;
  minutos: number;
  motivo: string;
  creadaPor: string | null;
  creadaEn: string;
}

export interface EstadoHoras {
  /** La empresa ya guardó un horario (sin él no hay tiempo extra que medir). */
  horarioConfigurado: boolean;
  reglas: ReglasExtra;
  /** Ventana abierta ahora mismo, si la hay. */
  abierta: ExtraVista | null;
  saldo: Saldo;
  extras: ExtraVista[];
  deudas: DeudaVista[];
}

export interface PersonaSaldo extends Saldo {
  userId: number;
  nombre: string;
  cargo: string | null;
}

export interface ExtraPendiente extends ExtraVista {
  userId: number;
  nombre: string;
}

/**
 * Bolsa de horas: tiempo extra (llegar antes / quedarse después, medido con la
 * actividad real) menos las horas que la persona debe. Un administrador o gerente
 * aprueba cada tiempo extra antes de que sume.
 */
@Injectable()
export class BitacoraHorasService {
  private readonly logger = new Logger(BitacoraHorasService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly bitacora: BitacoraService,
    private readonly notificaciones: NotificationsService,
  ) {}

  // ───────────────────────── Horario y reglas ─────────────────────────

  /** Horario y reglas de la empresa (con valores por defecto si aún no hay fila). */
  async horarioYReglas(
    companyId: number | null,
  ): Promise<{ horario: Horario | null; reglas: ReglasExtra }> {
    if (!companyId) return { horario: null, reglas: REGLAS_POR_DEFECTO };
    const fila = await this.prisma.bitacoraHorario.findUnique({
      where: { companyId },
    });
    if (!fila) return { horario: null, reglas: REGLAS_POR_DEFECTO };
    const dias = diasDeTexto(fila.dias);
    return {
      horario: dias.length
        ? { dias, inicio: fila.inicio, fin: fila.fin }
        : null,
      reglas: {
        toleranciaMinutos: fila.toleranciaMinutos,
        inactividadMinutos: fila.inactividadMinutos,
      },
    };
  }

  // ───────────────────────── Lo que usa la extensión ─────────────────────────

  /** Ventanas en las que el servidor acepta tramos fuera del horario: la abierta y las cerradas hace poco. */
  async ventanasRecientes(userId: number): Promise<VentanaExtra[]> {
    const desde = new Date(Date.now() - 49 * 3_600_000);
    const filas = await this.prisma.bitacoraExtra.findMany({
      where: { userId, OR: [{ fin: null }, { fin: { gte: desde } }] },
      select: { inicio: true, fin: true },
    });
    return filas;
  }

  /** ¿Tiene una ventana de tiempo extra abierta? Antes cierra la que ya debió cerrarse sola. */
  async tieneAbierta(userId: number, companyId: number | null): Promise<boolean> {
    await this.resolverAbierta(userId, companyId);
    const n = await this.prisma.bitacoraExtra.count({
      where: { userId, fin: null },
    });
    return n > 0;
  }

  // ───────────────────────── Empezar y terminar ─────────────────────────

  async iniciar(user: UsuarioBitacora): Promise<EstadoHoras> {
    if (!(await this.bitacora.personaActiva(user.userId, user.companyId))) {
      throw new ForbiddenException(
        'Tu hoja del día no está activa, así que no se puede medir el tiempo extra.',
      );
    }
    const companyId = user.companyId as number;
    const { horario } = await this.horarioYReglas(companyId);
    if (!horario) {
      throw new BadRequestException(
        'Tu empresa aún no definió el horario, así que no hay tiempo extra que medir. Pídele a un administrador que lo guarde en Configuración → Horario.',
      );
    }
    await this.resolverAbierta(user.userId, companyId);
    const abierta = await this.prisma.bitacoraExtra.findFirst({
      where: { userId: user.userId, fin: null },
    });
    if (!abierta) {
      try {
        await this.prisma.bitacoraExtra.create({
          data: { userId: user.userId, companyId, inicio: new Date() },
        });
      } catch {
        // Dos clics a la vez: el índice único ya dejó una sola ventana abierta.
      }
    }
    return this.estadoPersona(user);
  }

  async terminar(user: UsuarioBitacora): Promise<EstadoHoras> {
    await this.resolverAbierta(user.userId, user.companyId);
    const abierta = await this.prisma.bitacoraExtra.findFirst({
      where: { userId: user.userId, fin: null },
    });
    if (abierta) {
      await this.cerrar(abierta, new Date(), 'MANUAL');
    }
    return this.estadoPersona(user);
  }

  /**
   * Cierra la ventana abierta de la persona si ya le tocaba cerrarse sola
   * (inactividad, empezó el horario normal o llegó al tope). Se revisa al leer,
   * porque en producción no hay un proceso que corra solo.
   */
  async resolverAbierta(
    userId: number,
    companyId: number | null,
  ): Promise<void> {
    const abierta = await this.prisma.bitacoraExtra.findFirst({
      where: { userId, fin: null },
    });
    if (!abierta) return;
    const { horario, reglas } = await this.horarioYReglas(companyId);
    const ahora = new Date();
    const activos = await this.activosDesde(userId, abierta.inicio, ahora);
    const cierre = cierreAutomatico({
      inicio: abierta.inicio,
      ahora,
      activos,
      horario,
      inactividadMinutos: reglas.inactividadMinutos,
    });
    if (cierre) await this.cerrar(abierta, cierre.fin, cierre.motivo);
  }

  private async activosDesde(
    userId: number,
    desde: Date,
    hasta: Date,
  ): Promise<Set<number>> {
    // Un tramo del navegador puede haber empezado hasta 10 minutos antes de `desde`.
    const eventos = await this.prisma.bitacoraEvento.findMany({
      where: {
        userId,
        ocurridoEn: {
          gte: new Date(desde.getTime() - 10 * MIN),
          lte: hasta,
        },
      },
      select: { ocurridoEn: true, fuente: true, minutos: true },
    });
    return minutosActivos(eventos);
  }

  private async cerrar(
    extra: { id: number; userId: number; companyId: number; inicio: Date },
    fin: Date,
    motivo: MotivoCierre,
  ): Promise<void> {
    const finReal = new Date(Math.max(fin.getTime(), extra.inicio.getTime()));
    const { horario, reglas } = await this.horarioYReglas(extra.companyId);
    const activos = await this.activosDesde(extra.userId, extra.inicio, finReal);
    const minutos = minutosDeExtra({
      inicio: extra.inicio,
      fin: finReal,
      activos,
      horario,
    });
    const contados = minutosContados(minutos, reglas.toleranciaMinutos);
    // Con una sola actualización condicionada, dos cierres a la vez no se pisan.
    await this.prisma.bitacoraExtra.updateMany({
      where: { id: extra.id, fin: null },
      data: {
        fin: finReal,
        cierre: motivo,
        minutos,
        minutosContados: contados,
        estado: contados > 0 ? 'PENDIENTE' : 'SIN_TIEMPO',
      },
    });
  }

  // ───────────────────────── Lo que ve cada persona ─────────────────────────

  async estadoPersona(user: UsuarioBitacora): Promise<EstadoHoras> {
    await this.resolverAbierta(user.userId, user.companyId);
    const { horario, reglas } = await this.horarioYReglas(user.companyId);
    const [extras, deudas] = await Promise.all([
      this.prisma.bitacoraExtra.findMany({
        where: { userId: user.userId },
        orderBy: { inicio: 'desc' },
      }),
      this.prisma.bitacoraDeuda.findMany({
        where: { userId: user.userId, anuladaEn: null },
        orderBy: { creadaEn: 'desc' },
      }),
    ]);
    const abierta = extras.find((e) => e.fin === null) ?? null;
    let abiertaVista: ExtraVista | null = null;
    if (abierta) {
      const ahora = new Date();
      const activos = await this.activosDesde(user.userId, abierta.inicio, ahora);
      const minutos = minutosDeExtra({
        inicio: abierta.inicio,
        fin: ahora,
        activos,
        horario,
      });
      abiertaVista = {
        ...this.vistaExtra(abierta),
        minutos,
        minutosContados: minutosContados(minutos, reglas.toleranciaMinutos),
      };
    }
    const creadores = await this.nombresDe(
      deudas.map((d) => d.creadaPorId).filter((i): i is number => !!i),
    );
    return {
      horarioConfigurado: !!horario,
      reglas,
      abierta: abiertaVista,
      saldo: calcularSaldo(extras, deudas),
      extras: extras
        .filter((e) => e.fin !== null)
        .slice(0, HISTORIAL_PERSONA)
        .map((e) => this.vistaExtra(e)),
      deudas: deudas.slice(0, HISTORIAL_PERSONA).map((d) => ({
        id: d.id,
        fecha: d.fecha,
        minutos: d.minutos,
        motivo: d.motivo,
        creadaPor: d.creadaPorId ? (creadores.get(d.creadaPorId) ?? null) : null,
        creadaEn: d.creadaEn.toISOString(),
      })),
    };
  }

  // ───────────────────────── Horas que se deben ─────────────────────────

  /**
   * Anota horas que se deben (permiso, atraso, salida antes). La persona anota las
   * suyas; un administrador o gerente puede anotarlas a alguien de su empresa.
   */
  async anotarDeuda(
    user: UsuarioBitacora,
    datos: { userId?: number; minutos: number; motivo: string; fecha?: string },
  ): Promise<EstadoHoras> {
    const objetivo = datos.userId ?? user.userId;
    const motivo = (datos.motivo ?? '').trim();
    if (!Number.isInteger(datos.minutos) || datos.minutos < 1) {
      throw new BadRequestException('Escribe cuánto tiempo debes, en minutos.');
    }
    if (datos.minutos > DEUDA_MAXIMA_MINUTOS) {
      throw new BadRequestException('Es demasiado tiempo para anotarlo de una vez.');
    }
    if (motivo.length < 3 || motivo.length > 200) {
      throw new BadRequestException('Escribe el motivo (entre 3 y 200 letras).');
    }
    const fecha = datos.fecha ?? hoyEcuador();
    if (!esFechaValida(fecha)) {
      throw new BadRequestException('La fecha no es válida.');
    }

    let companyId: number;
    if (objetivo === user.userId) {
      if (!(await this.bitacora.personaActiva(user.userId, user.companyId))) {
        throw new ForbiddenException(
          'Tu hoja del día no está activa, así que no se puede llevar tu saldo de horas.',
        );
      }
      companyId = user.companyId as number;
    } else {
      companyId = await this.bitacora.exigirAdministrador(user);
      await this.bitacora.personaDeLaEmpresa(companyId, objetivo);
    }

    await this.prisma.bitacoraDeuda.create({
      data: {
        userId: objetivo,
        companyId,
        fecha,
        minutos: datos.minutos,
        motivo,
        creadaPorId: user.userId,
      },
    });
    if (objetivo !== user.userId) {
      await this.avisar(
        objetivo,
        companyId,
        'Se anotaron horas que debes',
        `Se anotaron ${duracion(datos.minutos)} del ${fecha}: ${motivo}. Míralo en «Mi hoja del día».`,
      );
    }
    return this.estadoPersona(user);
  }

  /** Anula una deuda anotada por error. Solo administradores y gerentes de la empresa. */
  async anularDeuda(user: UsuarioBitacora, id: number): Promise<{ ok: true }> {
    const companyId = await this.bitacora.exigirAdministrador(user);
    const fila = await this.prisma.bitacoraDeuda.findFirst({
      where: { id, companyId, anuladaEn: null },
    });
    if (!fila) throw new NotFoundException('No se encontró esa anotación.');
    await this.prisma.bitacoraDeuda.update({
      where: { id },
      data: { anuladaEn: new Date(), anuladaPorId: user.userId },
    });
    return { ok: true };
  }

  // ───────────────────────── Administradores y gerentes ─────────────────────────

  /** Saldo de cada persona con la hoja activada o con movimientos, y el tiempo extra que espera aprobación. */
  async resumenEquipo(user: UsuarioBitacora): Promise<{
    personas: PersonaSaldo[];
    pendientes: ExtraPendiente[];
    recientes: ExtraPendiente[];
    deudas: (DeudaVista & { userId: number; nombre: string })[];
  }> {
    const companyId = await this.bitacora.exigirAdministrador(user);
    // Cierra las ventanas que ya debieron cerrarse, para no listar «abiertas» olvidadas.
    const abiertas = await this.prisma.bitacoraExtra.findMany({
      where: { companyId, fin: null },
      select: { userId: true },
    });
    for (const a of abiertas) await this.resolverAbierta(a.userId, companyId);

    const desde = new Date(Date.now() - HISTORIAL_DIAS_EQUIPO * 86_400_000);
    const [extras, deudas, activaciones] = await Promise.all([
      this.prisma.bitacoraExtra.findMany({
        where: { companyId },
        orderBy: { inicio: 'desc' },
      }),
      this.prisma.bitacoraDeuda.findMany({
        where: { companyId, anuladaEn: null },
        orderBy: { creadaEn: 'desc' },
      }),
      this.prisma.bitacoraActivacion.findMany({
        where: { activa: true, user: { companyId, isActive: true } },
        select: { userId: true },
      }),
    ]);

    const ids = new Set<number>([
      ...activaciones.map((a) => a.userId),
      ...extras.map((e) => e.userId),
      ...deudas.map((d) => d.userId),
    ]);
    const personas = ids.size
      ? await this.prisma.user.findMany({
          where: { id: { in: [...ids] }, companyId },
          select: { id: true, fullName: true, position: true },
          orderBy: { fullName: 'asc' },
        })
      : [];
    const nombres = new Map(personas.map((p) => [p.id, p.fullName]));
    const creadores = await this.nombresDe(
      deudas.map((d) => d.creadaPorId).filter((i): i is number => !!i),
    );

    const conNombre = (e: (typeof extras)[number]): ExtraPendiente => ({
      ...this.vistaExtra(e),
      userId: e.userId,
      nombre: nombres.get(e.userId) ?? 'Persona',
    });
    const cerradas = extras.filter((e) => e.fin !== null);
    return {
      personas: personas.map((p) => ({
        userId: p.id,
        nombre: p.fullName,
        cargo: p.position,
        ...calcularSaldo(
          extras.filter((e) => e.userId === p.id),
          deudas.filter((d) => d.userId === p.id),
        ),
      })),
      pendientes: cerradas.filter((e) => e.estado === 'PENDIENTE').map(conNombre),
      recientes: cerradas
        .filter((e) => e.estado !== 'PENDIENTE' && e.inicio >= desde)
        .slice(0, 50)
        .map(conNombre),
      deudas: deudas
        .filter((d) => d.creadaEn >= desde)
        .slice(0, 50)
        .map((d) => ({
          id: d.id,
          userId: d.userId,
          nombre: nombres.get(d.userId) ?? 'Persona',
          fecha: d.fecha,
          minutos: d.minutos,
          motivo: d.motivo,
          creadaPor: d.creadaPorId ? (creadores.get(d.creadaPorId) ?? null) : null,
          creadaEn: d.creadaEn.toISOString(),
        })),
    };
  }

  /**
   * Aprueba o rechaza un tiempo extra. No se aprueba el propio, salvo que no haya
   * otro administrador o gerente activo en la empresa (caso del piloto con una sola persona).
   */
  async resolverExtra(
    user: UsuarioBitacora,
    id: number,
    aprobar: boolean,
    nota?: string,
  ): Promise<{ ok: true }> {
    const companyId = await this.bitacora.exigirAdministrador(user);
    const extra = await this.prisma.bitacoraExtra.findFirst({
      where: { id, companyId },
    });
    if (!extra || extra.fin === null) {
      throw new NotFoundException('No se encontró ese tiempo extra.');
    }
    if (extra.estado !== 'PENDIENTE') {
      throw new BadRequestException('Ese tiempo extra ya fue resuelto.');
    }
    const textoNota = (nota ?? '').trim().slice(0, 300) || null;
    if (!aprobar && !textoNota) {
      throw new BadRequestException('Escribe el motivo del rechazo.');
    }
    if (extra.userId === user.userId) {
      const otros = await this.prisma.user.count({
        where: {
          companyId,
          isActive: true,
          id: { not: user.userId },
          role: { in: ['ADMIN', 'MANAGER'] },
        },
      });
      if (otros > 0) {
        throw new ForbiddenException(
          'No puedes aprobar tu propio tiempo extra: lo resuelve otro administrador o gerente.',
        );
      }
    }
    const r = await this.prisma.bitacoraExtra.updateMany({
      where: { id, estado: 'PENDIENTE' },
      data: {
        estado: aprobar ? 'APROBADA' : 'RECHAZADA',
        resueltoPorId: user.userId,
        resueltoEn: new Date(),
        notaJefe: textoNota,
      },
    });
    if (r.count === 0) {
      throw new BadRequestException('Ese tiempo extra ya fue resuelto.');
    }
    if (extra.userId !== user.userId) {
      await this.avisar(
        extra.userId,
        companyId,
        aprobar ? 'Aprobaron tu tiempo extra' : 'Rechazaron tu tiempo extra',
        aprobar
          ? `Se sumaron ${duracion(extra.minutosContados ?? 0)} a tu saldo de horas.`
          : `No se sumaron ${duracion(extra.minutosContados ?? 0)}: ${textoNota}`,
      );
    }
    return { ok: true };
  }

  // ───────────────────────── Auxiliares ─────────────────────────

  private vistaExtra(e: {
    id: number;
    inicio: Date;
    fin: Date | null;
    cierre: string | null;
    minutos: number | null;
    minutosContados: number | null;
    estado: string;
    notaJefe: string | null;
    resueltoEn: Date | null;
  }): ExtraVista {
    return {
      id: e.id,
      inicio: e.inicio.toISOString(),
      fin: e.fin ? e.fin.toISOString() : null,
      cierre: e.cierre,
      minutos: e.minutos ?? 0,
      minutosContados: e.minutosContados ?? 0,
      estado: e.estado,
      notaJefe: e.notaJefe,
      resueltoEn: e.resueltoEn ? e.resueltoEn.toISOString() : null,
    };
  }

  private async nombresDe(ids: number[]): Promise<Map<number, string>> {
    const unicos = [...new Set(ids)];
    if (!unicos.length) return new Map();
    const filas = await this.prisma.user.findMany({
      where: { id: { in: unicos } },
      select: { id: true, fullName: true },
    });
    return new Map(filas.map((f) => [f.id, f.fullName]));
  }

  private async avisar(
    userId: number,
    companyId: number,
    title: string,
    message: string,
  ): Promise<void> {
    try {
      await this.notificaciones.create({
        userId,
        companyId,
        title,
        message,
        link: '/bitacora/mi-hoja',
      });
    } catch (err) {
      this.logger.warn(
        `No se pudo avisar a la persona: ${(err as Error).message}`,
      );
    }
  }
}

/** «2 h 15 min», «45 min». */
function duracion(minutos: number): string {
  const h = Math.floor(minutos / 60);
  const m = minutos % 60;
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}
