import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { BitacoraService, UsuarioBitacora } from './bitacora.service';
import {
  CODIGO_VIGENCIA_MS,
  diasATexto,
  diasDeTexto,
  errorDeHorario,
  externalIdDeTramo,
  generarCodigo,
  generarToken,
  hashear,
  Horario,
  HorarioPublico,
  horarioPublico,
  normalizarCodigo,
  validarTramos,
} from './bitacora-extension.util';

/** Quien envía lo que reporta la extensión, ya identificado por su token. */
export interface ExtensionAutenticada {
  vinculoId: number;
  userId: number;
  companyId: number | null;
  nombre: string;
}

export interface EstadoExtension {
  vinculada: boolean;
  dispositivos: {
    id: number;
    nombreEquipo: string | null;
    creadoEn: string;
    ultimoUso: string | null;
  }[];
}

export interface ConfiguracionExtension {
  /** Hoy se le está registrando (hoja activada y sección encendida). */
  registrando: boolean;
  horario: HorarioPublico | null;
  nombre: string;
  /** Hora del servidor, para que la extensión detecte un reloj desajustado. */
  ahora: string;
}

const MAX_DISPOSITIVOS = 5;
const INTENTOS_POR_IP = 10;
const INTENTOS_TOTALES = 60;
const VENTANA_INTENTOS_MS = 10 * 60_000;
const ULTIMO_USO_CADA_MS = 60_000;

