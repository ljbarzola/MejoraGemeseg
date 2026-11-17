import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  CatalogoLoteDto,
  CotLimitesDto,
  CotKitDto,
  CotTemplateDto,
  CreateCotInstallDto,
  CreateCotProductDto,
  UpdateCotInstallDto,
  UpdateCotKitDto,
  UpdateCotProductDto,
  UpdateCotTemplateDto,
} from './dto/cotizador.dto';
import {
  CAMPOS_PRECIO,
  COT_PREFIX,
  CotCambioAccion,
  CotCambioEntidad,
  CotCounterKind,
  MAX_ITEMS_BYTES,
  assertJsonSize,
  diffCatalogo,
  formatCode,
  infoCampo,
  mapInstall,
  mapProduct,
  sanitizeClient,
  sanitizeKitComponents,
  sanitizeLines,
  sanitizeMargins,
  toNum,
} from './cotizador.util';

type Tx = Prisma.TransactionClient;

/** Quién hace el cambio (queda en el historial del catálogo). */
interface Actor {
  userId: number;
  nombre: string;
  /** Solo administradores y gerentes fijan el precio mínimo de un producto. */
  puedeFijarMinimo: boolean;
}

const SOLO_ADMIN_MINIMO =
  'Solo administradores o gerentes pueden cambiar el precio mínimo de un producto';

/** ¿Cambia el precio mínimo? (vacío y vacío no es un cambio; el Decimal de Prisma llega como texto). */
const cambiaMinimo = (actual: unknown, nuevo: number | null | undefined) =>
  nuevo !== undefined &&
  (actual === null || actual === undefined ? null : toNum(actual)) !== nuevo;

export interface FiltroHistorial {
  q?: string;
  /** precio | datos | creo | elimino */
  tipo?: string;
  desde?: string;
  hasta?: string;
  userId?: number;
  pagina?: number;
  limite?: number;
}

const SIN_NOMBRE = 'Escribe el nombre del producto';

/**
 * Catálogo del Cotizador: productos (equipos, materiales, servicios), servicios de
 * instalación, kits y plantillas.
 *
 * Reglas de fondo (heredadas del cotizador original, ya corregidas):
 *  - El código (EQ-0001...) lo asigna el servidor, no se edita y NUNCA se reutiliza.
 *  - "Borrar" un producto lo DESACTIVA: las cotizaciones que lo usaron lo siguen
 *    encontrando por su código.
 */
@Injectable()
export class CotizadorCatalogoService {
  constructor(private readonly prisma: PrismaService) {}

  private requireCompany(companyId: number | null): number {
    if (!companyId) throw new BadRequestException('Se requiere una empresa');
    return companyId;
  }

  // ---------------------------------------------------------------------
  // Historial de cambios del catálogo
  // ---------------------------------------------------------------------

