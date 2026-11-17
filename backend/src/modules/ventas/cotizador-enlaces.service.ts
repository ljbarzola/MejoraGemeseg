import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { CotQuote } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import {
  CotActor,
  CotizadorCotizacionesService,
} from './cotizador-cotizaciones.service';
import {
  canEditQuote,
  ecuadorToday,
  sanitizeLines,
  toNum,
} from './cotizador.util';
import { calcularCotizacionVenta } from './cotizador-precios.util';
import {
  TIPOS_RESPUESTA,
  TipoRespuesta,
  armarPagina,
  claveValida,
  dispositivoDe,
  limpiarMensaje,
  nuevaClave,
  nuevoToken,
  segundosASumar,
  tokenValido,
  visitanteValido,
} from './cotizador-enlaces.util';

interface EnlaceFila {
  id: number;
  companyId: number;
  quoteId: number;
  token: string;
  activo: boolean;
  creadoPor: number | null;
  creadoEn: Date;
  desactivadoEn: Date | null;
  primeraVista: Date | null;
  ultimaVista: Date | null;
}

interface VisitaFila {
  id: number;
  enlaceId: number;
  clave: string;
  visitante: string;
  dispositivo: string;
  interna: boolean;
  inicio: Date;
  ultimoLatido: Date;
  segundos: number;
  descargoPdf: boolean;
}

const NO_DISPONIBLE =
  'Este enlace ya no está disponible. Pide a tu asesor uno nuevo.';
/** Respuestas («Me interesa» / «Tengo dudas») que acepta un mismo enlace por día. */
const MAX_RESPUESTAS_DIA = 10;

/**
 * Enlace de la cotización para el cliente (2026-11-17).
 *
 * El vendedor crea un enlace con un código al azar; quien lo abre ve la cotización SIN iniciar
 * sesión. La página recibe solo precios de venta calculados aquí (cotizador-precios.util.ts):
 * nunca costos, márgenes, porcentajes de ganancia ni proveedores. Se registra cuándo se abrió,
 * desde qué tipo de equipo, cuánto tiempo estuvo a la vista y si se descargó el PDF; las aperturas
 * de alguien de la propia empresa con sesión iniciada no cuentan como «vista por el cliente».
 */
@Injectable()
export class CotizadorEnlacesService {
  private readonly logger = new Logger(CotizadorEnlacesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cotizaciones: CotizadorCotizacionesService,
    private readonly notifications: NotificationsService,
  ) {}

  // ---------------------------------------------------------------------
  // Dentro de la app (vendedor)
  // ---------------------------------------------------------------------

  private async enlaceActivo(quoteId: number): Promise<EnlaceFila | null> {
    const filas = await this.prisma.$queryRaw<EnlaceFila[]>(
      Prisma.sql`SELECT * FROM "CotEnlace" WHERE "quoteId" = ${quoteId} AND "activo" = true
                 ORDER BY "id" DESC LIMIT 1`,
    );
    return filas[0] ?? null;
  }

  /** Enlace actual de la cotización y lo que hizo el cliente con él. Lo ve quien ve la cotización. */
  async seguimiento(actor: CotActor, quoteId: number) {
    const { q, access } = await this.cotizaciones.cargar(actor, quoteId);
    const enlaces = await this.prisma.$queryRaw<EnlaceFila[]>(
      Prisma.sql`SELECT * FROM "CotEnlace" WHERE "quoteId" = ${q.id} ORDER BY "id" DESC`,
    );
    const activo = enlaces.find((e) => e.activo) ?? null;
    const ids = enlaces.map((e) => e.id);
    const [visitas, respuestas] = ids.length
      ? await Promise.all([
          this.prisma.$queryRaw<VisitaFila[]>(
            Prisma.sql`SELECT * FROM "CotEnlaceVisita" WHERE "enlaceId" IN (${Prisma.join(ids)})
                       ORDER BY "inicio" DESC`,
          ),
          this.prisma.$queryRaw<
            {
              id: number;
              enlaceId: number;
              tipo: string;
              mensaje: string;
              creadoEn: Date;
            }[]
          >(
            Prisma.sql`SELECT * FROM "CotEnlaceRespuesta" WHERE "enlaceId" IN (${Prisma.join(ids)})
                       ORDER BY "creadoEn" DESC`,
          ),
        ])
      : [[], []];

    const delCliente = visitas.filter((v) => !v.interna);
    const creador = activo?.creadoPor
      ? await this.prisma.user.findUnique({
          where: { id: activo.creadoPor },
          select: { fullName: true },
        })
      : null;
    const fechas = delCliente.map((v) => v.inicio.getTime());
    return {
      puedeGestionar: canEditQuote(access),
      enlace: activo
        ? {
            token: activo.token,
            creadoEn: activo.creadoEn,
            creadoPor: creador?.fullName ?? '',
          }
        : null,
      // Si hubo un enlace antes (desactivado), sus visitas siguen contando en el resumen.
      huboEnlaces: enlaces.length,
      resumen: {
        aperturas: delCliente.length,
        personas: new Set(delCliente.map((v) => v.visitante || `v${v.id}`))
          .size,
        segundos: delCliente.reduce((s, v) => s + v.segundos, 0),
        descargas: delCliente.filter((v) => v.descargoPdf).length,
        primeraVista: fechas.length ? new Date(Math.min(...fechas)) : null,
        ultimaVista: fechas.length ? new Date(Math.max(...fechas)) : null,
        celular: delCliente.filter((v) => v.dispositivo === 'celular').length,
        computadora: delCliente.filter((v) => v.dispositivo === 'computadora')
          .length,
        tablet: delCliente.filter((v) => v.dispositivo === 'tablet').length,
        internas: visitas.length - delCliente.length,
      },
      visitas: delCliente.slice(0, 50).map((v) => ({
        inicio: v.inicio,
        segundos: v.segundos,
        dispositivo: v.dispositivo,
        descargoPdf: v.descargoPdf,
      })),
      respuestas: respuestas.slice(0, 50).map((r) => ({
        tipo: r.tipo,
        mensaje: r.mensaje,
        creadoEn: r.creadoEn,
      })),
    };
  }

