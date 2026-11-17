import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { asegurarContabilidad } from './contabilidad.schema';
import {
  PERSONAS_POR_VIAJE,
  TIPOS_CUSTODIA,
  esDiaValido,
  esTipoValido,
  tarifaVigente,
  tarifasDeHoy,
  type TarifaFila,
} from './tarifas.util';
import {
  diaEcuador,
  diasDelMes,
  dondeFechaViaje,
  esMesValido,
  etiquetaMes,
  fechaDeViaje,
  mesActualEcuador,
  mesDeViaje,
  rangoDiasEcuador,
  ultimosMeses,
} from '../../common/utils/viaje-fechas.util';

const TIPO_LABELS: Record<string, string> = {
  HACIENDA: 'Hacienda',
  PUERTO: 'Puerto',
  VIP: 'VIP',
};

export interface CrearTarifaDto {
  tipo: string;
  valorPorPersona: number;
  vigenteDesde: string;
}

export interface AjusteDto {
  /** EXTRA suma a lo que se le paga a la persona; DESCUENTO resta. */
  tipo: string;
  persona: string;
  cedula?: string;
  /** Día del ajuste. Si va ligado a un viaje se toma el día de ese viaje. */
  fecha?: string;
  /** Siempre positivo: el signo lo da el tipo. */
  monto: number;
  concepto: string;
  /** Viaje al que aplica (opcional). */
  custodiaId?: number | null;
}

export interface RegistrarPagosDto {
  /** Pagos que se registran como pagados: un viaje y el rol de la persona en él. */
  items: { custodiaId: number; rol: string }[];
  /** Día en que se pagó (no puede ser futuro). Por defecto, hoy. */
  fecha?: string;
  referencia?: string;
}

interface PagoRegistrado {
  id: number;
  custodiaId: number;
  rol: string;
  monto: number;
  ajuste: number;
  total: number;
  pagadoEn: string;
  referencia: string | null;
}

const ROLES_VIAJE = ['Chofer', 'Custodio 1', 'Custodio 2'];

interface AjusteFila {
  id: number;
  tipo: string;
  cedula: string;
  persona: string;
  fecha: string;
  monto: number;
  concepto: string;
  custodiaId: number | null;
  numeroGuia: string | null;
}

const redondear = (n: number) => Math.round(n * 100) / 100;
/** Lo que el ajuste suma (+) o resta (−) a la persona. */
const firmado = (a: { tipo: string; monto: number }) => (a.tipo === 'DESCUENTO' ? -a.monto : a.monto);
/** Una persona se reconoce por su cédula; si no la tiene, por su nombre. */
const clavePersona = (cedula: string | null | undefined, nombre: string | null | undefined) =>
  (cedula ?? '').trim() || (nombre ?? '').trim().toLowerCase();

/**
 * Contabilidad (2026-11-16): el dinero de las custodias. Antes vivía mezclado en el módulo
 * Custodias (tarifas escritas en el código, nómina, ganancias por persona). Custodias ahora solo
 * registra el viaje; aquí se le pone precio.
 *
 * Cada viaje se paga con la tarifa vigente el día del viaje (ver tarifas.util.ts). Si un tipo no
 * tiene tarifa definida, el viaje se cuenta pero con monto 0 y se avisa (no se inventa un valor).
 */
