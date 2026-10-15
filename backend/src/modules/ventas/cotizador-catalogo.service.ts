import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  CatalogoLoteDto,
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
  COT_PREFIX,
  CotCounterKind,
  MAX_ITEMS_BYTES,
  assertJsonSize,
  formatCode,
  mapInstall,
  mapProduct,
  sanitizeClient,
  sanitizeKitComponents,
  sanitizeLines,
  sanitizeMargins,
  toNum,
} from './cotizador.util';

type Tx = Prisma.TransactionClient;

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
    if (dto.hasProfit !== undefined) d.hasProfit = dto.hasProfit;
    if (dto.hasInstall !== undefined) d.hasInstall = dto.hasInstall;
    return d;
  }

  private async crearProductoTx(
    tx: Tx,
    companyId: number,
    dto: CreateCotProductDto,
  ) {
    if (!dto.name?.trim()) throw new BadRequestException(SIN_NOMBRE);
    const kind = dto.kind;
    const code = await this.reservarCodigo(tx, companyId, kind);
    const esServicio = kind === 'SERVICIO';
    const base = this.productoData(dto);
    return tx.cotProduct.create({
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
  }

  async crearProducto(companyId: number | null, dto: CreateCotProductDto) {
    const cid = this.requireCompany(companyId);
    const p = await this.prisma.$transaction((tx) =>
      this.crearProductoTx(tx, cid, dto),
    );
    return mapProduct(p);
  }

  private async actualizarProductoTx(
    tx: Tx,
    companyId: number,
    id: number,
    dto: UpdateCotProductDto,
  ) {
    const actual = await tx.cotProduct.findFirst({ where: { id, companyId } });
    if (!actual) throw new NotFoundException('Producto no encontrado');
    if (!actual.isActive)
      throw new BadRequestException(
        `El producto ${actual.code} está desactivado: ya no se puede editar`,
      );
    if (dto.name !== undefined && !dto.name.trim())
      throw new BadRequestException(SIN_NOMBRE);
    return tx.cotProduct.update({
      where: { id },
      data: this.productoData(dto),
    });
  }

  async actualizarProducto(
    companyId: number | null,
    id: number,
    dto: UpdateCotProductDto,
  ) {
    const cid = this.requireCompany(companyId);
    const p = await this.prisma.$transaction((tx) =>
      this.actualizarProductoTx(tx, cid, id, dto),
    );
    return mapProduct(p);
  }

  /** "Borrar" = desactivar: el producto sale del catálogo pero las cotizaciones que lo usaron lo conservan. */
  async desactivarProducto(companyId: number | null, id: number) {
    const cid = this.requireCompany(companyId);
    const r = await this.prisma.cotProduct.updateMany({
      where: { id, companyId: cid },
      data: { isActive: false },
    });
    if (r.count === 0) throw new NotFoundException('Producto no encontrado');
    return { ok: true };
  }

  // ---------------------------------------------------------------------
  // Servicios de instalación
  // ---------------------------------------------------------------------

  private async crearInstalacionTx(
    tx: Tx,
    companyId: number,
    dto: CreateCotInstallDto,
  ) {
    if (!dto.name?.trim())
      throw new BadRequestException('Escribe el nombre del servicio');
    const code = await this.reservarCodigo(tx, companyId, 'INSTALACION');
    return tx.cotInstallService.create({
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
  }

  async crearInstalacion(companyId: number | null, dto: CreateCotInstallDto) {
    const cid = this.requireCompany(companyId);
    const i = await this.prisma.$transaction((tx) =>
      this.crearInstalacionTx(tx, cid, dto),
    );
    return mapInstall(i);
  }

  private async actualizarInstalacionTx(
    tx: Tx,
    companyId: number,
    id: number,
    dto: UpdateCotInstallDto,
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
    return tx.cotInstallService.update({ where: { id }, data });
  }

  async actualizarInstalacion(
    companyId: number | null,
    id: number,
    dto: UpdateCotInstallDto,
  ) {
    const cid = this.requireCompany(companyId);
    const i = await this.prisma.$transaction((tx) =>
      this.actualizarInstalacionTx(tx, cid, id, dto),
    );
    return mapInstall(i);
  }

  async desactivarInstalacion(companyId: number | null, id: number) {
    const cid = this.requireCompany(companyId);
    const r = await this.prisma.cotInstallService.updateMany({
      where: { id, companyId: cid },
      data: { isActive: false },
    });
    if (r.count === 0)
      throw new NotFoundException('Servicio de instalación no encontrado');
    return { ok: true };
  }

  // ---------------------------------------------------------------------
  // Edición por lote (editor del catálogo): todo o nada
  // ---------------------------------------------------------------------

  async lote(companyId: number | null, dto: CatalogoLoteDto) {
    const cid = this.requireCompany(companyId);
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
            await this.actualizarProductoTx(tx, cid, id, resto);
            r.productosEditados++;
          }
          for (const n of p.nuevos ?? []) {
            r.productosNuevos.push(
              mapProduct(await this.crearProductoTx(tx, cid, n)),
            );
          }
          if (p.borrados?.length) {
            const d = await tx.cotProduct.updateMany({
              where: { companyId: cid, id: { in: p.borrados } },
              data: { isActive: false },
            });
            r.productosDesactivados = d.count;
          }
        }
        const i = dto.instalaciones;
        if (i) {
          for (const c of i.cambios ?? []) {
            const { id, ...resto } = c;
            await this.actualizarInstalacionTx(tx, cid, id, resto);
            r.instalacionesEditadas++;
          }
          for (const n of i.nuevos ?? []) {
            r.instalacionesNuevas.push(
              mapInstall(await this.crearInstalacionTx(tx, cid, n)),
            );
          }
          if (i.borrados?.length) {
            const d = await tx.cotInstallService.updateMany({
              where: { companyId: cid, id: { in: i.borrados } },
              data: { isActive: false },
            });
            r.instalacionesDesactivadas = d.count;
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