  /** Crea el enlace (o devuelve el que ya está activo). Solo quien puede editar la cotización. */
  async crear(actor: CotActor, quoteId: number) {
    const { q, access } = await this.cotizaciones.cargar(actor, quoteId);
    if (!canEditQuote(access)) {
      throw new ForbiddenException(
        'Solo quien creó la cotización (o tiene su edición total) puede enviarla al cliente',
      );
    }
    // Para enviar al cliente la cotización tiene que estar unida a una oportunidad (2026-11-17).
    const unida = await this.prisma.$queryRaw<{ n: number }[]>(
      Prisma.sql`SELECT COUNT(*)::int AS n FROM "CotQuoteOportunidad" WHERE "quoteId" = ${q.id}`,
    );
    if ((unida[0]?.n ?? 0) === 0) {
      throw new BadRequestException(
        'Antes de enviarla, elige a qué oportunidad pertenece esta cotización (campo «Oportunidad»).',
      );
    }
    const existente = await this.enlaceActivo(q.id);
    if (!existente) {
      await this.prisma.$executeRaw(
        Prisma.sql`INSERT INTO "CotEnlace" ("companyId", "quoteId", "token", "creadoPor")
                   VALUES (${q.companyId}, ${q.id}, ${nuevoToken()}, ${actor.userId})`,
      );
    }
    // «Borrador» pasa a «Enviada»; cualquier otro estado (vista, aceptada...) se respeta.
    if (q.status === 'borrador') {
      await this.prisma.cotQuote.update({
        where: { id: q.id },
        // Cambiar el estado no es modificar la cotización: la página no debe decir «Actualizada»
        data: { status: 'enviada', updatedAt: q.updatedAt },
      });
    }
    return this.seguimiento(actor, quoteId);
  }

  /** Apaga el enlace: quien lo abra verá «ya no está disponible». Su historial se conserva. */
  async desactivar(actor: CotActor, quoteId: number) {
    const { q, access } = await this.cotizaciones.cargar(actor, quoteId);
    if (!canEditQuote(access)) {
      throw new ForbiddenException(
        'Solo quien creó la cotización (o tiene su edición total) puede desactivar el enlace',
      );
    }
    await this.prisma.$executeRaw(
      Prisma.sql`UPDATE "CotEnlace" SET "activo" = false, "desactivadoEn" = NOW()
                 WHERE "quoteId" = ${q.id} AND "activo" = true`,
    );
    return this.seguimiento(actor, quoteId);
  }

  // ---------------------------------------------------------------------
  // Página pública (sin sesión)
  // ---------------------------------------------------------------------

  /** Enlace activo con ese código, o 404. Nunca dice si el código existió. */
  private async porToken(
    token: unknown,
  ): Promise<{ enlace: EnlaceFila; q: CotQuote }> {
    if (!tokenValido(token)) throw new NotFoundException(NO_DISPONIBLE);
    const filas = await this.prisma.$queryRaw<EnlaceFila[]>(
      Prisma.sql`SELECT * FROM "CotEnlace" WHERE "token" = ${token} AND "activo" = true LIMIT 1`,
    );
    const enlace = filas[0];
    if (!enlace) throw new NotFoundException(NO_DISPONIBLE);
    const q = await this.prisma.cotQuote.findFirst({
      where: { id: enlace.quoteId, companyId: enlace.companyId },
    });
    if (!q) throw new NotFoundException(NO_DISPONIBLE);
    return { enlace, q };
  }