@Injectable()
export class ContabilidadService implements OnModuleInit {
  private readonly logger = new Logger(ContabilidadService.name);

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    try {
      const sembrada = await asegurarContabilidad(this.prisma as any);
      if (sembrada) {
        this.logger.log('Tarifas de custodia sembradas para las empresas que ya tenían viajes.');
      }
    } catch (err) {
      this.logger.warn(
        `No se pudieron asegurar las tablas de Contabilidad: ${(err as Error).message}`,
      );
    }
  }

  // ───────────────────────────── Tarifas ─────────────────────────────

  private async cargarTarifas(companyId: number): Promise<TarifaFila[]> {
    return this.prisma.$queryRaw<TarifaFila[]>`
      SELECT "tipo", "valorPorPersona"::float8 AS "valorPorPersona", "vigenteDesde"::text AS "vigenteDesde"
      FROM "ContabTarifaCustodia"
      WHERE "companyId" = ${companyId}`;
  }

  async getTarifas(companyId: number) {
    const hoy = diaEcuador(new Date());
    const historial = await this.prisma.$queryRaw<
      { id: number; tipo: string; valorPorPersona: number; vigenteDesde: string; creadaEn: Date }[]
    >`
      SELECT "id", "tipo", "valorPorPersona"::float8 AS "valorPorPersona",
             "vigenteDesde"::text AS "vigenteDesde", "creadaEn"
      FROM "ContabTarifaCustodia"
      WHERE "companyId" = ${companyId}
      ORDER BY "vigenteDesde" DESC, "tipo" ASC`;
    const filas: TarifaFila[] = historial;
    return {
      hoy,
      personasPorViaje: PERSONAS_POR_VIAJE,
      vigentes: tarifasDeHoy(filas, hoy),
      // Toda tarifa se puede corregir o quitar (2026-11-16): lo ya registrado como pagado no cambia porque guarda su
      // monto; lo pendiente se recalcula. `rige` avisa a la pantalla si la tarifa ya está en uso.
      historial: historial.map((t) => ({ ...t, rige: t.vigenteDesde <= hoy })),
    };
  }

  async crearTarifa(companyId: number, userId: number, dto: CrearTarifaDto) {
    if (!esTipoValido(dto?.tipo)) {
      throw new BadRequestException('El tipo debe ser HACIENDA, PUERTO o VIP.');
    }
    const valor = Number(dto.valorPorPersona);
    if (!Number.isFinite(valor) || valor <= 0 || valor > 100000) {
      throw new BadRequestException('La tarifa debe ser un valor mayor a 0.');
    }
    if (!esDiaValido(dto.vigenteDesde)) {
      throw new BadRequestException('Indica desde qué día rige la tarifa.');
    }
    const valorRedondeado = Math.round(valor * 100) / 100;
    await this.prisma.$executeRaw`
      INSERT INTO "ContabTarifaCustodia" ("companyId", "tipo", "valorPorPersona", "vigenteDesde", "creadaPorId")
      VALUES (${companyId}, ${dto.tipo}, ${valorRedondeado}, ${dto.vigenteDesde}::date, ${userId})
      ON CONFLICT ("companyId", "tipo", "vigenteDesde")
      DO UPDATE SET "valorPorPersona" = EXCLUDED."valorPorPersona", "creadaPorId" = EXCLUDED."creadaPorId"`;
    return this.getTarifas(companyId);
  }

  async eliminarTarifa(companyId: number, id: number) {
    const borradas = await this.prisma.$executeRaw`
      DELETE FROM "ContabTarifaCustodia" WHERE "id" = ${id} AND "companyId" = ${companyId}`;
    if (!borradas) throw new NotFoundException('Tarifa no encontrada.');
    return this.getTarifas(companyId);
  }

  /**
   * Corrige el valor y/o el día de inicio de una tarifa, rija ya o no (2026-11-16: «que se pueda editar siempre»).
   * Los pagos YA REGISTRADOS conservan su monto; los pendientes de esos viajes se recalculan con el valor nuevo.
   */
  async actualizarTarifa(companyId: number, id: number, dto: Partial<CrearTarifaDto>) {
    const filas = await this.prisma.$queryRaw<{ tipo: string; vigenteDesde: string }[]>`
      SELECT "tipo", "vigenteDesde"::text AS "vigenteDesde" FROM "ContabTarifaCustodia"
      WHERE "id" = ${id} AND "companyId" = ${companyId}`;
    if (filas.length === 0) throw new NotFoundException('Tarifa no encontrada.');
    const actual = filas[0];
    const valor = Number(dto?.valorPorPersona);
    if (!Number.isFinite(valor) || valor <= 0 || valor > 100000) {
      throw new BadRequestException('La tarifa debe ser un valor mayor a 0.');
    }
    const desde = dto?.vigenteDesde ?? actual.vigenteDesde;
    if (!esDiaValido(desde)) throw new BadRequestException('Indica desde qué día rige la tarifa.');
    const repetida = await this.prisma.$queryRaw<{ id: number }[]>`
      SELECT "id" FROM "ContabTarifaCustodia"
      WHERE "companyId" = ${companyId} AND "tipo" = ${actual.tipo}
        AND "vigenteDesde" = ${desde}::date AND "id" <> ${id}`;
    if (repetida.length > 0) {
      throw new BadRequestException('Ya hay una tarifa de ese tipo que rige desde ese día.');
    }
    await this.prisma.$executeRaw`
      UPDATE "ContabTarifaCustodia"
      SET "valorPorPersona" = ${redondear(valor)}, "vigenteDesde" = ${desde}::date
      WHERE "id" = ${id} AND "companyId" = ${companyId}`;
    return this.getTarifas(companyId);
  }

  // ───────────────────────────── Ajustes (extras y descuentos) ─────────────────────────────

  /** Ajustes de la empresa, opcionalmente solo los de un rango de días. Se ignoran filas con un tipo que no es EXTRA/DESCUENTO. */
  private async cargarAjustes(companyId: number, desde?: string, hasta?: string): Promise<AjusteFila[]> {
    const filas = await this.prisma.$queryRaw<AjusteFila[]>`
      SELECT "id", "tipo", "cedula", "persona", "fecha"::text AS "fecha", "monto"::float8 AS "monto",
             "concepto", "custodiaId", "numeroGuia"
      FROM "ContabAjusteCustodia"
      WHERE "companyId" = ${companyId}
        AND (${desde ?? null}::date IS NULL OR "fecha" >= ${desde ?? null}::date)
        AND (${hasta ?? null}::date IS NULL OR "fecha" <= ${hasta ?? null}::date)
      ORDER BY "fecha" DESC, "id" DESC`;
    return (filas ?? []).filter((a) => a.tipo === 'EXTRA' || a.tipo === 'DESCUENTO');
  }

  async getAjustes(companyId: number) {
    const ajustes = await this.cargarAjustes(companyId);
    return { ajustes: ajustes.map((a) => ({ ...a, firmado: firmado(a) })) };
  }

  /** ¿La persona ya cobró por este viaje (pago registrado)? Un ajuste ligado a ese pago no se puede crear, cambiar ni quitar. */
  private async pagoRegistrado(companyId: number, custodiaId: number | null, cedula: string, persona: string): Promise<boolean> {
    if (!custodiaId) return false;
    const filas = await this.prisma.$queryRaw<{ id: number }[]>`
      SELECT "id" FROM "ContabPagoCustodia"
      WHERE "companyId" = ${companyId} AND "custodiaId" = ${custodiaId} AND "clave" = ${clavePersona(cedula, persona)}`;
    return (filas ?? []).length > 0;
  }

  /** Valida y normaliza un ajuste (el mismo trato al crearlo y al editarlo). */
  private async validarAjuste(companyId: number, dto: AjusteDto) {
    if (dto?.tipo !== 'EXTRA' && dto?.tipo !== 'DESCUENTO') {
      throw new BadRequestException('El ajuste debe ser un extra o un descuento.');
    }
    const persona = (dto.persona ?? '').trim();
    if (!persona) throw new BadRequestException('Elige a quién se le aplica el ajuste.');
    const monto = Number(dto.monto);
    if (!Number.isFinite(monto) || monto <= 0 || monto > 100000) {
      throw new BadRequestException('El monto debe ser un valor mayor a 0.');
    }
    const concepto = (dto.concepto ?? '').trim();
    if (!concepto) throw new BadRequestException('Escribe el motivo del ajuste.');
    if (concepto.length > 200) throw new BadRequestException('El motivo es muy largo (máximo 200 letras).');
    const cedula = (dto.cedula ?? '').trim();

    let fecha = dto.fecha;
    let custodiaId: number | null = null;
    let numeroGuia: string | null = null;
    if (dto.custodiaId) {
      const viaje = await this.prisma.custodia.findFirst({ where: { id: Number(dto.custodiaId), companyId } });
      if (!viaje) throw new BadRequestException('El viaje elegido no existe.');
      const participa = [
        [viaje.choferName, viaje.choferCedula],
        [viaje.custodio1Name, viaje.custodio1Cedula],
        [viaje.custodio2Name, viaje.custodio2Cedula],
      ].some(([n, c]) => clavePersona(c, n) === clavePersona(cedula, persona));
      if (!participa) throw new BadRequestException('Esa persona no participó en el viaje elegido.');
      custodiaId = viaje.id;
      numeroGuia = viaje.numeroGuia;
      fecha = this.diaDelViaje(viaje); // un ajuste de un viaje cuenta en el día de ese viaje
    }
    if (!esDiaValido(fecha)) throw new BadRequestException('Indica la fecha del ajuste.');
    if (await this.pagoRegistrado(companyId, custodiaId, cedula, persona)) {
      throw new BadRequestException(
        'Ese pago ya está registrado como pagado. Deshaz el pago en «Pagos» para cambiar sus extras o descuentos.',
      );
    }
    return { tipo: dto.tipo, persona, cedula, monto: redondear(monto), concepto, fecha, custodiaId, numeroGuia };
  }

  async crearAjuste(companyId: number, userId: number, dto: AjusteDto) {
    const a = await this.validarAjuste(companyId, dto);
    await this.prisma.$executeRaw`
      INSERT INTO "ContabAjusteCustodia"
        ("companyId", "tipo", "cedula", "persona", "fecha", "monto", "concepto", "custodiaId", "numeroGuia", "creadoPorId")
      VALUES (${companyId}, ${a.tipo}, ${a.cedula}, ${a.persona}, ${a.fecha}::date, ${a.monto}, ${a.concepto},
              ${a.custodiaId}, ${a.numeroGuia}, ${userId})`;
    return this.getAjustes(companyId);
  }

  async actualizarAjuste(companyId: number, id: number, dto: AjusteDto) {
    const existe = await this.prisma.$queryRaw<{ id: number; custodiaId: number | null; cedula: string; persona: string }[]>`
      SELECT "id", "custodiaId", "cedula", "persona" FROM "ContabAjusteCustodia" WHERE "id" = ${id} AND "companyId" = ${companyId}`;
    if (existe.length === 0) throw new NotFoundException('Ajuste no encontrado.');
    // También el ajuste de antes: si estaba ligado a un pago ya registrado, no se mueve.
    if (await this.pagoRegistrado(companyId, existe[0].custodiaId ?? null, existe[0].cedula ?? '', existe[0].persona ?? '')) {
      throw new BadRequestException(
        'Ese pago ya está registrado como pagado. Deshaz el pago en «Pagos» para cambiar sus extras o descuentos.',
      );
    }
    const a = await this.validarAjuste(companyId, dto);
    await this.prisma.$executeRaw`
      UPDATE "ContabAjusteCustodia"
      SET "tipo" = ${a.tipo}, "cedula" = ${a.cedula}, "persona" = ${a.persona}, "fecha" = ${a.fecha}::date,
          "monto" = ${a.monto}, "concepto" = ${a.concepto}, "custodiaId" = ${a.custodiaId}, "numeroGuia" = ${a.numeroGuia}
      WHERE "id" = ${id} AND "companyId" = ${companyId}`;
    return this.getAjustes(companyId);
  }

  async eliminarAjuste(companyId: number, id: number) {
    const previo = await this.prisma.$queryRaw<{ custodiaId: number | null; cedula: string; persona: string }[]>`
      SELECT "custodiaId", "cedula", "persona" FROM "ContabAjusteCustodia" WHERE "id" = ${id} AND "companyId" = ${companyId}`;
    if ((previo ?? []).length > 0 && (await this.pagoRegistrado(companyId, previo[0].custodiaId ?? null, previo[0].cedula ?? '', previo[0].persona ?? ''))) {
      throw new BadRequestException(
        'Ese pago ya está registrado como pagado. Deshaz el pago en «Pagos» para cambiar sus extras o descuentos.',
      );
    }
    const borradas = await this.prisma.$executeRaw`
      DELETE FROM "ContabAjusteCustodia" WHERE "id" = ${id} AND "companyId" = ${companyId}`;
    if (!borradas) throw new NotFoundException('Ajuste no encontrado.');
    return this.getAjustes(companyId);
  }

  // ───────────────────────────── Viajes y pagos ─────────────────────────────

  private diaDelViaje(c: { fechaHoraSalida: Date | null; createdAt: Date }): string {
    return diaEcuador(fechaDeViaje(c));
  }

  /** Viajes que llegaron a su destino (los únicos que se pagan), con su fecha de viaje entre los días dados. */
  private viajesLlego(companyId: number, desde?: string, hasta?: string) {
    return this.prisma.custodia.findMany({
      where: {
        companyId,
        estado: 'LLEGO',
        ...dondeFechaViaje(rangoDiasEcuador(desde, hasta)),
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /** Pagos ya registrados como pagados, por viaje y rol (con el monto congelado al registrarlos). */
  private async cargarPagados(companyId: number): Promise<Map<string, PagoRegistrado>> {
    const filas = await this.prisma.$queryRaw<PagoRegistrado[]>`
      SELECT "id", "custodiaId", "rol", "monto"::float8 AS "monto", "ajuste"::float8 AS "ajuste",
             "total"::float8 AS "total", "pagadoEn"::text AS "pagadoEn", "referencia"
      FROM "ContabPagoCustodia"
      WHERE "companyId" = ${companyId}`;
    const m = new Map<string, PagoRegistrado>();
    for (const f of filas ?? []) {
      if (f && f.custodiaId !== undefined && f.rol) m.set(`${f.custodiaId}|${f.rol}`, f);
    }
    return m;
  }

  /**
   * Las tres personas que cobran en un viaje, con lo que cobra cada una (null = el tipo no tiene tarifa ese día).
   * Si el pago ya se registró como pagado, se usa el monto que se congeló en ese momento.
   */
  private pagosDeViaje(c: any, tarifas: TarifaFila[], pagados?: Map<string, PagoRegistrado>) {
    const tarifa = tarifaVigente(tarifas, c.tipoCustodia, this.diaDelViaje(c));
    return [
      { nombre: c.choferName, cedula: c.choferCedula, rol: 'Chofer' },
      { nombre: c.custodio1Name, cedula: c.custodio1Cedula, rol: 'Custodio 1' },
      { nombre: c.custodio2Name, cedula: c.custodio2Cedula, rol: 'Custodio 2' },
    ].map((p) => {
      const congelado = pagados?.get(`${c.id}|${p.rol}`);
      return {
        ...p,
        nombre: (p.nombre ?? '').trim(),
        cedula: (p.cedula ?? '').trim(),
        tarifa: congelado ? congelado.monto : tarifa,
      };
    });
  }

  /**
   * El listado de Contabilidad (2026-11-16): UNA FILA POR PAGO, o sea por persona y viaje, de todos los viajes
   * que llegaron. Se entrega completo y la pantalla filtra por columna (fecha, persona, tipo…), como el resto
   * de las listas de la app; no hay que buscar por fechas.
   */
  async getPagos(companyId: number) {
    const [tarifas, viajes, ajustes, pagados] = await Promise.all([
      this.cargarTarifas(companyId),
      this.viajesLlego(companyId),
      this.cargarAjustes(companyId),
      this.cargarPagados(companyId),
    ]);
    // Los ajustes ligados a un viaje se muestran en la fila de esa persona en ese viaje (una sola vez, aunque la
    // persona aparezca en dos roles del mismo viaje). Los sueltos solo cuentan en el rol de pago y en el dashboard.
    const ajusteDe = new Map<string, number>();
    for (const a of ajustes) {
      if (!a.custodiaId) continue;
      const k = `${a.custodiaId}|${clavePersona(a.cedula, a.persona)}`;
      ajusteDe.set(k, redondear((ajusteDe.get(k) ?? 0) + firmado(a)));
    }
    // Desde qué día existe tarifa para cada tipo (para explicar por qué un viaje quedó «sin tarifa»: o no hay ninguna
    // o la primera empieza después del viaje).
    const primeraTarifa = new Map<string, string>();
    for (const t of tarifas) {
      const previa = primeraTarifa.get(t.tipo);
      if (!previa || t.vigenteDesde < previa) primeraTarifa.set(t.tipo, t.vigenteDesde);
    }
    const pagos = viajes
      .map((c) =>
        this.pagosDeViaje(c, tarifas, pagados).map((p) => {
          const k = `${c.id}|${clavePersona(p.cedula, p.nombre)}`;
          const congelado = pagados.get(`${c.id}|${p.rol}`);
          // Un pago registrado muestra lo que se pagó (monto, ajuste y total congelados), no lo que hoy daría el cálculo.
          const ajuste = congelado ? congelado.ajuste : (ajusteDe.get(k) ?? 0);
          ajusteDe.delete(k);
          const monto = p.tarifa ?? 0;
          return {
            id: `${c.id}-${p.rol}`,
            custodiaId: c.id,
            fecha: fechaDeViaje(c),
            numeroGuia: c.numeroGuia,
            tipo: c.tipoCustodia,
            rol: p.rol,
            persona: p.nombre,
            cedula: p.cedula,
            cliente: c.cliente,
            placa: c.placa,
            monto,
            ajuste,
            total: congelado ? congelado.total : redondear(monto + ajuste),
            sinTarifa: p.tarifa === null,
            diaViaje: this.diaDelViaje(c),
            tarifaDesde: p.tarifa === null ? (primeraTarifa.get(c.tipoCustodia) ?? null) : null,
            pagado: !!congelado,
            pagoId: congelado?.id ?? null,
            pagadoEn: congelado?.pagadoEn ?? null,
            referencia: congelado?.referencia ?? null,
          };
        }),
      )
      .flat()
      .sort((a, b) => b.fecha.getTime() - a.fecha.getTime());
    return {
      pagos,
      tarifasHoy: tarifasDeHoy(tarifas, diaEcuador(new Date())),
    };
  }

  // ───────────────────────────── Registro de pagos (pagado / deshacer) ─────────────────────────────

  /**
   * Registra como PAGADOS los pagos indicados (viaje + rol). Se congela lo que valía cada uno en ese momento
   * (tarifa, ajuste del viaje y total). Un pago ya registrado se salta; uno sin tarifa no se puede registrar
   * (no hay nada que pagar hasta definirla). Devuelve cuántos se registraron.
   */
  async registrarPagos(companyId: number, userId: number, dto: RegistrarPagosDto) {
    const items = Array.isArray(dto?.items) ? dto.items : [];
    if (items.length === 0) throw new BadRequestException('Elige al menos un pago para registrar.');
    if (items.length > 500) throw new BadRequestException('Son demasiados pagos a la vez (máximo 500). Filtra y registra por partes.');
    const hoy = diaEcuador(new Date());
    const fecha = dto.fecha ?? hoy;
    if (!esDiaValido(fecha)) throw new BadRequestException('Indica el día en que se pagó.');
    if (fecha > hoy) throw new BadRequestException('El día del pago no puede ser futuro.');
    const referencia = (dto.referencia ?? '').trim().slice(0, 120) || null;

    const { pagos } = await this.getPagos(companyId);
    const porClave = new Map(pagos.map((p) => [`${p.custodiaId}|${p.rol}`, p]));
    let registrados = 0;
    let yaPagados = 0;
    for (const it of items) {
      const p = porClave.get(`${Number(it?.custodiaId)}|${it?.rol}`);
      if (!p || !ROLES_VIAJE.includes(it.rol)) {
        throw new BadRequestException('Uno de los pagos elegidos ya no existe. Recarga la lista.');
      }
      if (p.pagado) { yaPagados++; continue; }
      if (p.sinTarifa) {
        throw new BadRequestException(`El viaje ${p.numeroGuia} no tiene tarifa definida: defínela antes de registrar su pago.`);
      }
      const clave = clavePersona(p.cedula, p.persona);
      await this.prisma.$executeRaw`
        INSERT INTO "ContabPagoCustodia"
          ("companyId", "custodiaId", "rol", "clave", "persona", "cedula", "monto", "ajuste", "total", "pagadoEn", "referencia", "creadoPorId")
        VALUES (${companyId}, ${p.custodiaId}, ${p.rol}, ${clave}, ${p.persona}, ${p.cedula}, ${p.monto}, ${p.ajuste},
                ${p.total}, ${fecha}::date, ${referencia}, ${userId})
        ON CONFLICT ("custodiaId", "rol") DO NOTHING`;
      registrados++;
    }
    return { registrados, yaPagados };
  }

  /** Corrige el día y la referencia de un pago registrado (el monto no cambia: para eso se deshace el pago). */
  async editarPagoRegistrado(companyId: number, id: number, dto: { fecha?: string; referencia?: string }) {
    const hoy = diaEcuador(new Date());
    if (!esDiaValido(dto?.fecha)) throw new BadRequestException('Indica el día en que se pagó.');
    if (dto.fecha > hoy) throw new BadRequestException('El día del pago no puede ser futuro.');
    const referencia = (dto.referencia ?? '').trim().slice(0, 120) || null;
    const n = await this.prisma.$executeRaw`
      UPDATE "ContabPagoCustodia" SET "pagadoEn" = ${dto.fecha}::date, "referencia" = ${referencia}
      WHERE "id" = ${id} AND "companyId" = ${companyId}`;
    if (!n) throw new NotFoundException('Pago no encontrado.');
    return { ok: true };
  }

  /** Deshace pagos registrados: vuelven a «Pendiente» y a calcularse con la tarifa de hoy. */
  async deshacerPagos(companyId: number, ids: number[]) {
    const lista = (Array.isArray(ids) ? ids : []).map(Number).filter((n) => Number.isInteger(n) && n > 0);
    if (lista.length === 0) throw new BadRequestException('Elige al menos un pago para deshacer.');
    const n = await this.prisma.$executeRaw`
      DELETE FROM "ContabPagoCustodia" WHERE "companyId" = ${companyId} AND "id" = ANY(${lista}::int[])`;
    if (!n) throw new NotFoundException('Pago no encontrado.');
    return { deshechos: n };
  }

  // ───────────────────────────── Nómina (matriz y roles de pago en PDF y Excel) ─────────────────────────────

  async getNomina(companyId: number, fechaInicio: string, fechaFin: string) {
    if (!esDiaValido(fechaInicio) || !esDiaValido(fechaFin)) {
      throw new BadRequestException('Indica el período (fecha de inicio y de fin).');
    }
    const [tarifas, pagables, ajustes, pagados] = await Promise.all([
      this.cargarTarifas(companyId),
      this.viajesLlego(companyId, fechaInicio, fechaFin),
      this.cargarAjustes(companyId, fechaInicio, fechaFin),
      this.cargarPagados(companyId),
    ]);

    const tarifaDe = (c: (typeof pagables)[number]): number | null =>
      tarifaVigente(tarifas, c.tipoCustodia, this.diaDelViaje(c));
    // Lo que cobra una persona en un viaje: si ya está pagado, lo congelado; si no, la tarifa de ese día.
    const montoDe = (c: (typeof pagables)[number], rol: string): number =>
      pagados.get(`${c.id}|${rol}`)?.monto ?? tarifaDe(c) ?? 0;
    let viajesSinTarifa = 0;
    const tiposSinTarifa = new Set<string>();
    for (const c of pagables) {
      if (tarifaDe(c) === null) {
        viajesSinTarifa++;
        tiposSinTarifa.add(c.tipoCustodia);
      }
    }

    const empleadosMap = new Map<
      string,
      {
        nombre: string;
        cedula: string;
        total_viajes: number;
        por_tipo: Record<string, number>;
        subtotales: Record<string, number>;
        /** Lo de los viajes, sin ajustes. */
        subtotal_viajes_usd: number;
        /** Extras menos descuentos del período. */
        ajustes_usd: number;
        ajustes: AjusteFila[];
        /** Neto a pagar: viajes + ajustes. */
        total_usd: number;
        detalle: any[];
      }
    >();

    const nuevoEmpleado = (nombre: string, cedula: string) => ({
      nombre: nombre.trim(),
      cedula: cedula?.trim() || '',
      total_viajes: 0,
      por_tipo: { HACIENDA: 0, PUERTO: 0, VIP: 0 } as Record<string, number>,
      subtotales: { HACIENDA: 0, PUERTO: 0, VIP: 0 } as Record<string, number>,
      subtotal_viajes_usd: 0,
      ajustes_usd: 0,
      ajustes: [] as AjusteFila[],
      total_usd: 0,
      detalle: [] as any[],
    });

    const registrar = (nombre: string, cedula: string, rol: string, custodia: any) => {
      const key = clavePersona(cedula, nombre);
      if (!empleadosMap.has(key)) empleadosMap.set(key, nuevoEmpleado(nombre, cedula));
      const emp = empleadosMap.get(key)!;
      const tarifa = montoDe(custodia, rol);
      emp.total_viajes++;
      emp.por_tipo[custodia.tipoCustodia] = (emp.por_tipo[custodia.tipoCustodia] || 0) + 1;
      emp.subtotales[custodia.tipoCustodia] =
        (emp.subtotales[custodia.tipoCustodia] || 0) + tarifa;
      emp.subtotal_viajes_usd += tarifa;
      emp.total_usd += tarifa;
      emp.detalle.push({
        numero_guia: custodia.numeroGuia,
        rol,
        tipo_custodia: custodia.tipoCustodia,
        monto: tarifa,
        cliente: custodia.cliente,
        placa: custodia.placa,
        direccion_salida: custodia.direccionSalida,
        direccion_llegada: custodia.direccionLlegada,
        fecha_hora_salida: custodia.fechaHoraSalida,
        fecha_hora_llegada: custodia.fechaHoraLlegada,
        fecha_registro: custodia.createdAt,
      });
    };

    for (const c of pagables) {
      registrar(c.choferName, c.choferCedula, 'Chofer', c);
      registrar(c.custodio1Name, c.custodio1Cedula, 'Custodio 1', c);
      registrar(c.custodio2Name, c.custodio2Cedula, 'Custodio 2', c);
    }

    // Extras y descuentos del período: se suman al neto de cada persona (aunque no haya hecho viajes en el período).
    for (const a of ajustes) {
      const key = clavePersona(a.cedula, a.persona);
      if (!empleadosMap.has(key)) empleadosMap.set(key, nuevoEmpleado(a.persona, a.cedula));
      const emp = empleadosMap.get(key)!;
      emp.ajustes.push(a);
      emp.ajustes_usd = redondear(emp.ajustes_usd + firmado(a));
      emp.total_usd = redondear(emp.total_usd + firmado(a));
    }

    const empleados = Array.from(empleadosMap.values()).sort((a, b) =>
      a.nombre.localeCompare(b.nombre),
    );
    const total_pagado = redondear(empleados.reduce((sum, e) => sum + e.total_usd, 0));
    const ajustes_usd = redondear(ajustes.reduce((sum, a) => sum + firmado(a), 0));

    const totales_por_tipo: Record<string, number> = { HACIENDA: 0, PUERTO: 0, VIP: 0 };
    for (const c of pagables) totales_por_tipo[c.tipoCustodia]++;

    // Matriz cronológica: filas = viajes, columnas = trabajadores del padrón de custodios.
    const trabajadoresCatalogo = await this.prisma.employeeDriveFolder.findMany({
      where: { companyId, folderType: 'CUSTODIAS' },
      orderBy: { employeeName: 'asc' },
    });
    const columnasTrabajadores = trabajadoresCatalogo.map((e) => e.employeeName);
    const totalesMatrix: Record<string, number> = {};
    for (const t of columnasTrabajadores) totalesMatrix[t] = 0;

    const filas = [];
    for (const c of pagables) {
      const participantes = [
        { nombre: c.choferName, rol: 'Chofer' },
        { nombre: c.custodio1Name, rol: 'Custodio 1' },
        { nombre: c.custodio2Name, rol: 'Custodio 2' },
      ];
      const celdas: Record<string, any> = {};
      for (const p of participantes) {
        const tarifa = montoDe(c, p.rol);
        const tipoTxt = TIPO_LABELS[c.tipoCustodia] || c.tipoCustodia;
        const label =
          p.rol === 'Chofer'
            ? `Chofer-${tipoTxt}: ${tarifa}`
            : `${p.rol === 'Custodio 1' ? 'Cust. 1' : 'Cust. 2'} ${c.tipoCustodia} ${tarifa} dolares`;
        celdas[p.nombre] = { tipo: c.tipoCustodia, monto: tarifa, rol: p.rol, label };
        if (totalesMatrix[p.nombre] !== undefined) totalesMatrix[p.nombre] += tarifa;
      }
      filas.push({
        fecha: this.formatFechaEC(fechaDeViaje(c)),
        fecha_hora: fechaDeViaje(c),
        numero_guia: c.numeroGuia,
        cliente: c.cliente,
        placa: c.placa,
        celdas,
      });
    }

    const matriz = {
      columnas_fijas: ['fecha', 'guia'],
      columnas_trabajadores: columnasTrabajadores,
      filas,
      totales_por_trabajador: totalesMatrix,
      gran_total: Object.values(totalesMatrix).reduce((s, v) => s + v, 0),
      // Extras y descuentos del período, aparte: la matriz solo muestra lo de los viajes.
      ajustes_usd,
    };

    return {
      periodo: { fecha_inicio: fechaInicio, fecha_fin: fechaFin },
      resumen: {
        total_custodias: pagables.length,
        total_pagado,
        ajustes_usd,
        empleados: empleados.length,
        totales_por_tipo,
        tarifas: tarifasDeHoy(tarifas, diaEcuador(new Date())),
        viajes_sin_tarifa: viajesSinTarifa,
        tipos_sin_tarifa: Array.from(tiposSinTarifa),
        nota: 'Solo incluye custodias en estado LLEGÓ. Cada viaje se paga con la tarifa vigente el día del viaje.',
      },
      empleados: empleados.map(({ detalle, ...rest }) => rest),
      empleados_detalle: empleados,
      matriz,
      trabajadores_catalogo: columnasTrabajadores,
    };
  }

  // ───────────────────────────── Dashboard de montos ─────────────────────────────

  /**
   * Cifras del mes elegido (lo que se paga) y de los últimos 6 meses (tendencia), más quiénes y qué clientes
   * concentran el gasto. Todo con la tarifa vigente el día de cada viaje.
   */
  async getDashboard(companyId: number, mes?: string) {
    const mesObjetivo = esMesValido(mes) ? mes : mesActualEcuador();
    const meses = ultimosMeses(mesObjetivo, 6);
    const [tarifas, viajes, ajustes, pagados] = await Promise.all([
      this.cargarTarifas(companyId),
      this.viajesLlego(companyId, diasDelMes(meses[0]).desde, diasDelMes(mesObjetivo).hasta),
      this.cargarAjustes(companyId, diasDelMes(meses[0]).desde, diasDelMes(mesObjetivo).hasta),
      this.cargarPagados(companyId),
    ]);
    const hoy = diaEcuador(new Date());

    const porMesMap = new Map(meses.map((m) => [m, { mes: m, etiqueta: etiquetaMes(m), total_usd: 0, viajes: 0 }]));
    const delMes = viajes.filter((c) => mesDeViaje(c) === mesObjetivo);
    for (const c of viajes) {
      const fila = porMesMap.get(mesDeViaje(c));
      if (!fila) continue;
      fila.viajes++;
      fila.total_usd += this.pagosDeViaje(c, tarifas, pagados).reduce((s, p) => s + (p.tarifa ?? 0), 0);
    }
    // Los ajustes cuentan en el mes de su fecha (los de un viaje, en el mes de ese viaje).
    for (const a of ajustes) {
      const fila = porMesMap.get(a.fecha.slice(0, 7));
      if (fila) fila.total_usd = redondear(fila.total_usd + firmado(a));
    }

    const porTipo = TIPOS_CUSTODIA.map((tipo) => ({
      tipo: tipo as string,
      cantidad: 0,
      total_costo: 0,
      tarifa_persona: tarifaVigente(tarifas, tipo, hoy),
    }));
    const porTipoMap = new Map(porTipo.map((t) => [t.tipo, t]));
    const clientes = new Map<string, { cliente: string; viajes: number; total_usd: number }>();
    const personas = new Map<string, { nombre: string; cedula: string; viajes: number; total_usd: number }>();

    let total_viajes_usd = 0;
    let viajes_sin_tarifa = 0;
    for (const c of delMes) {
      const pagos = this.pagosDeViaje(c, tarifas, pagados);
      const costo = pagos.reduce((s, p) => s + (p.tarifa ?? 0), 0);
      if (pagos[0].tarifa === null) viajes_sin_tarifa++;
      total_viajes_usd += costo;
      const t = porTipoMap.get(c.tipoCustodia);
      if (t) {
        t.cantidad++;
        t.total_costo += costo;
      }
      const nombreCliente = (c.cliente ?? '').trim() || 'Sin cliente';
      const cl = clientes.get(nombreCliente) ?? { cliente: nombreCliente, viajes: 0, total_usd: 0 };
      cl.viajes++;
      cl.total_usd += costo;
      clientes.set(nombreCliente, cl);
      for (const p of pagos) {
        const clave = p.cedula || p.nombre;
        if (!clave) continue;
        const pe = personas.get(clave) ?? { nombre: p.nombre, cedula: p.cedula, viajes: 0, total_usd: 0 };
        pe.viajes++;
        pe.total_usd += p.tarifa ?? 0;
        personas.set(clave, pe);
      }
    }

    // Extras y descuentos del mes: suman al total y a lo que gana cada persona (aunque no haya viajado ese mes).
    let ajustes_usd = 0;
    for (const a of ajustes) {
      if (a.fecha.slice(0, 7) !== mesObjetivo) continue;
      ajustes_usd = redondear(ajustes_usd + firmado(a));
      const clave = clavePersona(a.cedula, a.persona);
      const pe = personas.get(clave) ?? { nombre: a.persona, cedula: a.cedula, viajes: 0, total_usd: 0 };
      pe.total_usd = redondear(pe.total_usd + firmado(a));
      personas.set(clave, pe);
    }
    const total_nomina_usd = redondear(total_viajes_usd + ajustes_usd);

    const top = <T extends { total_usd: number }>(m: Map<string, T>) =>
      [...m.values()].sort((a, b) => b.total_usd - a.total_usd).slice(0, 6);

    return {
      periodo: { mes: mesObjetivo, ...diasDelMes(mesObjetivo) },
      kpis: {
        viajes_finalizados: delMes.length,
        total_nomina_usd,
        // Lo de los viajes y lo de los ajustes (extras − descuentos) por separado: el promedio por viaje usa solo lo primero.
        total_viajes_usd: redondear(total_viajes_usd),
        ajustes_usd,
        personas_pagadas: personas.size,
        promedio_por_viaje: delMes.length > 0 ? total_viajes_usd / delMes.length : null,
        viajes_sin_tarifa,
      },
      por_tipo: porTipo,
      por_mes: [...porMesMap.values()],
      por_cliente: top(clientes),
      por_persona: top(personas),
    };
  }

  private formatFechaEC(date: Date): string {
    const d = new Date(date);
    const dia = String(d.getUTCDate()).padStart(2, '0');
    const mes = String(d.getUTCMonth() + 1).padStart(2, '0');
    return `${dia}/${mes}/${d.getUTCFullYear()}`;
  }
}