  private async resolverActor(userId: number): Promise<Actor> {
    const u = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { fullName: true, role: true },
    });
    return {
      userId,
      nombre: u?.fullName ?? '',
      puedeFijarMinimo: u?.role === 'ADMIN' || u?.role === 'MANAGER',
    };
  }

  /**
   * Anota en el historial, dentro de la misma transacción del cambio (si el cambio falla,
   * el historial tampoco queda). En EDITO escribe un renglón por campo cambiado; si no
   * cambió nada, no escribe nada. En CREO / ELIMINO escribe un solo renglón.
   */
  private async anotar(
    tx: Tx,
    companyId: number,
    actor: Actor,
    entidad: CotCambioEntidad,
    ref: { id: number; code: string; name: string },
    accion: CotCambioAccion,
    campos: { campo: string; valorAntes: string | null; valorDespues: string | null }[] = [],
  ) {
    const filas =
      accion === 'EDITO'
        ? campos
        : [{ campo: '', valorAntes: null, valorDespues: null }];
    if (!filas.length) return;
    await tx.cotCambio.createMany({
      data: filas.map((f) => ({
        companyId,
        entidad,
        entidadId: ref.id,
        codigo: ref.code,
        nombre: ref.name,
        accion,
        campo: f.campo,
        valorAntes: f.valorAntes,
        valorDespues: f.valorDespues,
        userId: actor.userId,
        userNombre: actor.nombre,
      })),
    });
  }

  /** Lista el historial del catálogo (el más reciente primero), con filtros y paginación. */
  async historial(companyId: number | null, f: FiltroHistorial) {
    const cid = this.requireCompany(companyId);
    const where: Prisma.CotCambioWhereInput = { companyId: cid };
    const q = f.q?.trim();
    if (q) {
      where.OR = [
        { codigo: { contains: q, mode: 'insensitive' } },
        { nombre: { contains: q, mode: 'insensitive' } },
      ];
    }
    if (f.userId) where.userId = f.userId;
    if (f.tipo === 'precio') {
      where.accion = 'EDITO';
      where.campo = { in: CAMPOS_PRECIO };
    } else if (f.tipo === 'datos') {
      where.accion = 'EDITO';
      where.campo = { notIn: CAMPOS_PRECIO };
    } else if (f.tipo === 'creo') where.accion = 'CREO';
    else if (f.tipo === 'elimino') where.accion = 'ELIMINO';
    // Días de Ecuador (UTC-5): el filtro «desde 12» empieza a las 00:00 de allá
    const desde = f.desde && /^\d{4}-\d{2}-\d{2}$/.test(f.desde) ? f.desde : null;
    const hasta = f.hasta && /^\d{4}-\d{2}-\d{2}$/.test(f.hasta) ? f.hasta : null;
    if (desde || hasta) {
      const rango: Prisma.DateTimeFilter = {};
      if (desde) rango.gte = new Date(`${desde}T00:00:00-05:00`);
      if (hasta) {
        const fin = new Date(`${hasta}T00:00:00-05:00`);
        fin.setUTCDate(fin.getUTCDate() + 1);
        rango.lt = fin;
      }
      where.creadoEn = rango;
    }
    const limite = Math.min(Math.max(f.limite ?? 50, 1), 200);
    const pagina = Math.max(f.pagina ?? 1, 1);
    const [total, filas] = await Promise.all([
      this.prisma.cotCambio.count({ where }),
      this.prisma.cotCambio.findMany({
        where,
        orderBy: [{ creadoEn: 'desc' }, { id: 'desc' }],
        skip: (pagina - 1) * limite,
        take: limite,
      }),
    ]);
    return {
      total,
      pagina,
      limite,
      items: filas.map((c) => {
        const entidad = c.entidad as CotCambioEntidad;
        const info = c.campo ? infoCampo(entidad, c.campo) : null;
        return {
          id: c.id,
          creadoEn: c.creadoEn,
          entidad,
          codigo: c.codigo,
          nombre: c.nombre,
          accion: c.accion as CotCambioAccion,
          campo: c.campo,
          campoEtiqueta: info?.etiqueta ?? '',
          campoTipo: info?.tipo ?? 'texto',
          esPrecio: CAMPOS_PRECIO.includes(c.campo),
          valorAntes: c.valorAntes,
          valorDespues: c.valorDespues,
          userId: c.userId,
          userNombre: c.userNombre,
        };
      }),
    };
  }

  /** Personas que aparecen en el historial (para el filtro «Persona»). */
  async personasHistorial(companyId: number | null) {
    const cid = this.requireCompany(companyId);
    const filas = await this.prisma.cotCambio.findMany({
      where: { companyId: cid, userId: { not: null } },
      distinct: ['userId'],
      select: { userId: true, userNombre: true },
      orderBy: { userNombre: 'asc' },
    });
    return filas.map((p) => ({ userId: p.userId as number, nombre: p.userNombre }));
  }

  // ---------------------------------------------------------------------
  // Límites de precio de la empresa (solo avisos en la cotización)
  // ---------------------------------------------------------------------

  private mapLimites(
    l: {
      maxDescuentoPct: unknown;
      maxDescuentoServiciosPct: unknown;
      minGananciaPct: unknown;
    } | null,
  ) {
    const n = (v: unknown) => (v === null || v === undefined ? null : toNum(v));
    return {
      maxDescuentoPct: n(l?.maxDescuentoPct),
      maxDescuentoServiciosPct: n(l?.maxDescuentoServiciosPct),
      minGananciaPct: n(l?.minGananciaPct),
    };
  }

  /** Lo ve cualquiera que use el Cotizador (necesita los límites para mostrar los avisos). */
  async obtenerLimites(companyId: number | null) {
    const cid = this.requireCompany(companyId);
    const l = await this.prisma.cotLimites.findUnique({
      where: { companyId: cid },
    });
    return this.mapLimites(l);
  }

  /** Solo administradores y gerentes (lo exige el controlador). null o vacío = sin límite. */
  async guardarLimites(
    companyId: number | null,
    dto: CotLimitesDto,
    userId: number,
  ) {
    const cid = this.requireCompany(companyId);
    const data = {
      maxDescuentoPct: dto.maxDescuentoPct ?? null,
      maxDescuentoServiciosPct: dto.maxDescuentoServiciosPct ?? null,
      minGananciaPct: dto.minGananciaPct ?? null,
      updatedBy: userId,
      updatedAt: new Date(),
    };
    const l = await this.prisma.cotLimites.upsert({
      where: { companyId: cid },
      create: { companyId: cid, ...data },
      update: data,
    });
    return this.mapLimites(l);
  }

  // ---------------------------------------------------------------------
  // Códigos: último + 1, el contador solo sube
  // ---------------------------------------------------------------------

  /** Mayor número que existe hoy para ese tipo (activos E inactivos). */
  private async maxNumber(
    tx: Tx,
    companyId: number,
    kind: CotCounterKind,
  ): Promise<number> {
    const prefix = COT_PREFIX[kind];
    const pattern = `^${prefix}[0-9]+$`;
    const desde = prefix.length + 1;
    const rows =
      kind === 'INSTALACION'
        ? await tx.$queryRaw<{ m: number }[]>(
            Prisma.sql`SELECT COALESCE(MAX(SUBSTRING("code" FROM ${desde})::int), 0)::int AS m
                       FROM "CotInstallService"
                       WHERE "companyId" = ${companyId} AND "code" ~ ${pattern}`,
          )
        : await tx.$queryRaw<{ m: number }[]>(
            Prisma.sql`SELECT COALESCE(MAX(SUBSTRING("code" FROM ${desde})::int), 0)::int AS m
                       FROM "CotProduct"
                       WHERE "companyId" = ${companyId} AND "kind" = ${kind} AND "code" ~ ${pattern}`,
          );
    return rows[0]?.m ?? 0;
  }

  /** Reserva el siguiente código (el contador sube y no vuelve a bajar). */
  async reservarCodigo(
    tx: Tx,
    companyId: number,
    kind: CotCounterKind,
  ): Promise<string> {
    const max = await this.maxNumber(tx, companyId, kind);
    // Un solo UPSERT: bloquea la fila del contador, así dos altas simultáneas reciben números distintos.
    const rows = await tx.$queryRaw<{ lastSeq: number }[]>(
      Prisma.sql`INSERT INTO "CotCounter" ("companyId", "kind", "lastSeq")
                 VALUES (${companyId}, ${kind}, ${max + 1})
                 ON CONFLICT ("companyId", "kind")
                 DO UPDATE SET "lastSeq" = GREATEST("CotCounter"."lastSeq", ${max}) + 1
                 RETURNING "lastSeq"`,
    );
    return formatCode(kind, rows[0].lastSeq);
  }

  /** El código que recibiría la próxima alta, sin gastarlo (solo para mostrarlo). */
  async siguienteCodigo(
    companyId: number | null,
    kind: CotCounterKind,
  ): Promise<{ code: string }> {
    const cid = this.requireCompany(companyId);
    const code = await this.prisma.$transaction(async (tx) => {
      const max = await this.maxNumber(tx, cid, kind);
      const c = await tx.cotCounter.findUnique({
        where: { companyId_kind: { companyId: cid, kind } },
      });
      return formatCode(kind, Math.max(c?.lastSeq ?? 0, max) + 1);
    });
    return { code };
  }

  // ---------------------------------------------------------------------
  // Catálogo (lectura)
  // ---------------------------------------------------------------------

  async catalogo(companyId: number | null, incluirInactivos = false) {
    const cid = this.requireCompany(companyId);
    const where = incluirInactivos
      ? { companyId: cid }
      : { companyId: cid, isActive: true };
    const [productos, instalaciones] = await Promise.all([
      this.prisma.cotProduct.findMany({
        where,
        orderBy: [{ kind: 'asc' }, { code: 'asc' }],
      }),
      this.prisma.cotInstallService.findMany({
        where,
        orderBy: { code: 'asc' },
      }),
    ]);
    return {
      productos: productos.map(mapProduct),
      instalaciones: instalaciones.map(mapInstall),
    };
  }

  // ---------------------------------------------------------------------
  // Productos
  // ---------------------------------------------------------------------

  private productoData(dto: UpdateCotProductDto | CreateCotProductDto) {
    const d: Prisma.CotProductUncheckedUpdateInput = {};
    if (dto.name !== undefined) d.name = dto.name.trim();
    if (dto.category !== undefined) d.category = dto.category.trim();
    if (dto.subcategory !== undefined) d.subcategory = dto.subcategory.trim();
    if (dto.model !== undefined) d.model = dto.model.trim();
    if (dto.description !== undefined) d.description = dto.description;
    if (dto.unit !== undefined) d.unit = dto.unit.trim();
    if (dto.supplier !== undefined) d.supplier = dto.supplier.trim();
    if (dto.lastUpdate !== undefined) d.lastUpdate = dto.lastUpdate;
    if (dto.notes !== undefined) d.notes = dto.notes;
    if (dto.defaultQty !== undefined) d.defaultQty = dto.defaultQty;
    if (dto.unitCost !== undefined) d.unitCost = dto.unitCost;
    if (dto.monthlyCost !== undefined) d.monthlyCost = dto.monthlyCost;
    if (dto.annualCost !== undefined) d.annualCost = dto.annualCost;
    if (dto.minPrice !== undefined) d.minPrice = dto.minPrice;
    if (dto.hasProfit !== undefined) d.hasProfit = dto.hasProfit;
    if (dto.hasInstall !== undefined) d.hasInstall = dto.hasInstall;
    return d;
  }

  private async crearProductoTx(
    tx: Tx,
    companyId: number,
    dto: CreateCotProductDto,
    actor: Actor,
  ) {
    if (!dto.name?.trim()) throw new BadRequestException(SIN_NOMBRE);
    if (cambiaMinimo(null, dto.minPrice) && !actor.puedeFijarMinimo)
      throw new ForbiddenException(SOLO_ADMIN_MINIMO);
    const kind = dto.kind;
    const code = await this.reservarCodigo(tx, companyId, kind);
    const esServicio = kind === 'SERVICIO';
    const base = this.productoData(dto);
    const creado = await tx.cotProduct.create({
      data: {
        ...(base as Prisma.CotProductUncheckedCreateInput),
        companyId,
        kind,
        code,
        name: dto.name.trim(),
        // Los servicios no llevan ganancia de proveedor ni de instalación (igual que el original)
        hasProfit: esServicio ? false : (dto.hasProfit ?? false),
        hasInstall: esServicio ? false : (dto.hasInstall ?? false),
        unit: dto.unit ?? (esServicio ? 'servicio' : 'u'),
      },
    });
    await this.anotar(
      tx,
      companyId,
      actor,
      'PRODUCTO',
      { id: creado.id, code: creado.code, name: creado.name },
      'CREO',
    );
    return creado;
  }

  async crearProducto(
    companyId: number | null,
    dto: CreateCotProductDto,
    userId: number,
  ) {
    const cid = this.requireCompany(companyId);
    const actor = await this.resolverActor(userId);
    const p = await this.prisma.$transaction((tx) =>
      this.crearProductoTx(tx, cid, dto, actor),
    );
    return mapProduct(p);
  }

  private async actualizarProductoTx(
    tx: Tx,
    companyId: number,
    id: number,
    dto: UpdateCotProductDto,
    actor: Actor,
  ) {
    const actual = await tx.cotProduct.findFirst({ where: { id, companyId } });
    if (!actual) throw new NotFoundException('Producto no encontrado');
    if (!actual.isActive)
      throw new BadRequestException(
        `El producto ${actual.code} está desactivado: ya no se puede editar`,
      );
    if (dto.name !== undefined && !dto.name.trim())
      throw new BadRequestException(SIN_NOMBRE);
    if (cambiaMinimo(actual.minPrice, dto.minPrice) && !actor.puedeFijarMinimo)
      throw new ForbiddenException(SOLO_ADMIN_MINIMO);
    const actualizado = await tx.cotProduct.update({
      where: { id },
      data: this.productoData(dto),
    });
    await this.anotar(
      tx,
      companyId,
      actor,
      'PRODUCTO',
      { id: actualizado.id, code: actualizado.code, name: actualizado.name },
      'EDITO',
      diffCatalogo('PRODUCTO', actual, actualizado),
    );
    return actualizado;
  }

  async actualizarProducto(
    companyId: number | null,
    id: number,
    dto: UpdateCotProductDto,
    userId: number,
  ) {
    const cid = this.requireCompany(companyId);
    const actor = await this.resolverActor(userId);
    const p = await this.prisma.$transaction((tx) =>
      this.actualizarProductoTx(tx, cid, id, dto, actor),
    );
    return mapProduct(p);
  }

  /** "Borrar" = desactivar: el producto sale del catálogo pero las cotizaciones que lo usaron lo conservan. */
  async desactivarProducto(
    companyId: number | null,
    id: number,
    userId: number,
  ) {
    const cid = this.requireCompany(companyId);
    const actor = await this.resolverActor(userId);
    await this.prisma.$transaction(async (tx) => {
      const p = await tx.cotProduct.findFirst({
        where: { id, companyId: cid },
      });
      if (!p) throw new NotFoundException('Producto no encontrado');
      // Si ya estaba desactivado no hay nada que anotar (repetir no ensucia el historial)
      if (!p.isActive) return;
      await tx.cotProduct.update({ where: { id }, data: { isActive: false } });
      await this.anotar(
        tx,
        cid,
        actor,
        'PRODUCTO',
        { id: p.id, code: p.code, name: p.name },
        'ELIMINO',
      );
    });
    return { ok: true };
  }

  // ---------------------------------------------------------------------
  // Servicios de instalación
  // ---------------------------------------------------------------------

  private async crearInstalacionTx(
    tx: Tx,
    companyId: number,
    dto: CreateCotInstallDto,
    actor: Actor,
  ) {
    if (!dto.name?.trim())
      throw new BadRequestException('Escribe el nombre del servicio');
    const code = await this.reservarCodigo(tx, companyId, 'INSTALACION');
    const creada = await tx.cotInstallService.create({
      data: {
        companyId,
        code,
        name: dto.name.trim(),
        category: dto.category?.trim() ?? '',
        subcategory: dto.subcategory?.trim() ?? '',
        unitCost: dto.unitCost ?? 0,
        notes: dto.notes ?? '',
      },
    });
    await this.anotar(
      tx,
      companyId,
      actor,
      'INSTALACION',
      { id: creada.id, code: creada.code, name: creada.name },
      'CREO',
    );
    return creada;
  }

  async crearInstalacion(
    companyId: number | null,
    dto: CreateCotInstallDto,
    userId: number,
  ) {
    const cid = this.requireCompany(companyId);
    const actor = await this.resolverActor(userId);
    const i = await this.prisma.$transaction((tx) =>
      this.crearInstalacionTx(tx, cid, dto, actor),
    );
    return mapInstall(i);
  }

  private async actualizarInstalacionTx(
    tx: Tx,
    companyId: number,
    id: number,
    dto: UpdateCotInstallDto,
    actor: Actor,
  ) {
    const actual = await tx.cotInstallService.findFirst({
      where: { id, companyId },
    });
    if (!actual)
      throw new NotFoundException('Servicio de instalación no encontrado');
    if (!actual.isActive)
      throw new BadRequestException(
        `El servicio ${actual.code} está desactivado: ya no se puede editar`,
      );
    if (dto.name !== undefined && !dto.name.trim())
      throw new BadRequestException('Escribe el nombre del servicio');
    const data: Prisma.CotInstallServiceUpdateInput = {};
    if (dto.name !== undefined) data.name = dto.name.trim();
    if (dto.category !== undefined) data.category = dto.category.trim();
    if (dto.subcategory !== undefined)
      data.subcategory = dto.subcategory.trim();
    if (dto.notes !== undefined) data.notes = dto.notes;
    if (dto.unitCost !== undefined) data.unitCost = dto.unitCost;
    const actualizada = await tx.cotInstallService.update({
      where: { id },
      data,
    });
    await this.anotar(
      tx,
      companyId,
      actor,
      'INSTALACION',
      { id: actualizada.id, code: actualizada.code, name: actualizada.name },
      'EDITO',
      diffCatalogo('INSTALACION', actual, actualizada),
    );
    return actualizada;
  }

  async actualizarInstalacion(
    companyId: number | null,
    id: number,
    dto: UpdateCotInstallDto,
    userId: number,
  ) {
    const cid = this.requireCompany(companyId);
    const actor = await this.resolverActor(userId);
    const i = await this.prisma.$transaction((tx) =>
      this.actualizarInstalacionTx(tx, cid, id, dto, actor),
    );
    return mapInstall(i);
  }

  async desactivarInstalacion(
    companyId: number | null,
    id: number,
    userId: number,
  ) {
    const cid = this.requireCompany(companyId);
    const actor = await this.resolverActor(userId);
    await this.prisma.$transaction(async (tx) => {
      const i = await tx.cotInstallService.findFirst({
        where: { id, companyId: cid },
      });
      if (!i)
        throw new NotFoundException('Servicio de instalación no encontrado');
      if (!i.isActive) return;
      await tx.cotInstallService.update({
        where: { id },
        data: { isActive: false },
      });
      await this.anotar(
        tx,
        cid,
        actor,
        'INSTALACION',
        { id: i.id, code: i.code, name: i.name },
        'ELIMINO',
      );
    });
    return { ok: true };
  }

  // ---------------------------------------------------------------------
  // Edición por lote (editor del catálogo): todo o nada
  // ---------------------------------------------------------------------

  async lote(companyId: number | null, dto: CatalogoLoteDto, userId: number) {
    const cid = this.requireCompany(companyId);
    const actor = await this.resolverActor(userId);
    const resumen = await this.prisma.$transaction(
      async (tx) => {
        const r = {
          productosNuevos: [] as ReturnType<typeof mapProduct>[],
          productosEditados: 0,
          productosDesactivados: 0,
          instalacionesNuevas: [] as ReturnType<typeof mapInstall>[],
          instalacionesEditadas: 0,
          instalacionesDesactivadas: 0,
        };
        const p = dto.productos;
        if (p) {
          for (const c of p.cambios ?? []) {
            const { id, ...resto } = c;
            await this.actualizarProductoTx(tx, cid, id, resto, actor);
            r.productosEditados++;
          }
          for (const n of p.nuevos ?? []) {
            r.productosNuevos.push(
              mapProduct(await this.crearProductoTx(tx, cid, n, actor)),
            );
          }
          if (p.borrados?.length) {
            // Solo los que seguían activos: uno ya desactivado no se vuelve a anotar
            const activos = await tx.cotProduct.findMany({
              where: { companyId: cid, id: { in: p.borrados }, isActive: true },
            });
            if (activos.length) {
              await tx.cotProduct.updateMany({
                where: { companyId: cid, id: { in: activos.map((a) => a.id) } },
                data: { isActive: false },
              });
              for (const a of activos) {
                await this.anotar(
                  tx,
                  cid,
                  actor,
                  'PRODUCTO',
                  { id: a.id, code: a.code, name: a.name },
                  'ELIMINO',
                );
              }
            }
            r.productosDesactivados = activos.length;
          }
        }
        const i = dto.instalaciones;
        if (i) {
          for (const c of i.cambios ?? []) {
            const { id, ...resto } = c;
            await this.actualizarInstalacionTx(tx, cid, id, resto, actor);
            r.instalacionesEditadas++;
          }
          for (const n of i.nuevos ?? []) {
            r.instalacionesNuevas.push(
              mapInstall(await this.crearInstalacionTx(tx, cid, n, actor)),
            );
          }
          if (i.borrados?.length) {
            const activas = await tx.cotInstallService.findMany({
              where: { companyId: cid, id: { in: i.borrados }, isActive: true },
            });
            if (activas.length) {
              await tx.cotInstallService.updateMany({
                where: { companyId: cid, id: { in: activas.map((a) => a.id) } },
                data: { isActive: false },
              });
              for (const a of activas) {
                await this.anotar(
                  tx,
                  cid,
                  actor,
                  'INSTALACION',
                  { id: a.id, code: a.code, name: a.name },
                  'ELIMINO',
                );
              }
            }
            r.instalacionesDesactivadas = activas.length;
          }
        }
        return r;
      },
      { timeout: 60_000, maxWait: 30_000 },
    );
    return resumen;
  }

  // ---------------------------------------------------------------------
  // Kits
  // ---------------------------------------------------------------------

  private mapKit(k: {
    id: number;
    name: string;
    components: Prisma.JsonValue;
    createdBy: number | null;
    createdAt: Date;
  }) {
    return {
      id: k.id,
      name: k.name,
      components: k.components,
      createdBy: k.createdBy,
      createdAt: k.createdAt,
    };
  }

  async listarKits(companyId: number | null) {
    const cid = this.requireCompany(companyId);
    const kits = await this.prisma.cotKit.findMany({
      where: { companyId: cid },
      orderBy: { createdAt: 'asc' },
    });
    return kits.map((k) => this.mapKit(k));
  }

  async crearKit(companyId: number | null, userId: number, dto: CotKitDto) {
    const cid = this.requireCompany(companyId);
    if (!dto.name.trim())
      throw new BadRequestException('Escribe el nombre del kit');
    const components = sanitizeKitComponents(dto.components);
    assertJsonSize(components, MAX_ITEMS_BYTES, 'El kit');
    const k = await this.prisma.cotKit.create({
      data: {
        companyId: cid,
        name: dto.name.trim(),
        components,
        createdBy: userId,
      },
    });
    return this.mapKit(k);
  }

  async actualizarKit(
    companyId: number | null,
    id: number,
    dto: UpdateCotKitDto,
  ) {
    const cid = this.requireCompany(companyId);
    const actual = await this.prisma.cotKit.findFirst({
      where: { id, companyId: cid },
    });
    if (!actual) throw new NotFoundException('Kit no encontrado');
    const data: Prisma.CotKitUpdateInput = {};
    if (dto.name !== undefined) {
      if (!dto.name.trim())
        throw new BadRequestException('Escribe el nombre del kit');
      data.name = dto.name.trim();
    }
    if (dto.components !== undefined) {
      const components = sanitizeKitComponents(dto.components);
      assertJsonSize(components, MAX_ITEMS_BYTES, 'El kit');
      data.components = components;
    }
    const k = await this.prisma.cotKit.update({ where: { id }, data });
    return this.mapKit(k);
  }

  async eliminarKit(companyId: number | null, id: number) {
    const cid = this.requireCompany(companyId);
    const r = await this.prisma.cotKit.deleteMany({
      where: { id, companyId: cid },
    });
    if (r.count === 0) throw new NotFoundException('Kit no encontrado');
    return { ok: true };
  }

  // ---------------------------------------------------------------------
  // Plantillas
  // ---------------------------------------------------------------------

  private mapPlantilla(t: {
    id: number;
    name: string;
    description: string;
    clientType: string;
    industry: string;
    client: Prisma.JsonValue;
    items: Prisma.JsonValue;
    supplierMargins: Prisma.JsonValue;
    installMargin: Prisma.Decimal;
    isSample: boolean;
    createdBy: number | null;
    createdByName: string;
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      id: t.id,
      name: t.name,
      description: t.description,
      clientType: t.clientType,
      industry: t.industry,
      client: t.client,
      items: t.items,
      supplierMargins: t.supplierMargins,
      installMargin: toNum(t.installMargin),
      isSample: t.isSample,
      createdBy: t.createdBy,
      createdByName: t.createdByName,
      createdAt: t.createdAt,
      updatedAt: t.updatedAt,
    };
  }

  async listarPlantillas(companyId: number | null) {
    const cid = this.requireCompany(companyId);
    const ts = await this.prisma.cotTemplate.findMany({
      where: { companyId: cid },
      orderBy: { createdAt: 'desc' },
    });
    return ts.map((t) => this.mapPlantilla(t));
  }

  async crearPlantilla(
    companyId: number | null,
    user: { userId: number; fullName: string },
    dto: CotTemplateDto,
  ) {
    const cid = this.requireCompany(companyId);
    if (!dto.name.trim())
      throw new BadRequestException('Escribe el nombre de la plantilla');
    const items = sanitizeLines(dto.items ?? []);
    assertJsonSize(items, MAX_ITEMS_BYTES, 'La plantilla');
    const t = await this.prisma.cotTemplate.create({
      data: {
        companyId: cid,
        name: dto.name.trim(),
        description: dto.description ?? '',
        clientType: dto.clientType ?? 'mediana',
        industry: dto.industry ?? 'comercio',
        client: sanitizeClient(dto.client ?? {}),
        items: items as unknown as Prisma.InputJsonValue,
        supplierMargins: sanitizeMargins(dto.supplierMargins),
        installMargin: dto.installMargin ?? 35,
        isSample: dto.isSample ?? false,
        createdBy: user.userId,
        createdByName: user.fullName,
      },
    });
    return this.mapPlantilla(t);
  }

  async actualizarPlantilla(
    companyId: number | null,
    id: number,
    dto: UpdateCotTemplateDto,
  ) {
    const cid = this.requireCompany(companyId);
    const actual = await this.prisma.cotTemplate.findFirst({
      where: { id, companyId: cid },
    });
    if (!actual) throw new NotFoundException('Plantilla no encontrada');
    const data: Prisma.CotTemplateUpdateInput = {};
    if (dto.name !== undefined) {
      if (!dto.name.trim())
        throw new BadRequestException('Escribe el nombre de la plantilla');
      data.name = dto.name.trim();
    }
    if (dto.description !== undefined) data.description = dto.description;
    if (dto.clientType !== undefined) data.clientType = dto.clientType;
    if (dto.industry !== undefined) data.industry = dto.industry;
    if (dto.client !== undefined) data.client = sanitizeClient(dto.client);
    if (dto.items !== undefined) {
      const items = sanitizeLines(dto.items);
      assertJsonSize(items, MAX_ITEMS_BYTES, 'La plantilla');
      data.items = items as unknown as Prisma.InputJsonValue;
    }
    if (dto.supplierMargins !== undefined)
      data.supplierMargins = sanitizeMargins(dto.supplierMargins);
    if (dto.installMargin !== undefined) data.installMargin = dto.installMargin;
    const t = await this.prisma.cotTemplate.update({ where: { id }, data });
    return this.mapPlantilla(t);
  }

  async eliminarPlantilla(companyId: number | null, id: number) {
    const cid = this.requireCompany(companyId);
    const r = await this.prisma.cotTemplate.deleteMany({
      where: { id, companyId: cid },
    });
    if (r.count === 0) throw new NotFoundException('Plantilla no encontrada');
    return { ok: true };
  }
}