@Injectable()
export class BitacoraExtensionService {
  private readonly logger = new Logger(BitacoraExtensionService.name);
  private readonly intentosPorIp = new Map<
    string,
    { fallos: number; hasta: number }
  >();
  private intentosTotales = { fallos: 0, hasta: 0 };
  private readonly ultimoUsoAnotado = new Map<number, number>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly bitacora: BitacoraService,
    private readonly notificaciones: NotificationsService,
  ) {}

  // ───────────────────────── Horario (administradores y gerentes) ─────────────────────────

  async horarioDe(companyId: number | null): Promise<Horario | null> {
    if (!companyId) return null;
    const fila = await this.prisma.bitacoraHorario.findUnique({
      where: { companyId },
    });
    if (!fila) return null;
    const dias = diasDeTexto(fila.dias);
    return dias.length ? { dias, inicio: fila.inicio, fin: fila.fin } : null;
  }

  async obtenerHorario(
    user: UsuarioBitacora,
  ): Promise<{ configurado: boolean } & Horario> {
    const companyId = await this.bitacora.exigirAdministrador(user);
    const h = await this.horarioDe(companyId);
    return {
      configurado: !!h,
      ...(h ?? { dias: [1, 2, 3, 4, 5], inicio: '08:00', fin: '17:00' }),
    };
  }

  async guardarHorario(
    user: UsuarioBitacora,
    horario: Horario,
  ): Promise<{ configurado: boolean } & Horario> {
    const companyId = await this.bitacora.exigirAdministrador(user);
    const error = errorDeHorario(horario);
    if (error) throw new BadRequestException(error);
    const datos = {
      dias: diasATexto(horario.dias),
      inicio: horario.inicio,
      fin: horario.fin,
      actualizadoEn: new Date(),
      actualizadoPorId: user.userId,
    };
    await this.prisma.bitacoraHorario.upsert({
      where: { companyId },
      create: { companyId, ...datos },
      update: datos,
    });
    return this.obtenerHorario(user);
  }

  // ───────────────────────── Vinculación (la persona, desde app.gemeseg) ─────────────────────────

  /** Código de un solo uso para vincular la extensión. Solo a quien hoy se le registra la hoja. */
  async crearCodigo(
    user: UsuarioBitacora,
  ): Promise<{ codigo: string; expiraEn: string }> {
    if (!(await this.bitacora.personaActiva(user.userId, user.companyId))) {
      throw new ForbiddenException(
        'Tu hoja del día no está activa, así que no se puede vincular la extensión.',
      );
    }
    const codigo = generarCodigo();
    const expiraEn = new Date(Date.now() + CODIGO_VIGENCIA_MS);
    const codigoHash = hashear(normalizarCodigo(codigo) as string);
    await this.prisma.bitacoraExtensionCodigo.upsert({
      where: { userId: user.userId },
      create: { userId: user.userId, codigoHash, expiraEn },
      update: { codigoHash, expiraEn },
    });
    return { codigo, expiraEn: expiraEn.toISOString() };
  }

  async estadoPersona(user: UsuarioBitacora): Promise<EstadoExtension> {
    const vinculos = await this.prisma.bitacoraExtensionVinculo.findMany({
      where: { userId: user.userId, revocadoEn: null },
      orderBy: { creadoEn: 'desc' },
    });
    return {
      vinculada: vinculos.length > 0,
      dispositivos: vinculos.map((v) => ({
        id: v.id,
        nombreEquipo: v.nombreEquipo,
        creadoEn: v.creadoEn.toISOString(),
        ultimoUso: v.ultimoUso?.toISOString() ?? null,
      })),
    };
  }

  /** Desvincula todas las extensiones de la persona; dejan de poder enviar al instante. */
  async revocarTodas(user: UsuarioBitacora): Promise<EstadoExtension> {
    await this.prisma.bitacoraExtensionVinculo.updateMany({
      where: { userId: user.userId, revocadoEn: null },
      data: { revocadoEn: new Date() },
    });
    await this.prisma.bitacoraExtensionCodigo.deleteMany({
      where: { userId: user.userId },
    });
    return this.estadoPersona(user);
  }

  // ───────────────────────── Lo que hace la extensión ─────────────────────────

  /** Cambia el código por un token propio de esa extensión. El código sirve una sola vez. */
  async vincular(
    codigoCrudo: unknown,
    nombreEquipoCrudo: unknown,
    ip: string,
  ): Promise<{ token: string; nombre: string }> {
    this.exigirIntentosDisponibles(ip);
    const codigo = normalizarCodigo(codigoCrudo);
    const fila = codigo
      ? await this.prisma.bitacoraExtensionCodigo.findUnique({
          where: { codigoHash: hashear(codigo) },
        })
      : null;
    if (!fila || fila.expiraEn.getTime() < Date.now()) {
      this.anotarFallo(ip);
      throw new BadRequestException(
        'El código no es válido o ya venció. Genera uno nuevo en «Mi hoja del día».',
      );
    }
    // Un código sirve una sola vez, aunque dos peticiones lleguen a la vez.
    const usado = await this.prisma.bitacoraExtensionCodigo.deleteMany({
      where: { userId: fila.userId, codigoHash: fila.codigoHash },
    });
    if (usado.count === 0) {
      this.anotarFallo(ip);
      throw new BadRequestException(
        'El código no es válido o ya venció. Genera uno nuevo en «Mi hoja del día».',
      );
    }

    const persona = await this.prisma.user.findUnique({
      where: { id: fila.userId },
      select: { id: true, fullName: true, companyId: true, isActive: true },
    });
    if (!persona?.isActive || !persona.companyId) {
      throw new BadRequestException('No se pudo vincular la extensión.');
    }
    if (!(await this.bitacora.personaActiva(persona.id, persona.companyId))) {
      throw new ForbiddenException(
        'Tu hoja del día no está activa, así que no se puede vincular la extensión.',
      );
    }

    const token = generarToken();
    const nombreEquipo =
      typeof nombreEquipoCrudo === 'string'
        ? nombreEquipoCrudo.trim().slice(0, 60) || null
        : null;
    await this.prisma.bitacoraExtensionVinculo.create({
      data: { userId: persona.id, tokenHash: hashear(token), nombreEquipo },
    });
    await this.limitarDispositivos(persona.id);
    await this.avisarVinculo(persona.id, persona.companyId, nombreEquipo);
    return { token, nombre: persona.fullName };
  }

  /** Identifica a la extensión por su token. Devuelve null si no existe, fue revocado o la persona ya no está activa. */
  async autenticar(token: string): Promise<ExtensionAutenticada | null> {
    const vinculo = await this.prisma.bitacoraExtensionVinculo.findUnique({
      where: { tokenHash: hashear(token) },
    });
    if (!vinculo || vinculo.revocadoEn) return null;
    const persona = await this.prisma.user.findUnique({
      where: { id: vinculo.userId },
      select: { id: true, fullName: true, companyId: true, isActive: true },
    });
    if (!persona?.isActive) return null;
    this.anotarUso(vinculo.id);
    return {
      vinculoId: vinculo.id,
      userId: persona.id,
      companyId: persona.companyId,
      nombre: persona.fullName,
    };
  }

  async configuracion(
    ext: ExtensionAutenticada,
  ): Promise<ConfiguracionExtension> {
    const registrando = await this.bitacora.personaActiva(
      ext.userId,
      ext.companyId,
    );
    const horario = registrando ? await this.horarioDe(ext.companyId) : null;
    return {
      registrando: registrando && !!horario,
      horario: horario ? horarioPublico(horario) : null,
      nombre: ext.nombre,
      ahora: new Date().toISOString(),
    };
  }

  /**
   * Guarda los sitios web que reporta la extensión. Aunque la extensión ya
   * filtra por horario, el servidor vuelve a comprobarlo: lo que llegue fuera
   * del horario, antes de activar la hoja, o de una hoja desactivada, se
   * descarta sin guardarse.
   */
  async recibirTramos(
    ext: ExtensionAutenticada,
    tramos: unknown,
  ): Promise<{ guardados: number; descartados: number; registrando: boolean }> {
    const total = Array.isArray(tramos) ? tramos.length : 0;
    const registrando = await this.bitacora.personaActiva(
      ext.userId,
      ext.companyId,
    );
    const horario = registrando ? await this.horarioDe(ext.companyId) : null;
    if (!registrando || !horario || !ext.companyId) {
      return { guardados: 0, descartados: total, registrando: false };
    }
    const activacion = await this.prisma.bitacoraActivacion.findUnique({
      where: { userId: ext.userId },
      select: { desde: true },
    });
    const { validos, descartados } = validarTramos(
      tramos,
      horario,
      activacion?.desde ?? null,
    );
    if (validos.length === 0) return { guardados: 0, descartados, registrando };

    try {
      const r = await this.prisma.bitacoraEvento.createMany({
        data: validos.map((t) => ({
          userId: ext.userId,
          companyId: ext.companyId,
          fuente: 'EXTENSION',
          modulo: 'web',
          accion: 'SITIO',
          nombre: t.dominio,
          minutos: t.minutos,
          externalId: externalIdDeTramo(ext.userId, t),
          ocurridoEn: t.inicio,
        })),
        skipDuplicates: true,
      });
      return { guardados: r.count, descartados, registrando };
    } catch (err) {
      this.logger.warn(
        `No se pudieron guardar los sitios web: ${(err as Error).message}`,
      );
      throw new HttpException(
        'No se pudo guardar. Se reintentará más tarde.',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
  }

  /** La propia extensión se desvincula (botón «Desvincular»). */
  async desvincular(ext: ExtensionAutenticada): Promise<void> {
    await this.prisma.bitacoraExtensionVinculo.update({
      where: { id: ext.vinculoId },
      data: { revocadoEn: new Date() },
    });
  }

  // ───────────────────────── Auxiliares ─────────────────────────

  private async limitarDispositivos(userId: number): Promise<void> {
    const activos = await this.prisma.bitacoraExtensionVinculo.findMany({
      where: { userId, revocadoEn: null },
      orderBy: { creadoEn: 'desc' },
      select: { id: true },
    });
    const sobran = activos.slice(MAX_DISPOSITIVOS).map((v) => v.id);
    if (sobran.length) {
      await this.prisma.bitacoraExtensionVinculo.updateMany({
        where: { id: { in: sobran } },
        data: { revocadoEn: new Date() },
      });
    }
  }

  private async avisarVinculo(
    userId: number,
    companyId: number,
    equipo: string | null,
  ): Promise<void> {
    try {
      await this.notificaciones.create({
        userId,
        companyId,
        title: 'Se vinculó la extensión del navegador',
        message: `${equipo ? `Equipo: ${equipo}. ` : ''}Si no fuiste tú, entra a «Mi hoja del día» y desvincúlala. Solo registra el sitio web (dominio) y el tiempo, dentro del horario.`,
        link: '/bitacora/mi-hoja',
      });
    } catch (err) {
      this.logger.warn(
        `No se pudo avisar del vínculo: ${(err as Error).message}`,
      );
    }
  }

  private anotarUso(vinculoId: number): void {
    const ahora = Date.now();
    const previo = this.ultimoUsoAnotado.get(vinculoId) ?? 0;
    if (ahora - previo < ULTIMO_USO_CADA_MS) return;
    this.ultimoUsoAnotado.set(vinculoId, ahora);
    this.prisma.bitacoraExtensionVinculo
      .update({ where: { id: vinculoId }, data: { ultimoUso: new Date() } })
      .catch((err: Error) =>
        this.logger.warn(`No se pudo anotar el último uso: ${err.message}`),
      );
  }

  /** Frena a quien prueba códigos al azar: pocos fallos por dirección y en total. */
  private exigirIntentosDisponibles(ip: string): void {
    const ahora = Date.now();
    const propio = this.intentosPorIp.get(ip);
    const total =
      this.intentosTotales.hasta > ahora ? this.intentosTotales.fallos : 0;
    if (
      (propio && propio.hasta > ahora && propio.fallos >= INTENTOS_POR_IP) ||
      total >= INTENTOS_TOTALES
    ) {
      throw new HttpException(
        'Demasiados intentos. Espera unos minutos y vuelve a probar.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  private anotarFallo(ip: string): void {
    const ahora = Date.now();
    if (this.intentosPorIp.size > 2000) {
      for (const [k, v] of this.intentosPorIp) {
        if (v.hasta < ahora) this.intentosPorIp.delete(k);
      }
    }
    const propio = this.intentosPorIp.get(ip);
    if (propio && propio.hasta > ahora) propio.fallos++;
    else
      this.intentosPorIp.set(ip, {
        fallos: 1,
        hasta: ahora + VENTANA_INTENTOS_MS,
      });
    if (this.intentosTotales.hasta > ahora) this.intentosTotales.fallos++;
    else
      this.intentosTotales = { fallos: 1, hasta: ahora + VENTANA_INTENTOS_MS };
  }
}