  /** Lo que muestra la página: solo datos de venta (ver armarPagina, lista blanca). */
  async pagina(token: unknown) {
    const { enlace, q } = await this.porToken(token);
    const [empresa, asesor, productos] = await Promise.all([
      this.prisma.company.findUnique({
        where: { id: enlace.companyId },
        select: {
          name: true,
          logoUrl: true,
          primaryColor: true,
          accentColor: true,
        },
      }),
      this.prisma.user.findUnique({
        where: { id: q.ownerId },
        select: { fullName: true, position: true, phone: true },
      }),
      this.prisma.cotProduct.findMany({
        where: { companyId: enlace.companyId },
      }),
    ]);
    // Las líneas pasan por la misma limpieza que al guardar; si algo viejo no cuadra, no se cae la página.
    let items: ReturnType<typeof sanitizeLines> = [];
    try {
      items = sanitizeLines(q.items);
    } catch (e) {
      this.logger.warn(
        `Cotización ${q.id}: líneas no válidas para el enlace (${(e as Error).message})`,
      );
    }
    const cotizacion = calcularCotizacionVenta({
      items,
      catalogo: new Map(productos.map((p) => [p.code, p])),
      supplierMargins: (q.supplierMargins ?? {}) as Record<string, number>,
      installMargin: toNum(q.installMargin),
      discountType: q.discountType,
      discountValue: toNum(q.discountValue),
    });
    return armarPagina({
      empresa: {
        name: empresa?.name ?? '',
        logoUrl: empresa?.logoUrl ?? null,
        primaryColor: empresa?.primaryColor ?? null,
        accentColor: empresa?.accentColor ?? null,
      },
      quote: {
        quoteNumber: q.quoteNumber,
        quoteDate: q.quoteDate,
        updatedAt: q.updatedAt,
        client: q.client,
        discountType: q.discountType,
        discountValue: toNum(q.discountValue),
        conditions: q.conditions,
        notes: q.notes,
        vendorName: q.vendorName,
      },
      enlaceCreadoEn: enlace.creadoEn,
      asesor,
      cotizacion,
      hoyISO: ecuadorToday(),
    });
  }

  /**
   * Empieza una visita. `empresaDelVisor` = empresa de quien tiene sesión iniciada en este navegador
   * (null si no tiene): si es la misma de la cotización, la visita es interna y no cuenta.
   */
  async abrir(
    token: unknown,
    visitante: unknown,
    userAgent: string | undefined,
    empresaDelVisor: number | null,
  ) {
    const { enlace, q } = await this.porToken(token);
    const interna =
      empresaDelVisor !== null && empresaDelVisor === enlace.companyId;
    const clave = nuevaClave();
    const filas = await this.prisma.$queryRaw<{ id: number }[]>(
      Prisma.sql`INSERT INTO "CotEnlaceVisita" ("enlaceId", "clave", "visitante", "dispositivo", "interna")
                 VALUES (${enlace.id}, ${clave}, ${visitanteValido(visitante)}, ${dispositivoDe(userAgent)}, ${interna})
                 RETURNING "id"`,
    );
    if (!interna) {
      // Solo UNA apertura gana la «primera vista» aunque lleguen dos a la vez (un solo aviso).
      const primera = await this.prisma.$queryRaw<{ id: number }[]>(
        Prisma.sql`UPDATE "CotEnlace" SET "primeraVista" = NOW()
                   WHERE "id" = ${enlace.id} AND "primeraVista" IS NULL RETURNING "id"`,
      );
      await this.prisma.$executeRaw(
        Prisma.sql`UPDATE "CotEnlace" SET "ultimaVista" = NOW() WHERE "id" = ${enlace.id}`,
      );
      if (primera.length > 0) await this.primeraVistaDelCliente(q);
    }
    return { visita: filas[0].id, clave, interna };
  }

  /** La primera vez que el cliente abre: «Vista» y aviso al vendedor. */
  private async primeraVistaDelCliente(q: CotQuote) {
    if (q.status === 'borrador' || q.status === 'enviada') {
      await this.prisma.cotQuote.update({
        where: { id: q.id },
        // updatedAt NO se toca: no es una modificación de la cotización (si no, la página diría «Actualizada»)
        data: { status: 'vista', updatedAt: q.updatedAt },
      });
    }
    const cliente = ((q.client ?? {}) as Record<string, unknown>).name;
    await this.avisar(
      q,
      'Tu cotización fue vista',
      `${typeof cliente === 'string' && cliente ? cliente : 'El cliente'} abrió la cotización ${q.quoteNumber}.`,
    );
  }

  /**
   * La página sigue a la vista (cada 15 s) y, si `descarga`, el cliente descargó o imprimió el PDF.
   * `reanudar`: la página vuelve a estar a la vista después de estar oculta; el rato oculto no se suma.
   */
  async latido(
    token: unknown,
    visitaId: number,
    clave: unknown,
    descarga: boolean,
    reanudar = false,
  ) {
    const { enlace } = await this.porToken(token);
    if (!claveValida(clave)) throw new NotFoundException(NO_DISPONIBLE);
    const filas = await this.prisma.$queryRaw<VisitaFila[]>(
      Prisma.sql`SELECT * FROM "CotEnlaceVisita" WHERE "id" = ${visitaId} AND "enlaceId" = ${enlace.id}
                 AND "clave" = ${clave} LIMIT 1`,
    );
    const v = filas[0];
    if (!v) throw new NotFoundException(NO_DISPONIBLE);
    const ahora = new Date();
    const suma = reanudar
      ? 0
      : segundosASumar(v.ultimoLatido, ahora, v.segundos);
    await this.prisma.$executeRaw(
      Prisma.sql`UPDATE "CotEnlaceVisita" SET "segundos" = "segundos" + ${suma}, "ultimoLatido" = ${ahora},
                 "descargoPdf" = "descargoPdf" OR ${descarga} WHERE "id" = ${v.id}`,
    );
    return { ok: true };
  }

  /** «Me interesa» / «Tengo dudas»: queda en la cotización y avisa al vendedor. */
  async responder(
    token: unknown,
    tipo: unknown,
    mensaje: unknown,
    empresaDelVisor: number | null,
  ) {
    const { enlace, q } = await this.porToken(token);
    if (!TIPOS_RESPUESTA.includes(tipo as TipoRespuesta)) {
      throw new NotFoundException(NO_DISPONIBLE);
    }
    // Alguien de la empresa probando la página: se le contesta bien pero no se guarda ni se avisa.
    if (empresaDelVisor !== null && empresaDelVisor === enlace.companyId) {
      return { ok: true, prueba: true };
    }
    const hoy = await this.prisma.$queryRaw<{ n: number }[]>(
      Prisma.sql`SELECT COUNT(*)::int AS n FROM "CotEnlaceRespuesta"
                 WHERE "enlaceId" = ${enlace.id} AND "creadoEn" > NOW() - INTERVAL '1 day'`,
    );
    if ((hoy[0]?.n ?? 0) >= MAX_RESPUESTAS_DIA) {
      throw new HttpException(
        'Ya recibimos tus mensajes. Tu asesor te contactará pronto.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    const texto = limpiarMensaje(mensaje);
    await this.prisma.$executeRaw(
      Prisma.sql`INSERT INTO "CotEnlaceRespuesta" ("enlaceId", "tipo", "mensaje")
                 VALUES (${enlace.id}, ${tipo as string}, ${texto})`,
    );
    const cliente = ((q.client ?? {}) as Record<string, unknown>).name;
    const quien =
      typeof cliente === 'string' && cliente ? cliente : 'El cliente';
    await this.avisar(
      q,
      tipo === 'interesa'
        ? 'Un cliente está interesado'
        : 'Un cliente tiene dudas',
      tipo === 'interesa'
        ? `${quien} marcó «Me interesa» en la cotización ${q.quoteNumber}.${texto ? ` Escribió: «${texto.slice(0, 160)}»` : ''}`
        : `${quien} tiene dudas sobre la cotización ${q.quoteNumber}.${texto ? ` Escribió: «${texto.slice(0, 160)}»` : ''}`,
    );
    return { ok: true, prueba: false };
  }

  /** Notificación en la app al dueño de la cotización. Si falla, la página del cliente no se entera. */
  private async avisar(q: CotQuote, title: string, message: string) {
    try {
      await this.notifications.create({
        userId: q.ownerId,
        companyId: q.companyId,
        title,
        message,
        link: `/ventas/cotizador?cotizacion=${q.id}&seguimiento=1`,
      });
    } catch (e) {
      this.logger.error(
        `No se pudo avisar de la cotización ${q.id}: ${(e as Error).message}`,
      );
    }
  }
}
