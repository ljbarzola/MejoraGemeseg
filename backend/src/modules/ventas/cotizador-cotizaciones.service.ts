import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { CotQuote } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  ChangeCotStatusDto,
  CreateCotQuoteDto,
  UpdateCotQuoteDto,
} from './dto/cotizador.dto';
import {
  CotQuoteAccess,
  MAX_CLIENT_BYTES,
  MAX_ITEMS_BYTES,
  assertJsonSize,
  canDeleteQuote,
  canEditQuote,
  canShareQuote,
  ecuadorToday,
  formatQuoteNumber,
  mapQuote,
  resolveQuoteAccess,
  sanitizeClient,
  sanitizeLines,
  sanitizeMargins,
} from './cotizador.util';

export interface CotActor {
  userId: number;
  role: string;
  companyId: number | null;
}

const esAdmin = (a: CotActor) => a.role === 'ADMIN';

/**
 * Cotizaciones del Cotizador. Las reglas de quién ve y quién modifica son las del
 * cotizador original (sus políticas de seguridad de Supabase), ahora aplicadas aquí:
 *   - dueño:   ve, edita, cambia el estado, elimina y comparte.
 *   - edición total (el dueño se la dio a otra persona): ve, edita y cambia el estado.
 *   - compartida (una cotización puntual): solo la ve y puede crear una copia.
 *   - administrador de la empresa: la ve (solo lectura) y puede crear una copia.
 * El número (COT-AAAAMMDD-NNNN) lo asigna el servidor con una secuencia que no se repite.
 */
@Injectable()
export class CotizadorCotizacionesService {
  constructor(private readonly prisma: PrismaService) {}

  private requireCompany(actor: CotActor): number {
    if (!actor.companyId)
      throw new BadRequestException('Se requiere una empresa');
    return actor.companyId;
  }

  // ---------------------------------------------------------------------
  // Número de cotización
  // ---------------------------------------------------------------------

  private async maxSeq(
    tx: Prisma.TransactionClient,
    companyId: number,
  ): Promise<number> {
    const rows = await tx.$queryRaw<{ m: number }[]>(
      Prisma.sql`SELECT COALESCE(MAX(SUBSTRING("quoteNumber" FROM '-([0-9]+)$')::int), 0)::int AS m
                 FROM "CotQuote"
                 WHERE "companyId" = ${companyId} AND "quoteNumber" ~ '^COT-[0-9]{8}-[0-9]+$'`,
    );
    return rows[0]?.m ?? 0;
  }

  /** Reserva el siguiente número de la secuencia (no se repite aunque se borren cotizaciones). */
  private async reservarSeq(
    tx: Prisma.TransactionClient,
    companyId: number,
  ): Promise<number> {
    const max = await this.maxSeq(tx, companyId);
    const rows = await tx.$queryRaw<{ lastSeq: number }[]>(
      Prisma.sql`INSERT INTO "CotQuoteSequence" ("companyId", "lastSeq")
                 VALUES (${companyId}, ${max + 1})
                 ON CONFLICT ("companyId")
                 DO UPDATE SET "lastSeq" = GREATEST("CotQuoteSequence"."lastSeq", ${max}) + 1
                 RETURNING "lastSeq"`,
    );
    return rows[0].lastSeq;
  }

  /** El número que recibiría la próxima cotización, sin gastarlo (solo para mostrarlo). */
  async siguienteNumero(actor: CotActor, fecha?: string) {
    const cid = this.requireCompany(actor);
    const dia =
      fecha && /^\d{4}-\d{2}-\d{2}$/.test(fecha) ? fecha : ecuadorToday();
    const seq = await this.prisma.$transaction(async (tx) => {
      const max = await this.maxSeq(tx, cid);
      const c = await tx.cotQuoteSequence.findUnique({
        where: { companyId: cid },
      });
      return Math.max(c?.lastSeq ?? 0, max) + 1;
    });
    return { quoteNumber: formatQuoteNumber(dia, seq) };
  }

  // ---------------------------------------------------------------------
  // Acceso
  // ---------------------------------------------------------------------

  private async accesoA(
    actor: CotActor,
    q: CotQuote,
  ): Promise<CotQuoteAccess | null> {
    const [shares, grants] = await Promise.all([
      this.prisma.cotQuoteShare.findMany({
        where: { quoteId: q.id },
        select: { sharedWithId: true },
      }),
      this.prisma.cotEditGrant.findMany({
        where: { ownerId: q.ownerId },
        select: { editorId: true },
      }),
    ]);
    return resolveQuoteAccess({
      userId: actor.userId,
      isAdmin: esAdmin(actor),
      ownerId: q.ownerId,
      sharedWith: shares.map((s) => s.sharedWithId),
      editorsOfOwner: grants.map((g) => g.editorId),
    });
  }

  /** Cotización a la que el usuario tiene acceso; si no la ve, responde 404 (no revela que existe). */
  private async cargar(actor: CotActor, id: number) {
    const cid = this.requireCompany(actor);
    const q = await this.prisma.cotQuote.findFirst({
      where: { id, companyId: cid },
    });
    if (!q) throw new NotFoundException('Cotización no encontrada');
    const access = await this.accesoA(actor, q);
    if (!access) throw new NotFoundException('Cotización no encontrada');
    return { q, access };
  }

  // ---------------------------------------------------------------------
  // Lectura
  // ---------------------------------------------------------------------

  async listar(actor: CotActor) {
    const cid = this.requireCompany(actor);
    const [shares, grants] = await Promise.all([
      this.prisma.cotQuoteShare.findMany({
        where: { companyId: cid, sharedWithId: actor.userId },
        select: { quoteId: true },
      }),
      this.prisma.cotEditGrant.findMany({
        where: { companyId: cid, editorId: actor.userId },
        select: { ownerId: true },
      }),
    ]);
    const sharedIds = new Set(shares.map((s) => s.quoteId));
    const grantOwners = new Set(grants.map((g) => g.ownerId));

    const where: Prisma.CotQuoteWhereInput = esAdmin(actor)
      ? { companyId: cid }
      : {
          companyId: cid,
          OR: [
            { ownerId: actor.userId },
            { id: { in: [...sharedIds] } },
            { ownerId: { in: [...grantOwners] } },
          ],
        };
    const quotes = await this.prisma.cotQuote.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
    const duenos = [...new Set(quotes.map((q) => q.ownerId))];
    const telefonos = new Map(
      (
        await this.prisma.user.findMany({
          where: { id: { in: duenos } },
          select: { id: true, phone: true },
        })
      ).map((u) => [u.id, u.phone]),
    );
    return quotes.map((q) => {
      const access: CotQuoteAccess =
        q.ownerId === actor.userId
          ? 'owner'
          : grantOwners.has(q.ownerId)
            ? 'editor'
            : sharedIds.has(q.id)
              ? 'shared'
              : 'admin';
      return mapQuote(q, access, undefined, telefonos.get(q.ownerId));
    });
  }

  async obtener(actor: CotActor, id: number) {
    const { q, access } = await this.cargar(actor, id);
    return this.mapConTelefono(q, access);
  }

  // mapQuote + el teléfono actual del dueño (una consulta pequeña por cotización).
  private async mapConTelefono(q: CotQuote, access: CotQuoteAccess | null) {
    const dueno = await this.prisma.user.findUnique({
      where: { id: q.ownerId },
      select: { phone: true },
    });
    return mapQuote(q, access, undefined, dueno?.phone ?? null);
  }

  // ---------------------------------------------------------------------
  // Escritura
  // ---------------------------------------------------------------------

  private datosEditables(dto: UpdateCotQuoteDto) {
    const data: Prisma.CotQuoteUncheckedUpdateInput = {};
    if (dto.quoteDate !== undefined) data.quoteDate = new Date(dto.quoteDate);
    if (dto.client !== undefined) {
      const client = sanitizeClient(dto.client);
      assertJsonSize(client, MAX_CLIENT_BYTES, 'Los datos del cliente');
      data.client = client;
    }
    if (dto.items !== undefined) {
      const items = sanitizeLines(dto.items);
      assertJsonSize(items, MAX_ITEMS_BYTES, 'La cotización');
      data.items = items as unknown as Prisma.InputJsonValue;
    }
    if (dto.installMargin !== undefined) data.installMargin = dto.installMargin;
    if (dto.supplierMargins !== undefined)
      data.supplierMargins = sanitizeMargins(dto.supplierMargins);
    if (dto.discountType !== undefined) data.discountType = dto.discountType;
    if (dto.discountValue !== undefined) data.discountValue = dto.discountValue;
    if (dto.conditions !== undefined) data.conditions = dto.conditions;
    if (dto.notes !== undefined) data.notes = dto.notes;
    return data;
  }

  /**
   * ¿Ya existe una cotización con ese número? Devuelve el id solo si el usuario puede editarla
   * (si no, no se revela nada más). La pantalla lo consulta antes de guardar para ofrecer
   * "Actualizar la existente" o "Crear como nueva", igual que el cotizador original.
   */
  async verificarNumero(
    actor: CotActor,
    quoteNumber: string,
    excluirId?: number,
  ) {
    const cid = this.requireCompany(actor);
    const existente = await this.prisma.cotQuote.findFirst({
      where: {
        companyId: cid,
        quoteNumber,
        ...(excluirId ? { id: { not: excluirId } } : {}),
      },
    });
    if (!existente) return { existe: false, existingId: null as number | null };
    const access = await this.accesoA(actor, existente);
    return {
      existe: true,
      existingId: canEditQuote(access) ? existente.id : (null as number | null),
    };
  }

  private async verificarNumeroLibre(
    actor: CotActor,
    quoteNumber: string,
    exceptId?: number,
  ) {
    const r = await this.verificarNumero(actor, quoteNumber, exceptId);
    if (r.existe) {
      throw new ConflictException(
        `Ya existe la cotización ${quoteNumber}. Cambia el número o crea la cotización como nueva.`,
      );
    }
  }

  private async nombreDe(userId: number): Promise<string> {
    const u = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { fullName: true },
    });
    return u?.fullName ?? '';
  }

  private async crearConNumero(
    cid: number,
    ownerId: number,
    vendorName: string,
    quoteDate: string,
    quoteNumber: string | undefined,
    data: Omit<
      Prisma.CotQuoteUncheckedCreateInput,
      'companyId' | 'ownerId' | 'vendorName' | 'quoteNumber' | 'quoteDate'
    >,
  ): Promise<CotQuote> {
    // Con número asignado por el servidor se reintenta si justo chocó con uno tecleado a mano.
    for (let intento = 0; intento < 4; intento++) {
      try {
        return await this.prisma.$transaction(async (tx) => {
          const numero =
            quoteNumber ??
            formatQuoteNumber(quoteDate, await this.reservarSeq(tx, cid));
          return tx.cotQuote.create({
            data: {
              ...data,
              companyId: cid,
              ownerId,
              vendorName,
              quoteNumber: numero,
              quoteDate: new Date(quoteDate),
            },
          });
        });
      } catch (e) {
        const duplicado =
          e instanceof Prisma.PrismaClientKnownRequestError &&
          e.code === 'P2002';
        if (!duplicado) throw e;
        if (quoteNumber) {
          throw new ConflictException(
            `Ya existe la cotización ${quoteNumber}. Cambia el número o crea la cotización como nueva.`,
          );
        }
      }
    }
    throw new ConflictException(
      'No se pudo asignar un número de cotización. Intenta de nuevo.',
    );
  }

  async crear(actor: CotActor, dto: CreateCotQuoteDto) {
    const cid = this.requireCompany(actor);
    const quoteDate = dto.quoteDate ?? ecuadorToday();
    if (dto.quoteNumber)
      await this.verificarNumeroLibre(actor, dto.quoteNumber);
    const base = this.datosEditables(dto);
    const q = await this.crearConNumero(
      cid,
      actor.userId,
      await this.nombreDe(actor.userId),
      quoteDate,
      dto.quoteNumber,
      {
        client: base.client,
        items: base.items,
        status: dto.status ?? 'borrador',
        installMargin: dto.installMargin ?? 35,
        supplierMargins: base.supplierMargins ?? {},
        discountType: dto.discountType ?? 'none',
        discountValue: dto.discountValue ?? 0,
        conditions: dto.conditions ?? '',
        notes: dto.notes ?? '',
      },
    );
    return this.mapConTelefono(q, 'owner');
  }

  async actualizar(actor: CotActor, id: number, dto: UpdateCotQuoteDto) {
    const { q, access } = await this.cargar(actor, id);
    if (!canEditQuote(access))
      throw new ForbiddenException(
        'No tienes permiso para modificar esta cotización',
      );
    if (dto.quoteNumber && dto.quoteNumber !== q.quoteNumber)
      await this.verificarNumeroLibre(actor, dto.quoteNumber, id);
    const data = this.datosEditables(dto);
    if (dto.quoteNumber) data.quoteNumber = dto.quoteNumber;
    // El dueño original y su nombre NO cambian aunque edite alguien con "edición total".
    try {
      const upd = await this.prisma.cotQuote.update({ where: { id }, data });
      return this.mapConTelefono(upd, access);
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2002'
      ) {
        throw new ConflictException(
          `Ya existe la cotización ${dto.quoteNumber}. Cambia el número o crea la cotización como nueva.`,
        );
      }
      throw e;
    }
  }

  async cambiarEstado(actor: CotActor, id: number, dto: ChangeCotStatusDto) {
    const { q, access } = await this.cargar(actor, id);
    if (!canEditQuote(access))
      throw new ForbiddenException(
        'No tienes permiso para cambiar el estado de esta cotización',
      );
    const upd = await this.prisma.cotQuote.update({
      where: { id: q.id },
      data: { status: dto.status },
    });
    return this.mapConTelefono(upd, access);
  }

  async eliminar(actor: CotActor, id: number) {
    const { q, access } = await this.cargar(actor, id);
    if (!canDeleteQuote(access))
      throw new ForbiddenException(
        'Solo quien creó la cotización puede eliminarla',
      );
    await this.prisma.cotQuote.delete({ where: { id: q.id } });
    return { ok: true };
  }

  /** Copia independiente de una cotización que el usuario ve (p. ej. una que le compartieron). */
  async copiar(actor: CotActor, id: number) {
    const cid = this.requireCompany(actor);
    const { q } = await this.cargar(actor, id);
    const copia = await this.crearConNumero(
      cid,
      actor.userId,
      await this.nombreDe(actor.userId),
      ecuadorToday(),
      undefined,
      {
        client: q.client as Prisma.InputJsonValue,
        items: q.items as Prisma.InputJsonValue,
        status: 'borrador',
        installMargin: q.installMargin,
        supplierMargins: q.supplierMargins as Prisma.InputJsonValue,
        discountType: q.discountType,
        discountValue: q.discountValue,
        conditions: q.conditions,
        notes: q.notes,
      },
    );
    return this.mapConTelefono(copia, 'owner');
  }

  // ---------------------------------------------------------------------
  // Compartir una cotización
  // ---------------------------------------------------------------------

  private async usuarioDeLaEmpresa(cid: number, userId: number) {
    const u = await this.prisma.user.findFirst({
      where: { id: userId, companyId: cid, isActive: true },
      select: { id: true, fullName: true },
    });
    if (!u)
      throw new BadRequestException(
        'Ese usuario no existe o no está activo en tu empresa',
      );
    return u;
  }

  /** Personas con las que se puede compartir (usuarios activos de la empresa, menos uno mismo). */
  async usuarios(actor: CotActor) {
    const cid = this.requireCompany(actor);
    const us = await this.prisma.user.findMany({
      where: { companyId: cid, isActive: true, id: { not: actor.userId } },
      select: { id: true, fullName: true, position: true },
      orderBy: { fullName: 'asc' },
    });
    return us.map((u) => ({
      id: u.id,
      fullName: u.fullName,
      position: u.position,
    }));
  }

  async compartidos(actor: CotActor, id: number) {
    const { q, access } = await this.cargar(actor, id);
    if (!canShareQuote(access) && access !== 'admin')
      throw new ForbiddenException(
        'Solo quien creó la cotización puede ver con quién la compartió',
      );
    const shares = await this.prisma.cotQuoteShare.findMany({
      where: { quoteId: q.id },
      orderBy: { createdAt: 'asc' },
    });
    const users = await this.prisma.user.findMany({
      where: { id: { in: shares.map((s) => s.sharedWithId) } },
      select: { id: true, fullName: true },
    });
    const nombre = new Map(users.map((u) => [u.id, u.fullName]));
    return shares.map((s) => ({
      userId: s.sharedWithId,
      fullName: nombre.get(s.sharedWithId) ?? '',
      createdAt: s.createdAt,
    }));
  }

  async compartir(actor: CotActor, id: number, userId: number) {
    const cid = this.requireCompany(actor);
    const { q, access } = await this.cargar(actor, id);
    if (!canShareQuote(access))
      throw new ForbiddenException(
        'Solo quien creó la cotización puede compartirla',
      );
    if (userId === q.ownerId)
      throw new BadRequestException('No hace falta compartírtela a ti mismo');
    const u = await this.usuarioDeLaEmpresa(cid, userId);
    await this.prisma.cotQuoteShare.upsert({
      where: { quoteId_sharedWithId: { quoteId: q.id, sharedWithId: u.id } },
      create: {
        companyId: cid,
        quoteId: q.id,
        ownerId: q.ownerId,
        sharedWithId: u.id,
      },
      update: {},
    });
    return { userId: u.id, fullName: u.fullName };
  }

  async quitarComparticion(actor: CotActor, id: number, userId: number) {
    const { q, access } = await this.cargar(actor, id);
    if (!canShareQuote(access))
      throw new ForbiddenException(
        'Solo quien creó la cotización puede dejar de compartirla',
      );
    await this.prisma.cotQuoteShare.deleteMany({
      where: { quoteId: q.id, sharedWithId: userId },
    });
    return { ok: true };
  }

  // ---------------------------------------------------------------------
  // Edición total (todas mis cotizaciones, presentes y futuras)
  // ---------------------------------------------------------------------

  async accesosEdicion(actor: CotActor) {
    const cid = this.requireCompany(actor);
    const [otorgados, recibidos] = await Promise.all([
      this.prisma.cotEditGrant.findMany({
        where: { companyId: cid, ownerId: actor.userId },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.cotEditGrant.findMany({
        where: { companyId: cid, editorId: actor.userId },
        orderBy: { createdAt: 'asc' },
      }),
    ]);
    const ids = [
      ...otorgados.map((g) => g.editorId),
      ...recibidos.map((g) => g.ownerId),
    ];
    const users = await this.prisma.user.findMany({
      where: { id: { in: ids } },
      select: { id: true, fullName: true },
    });
    const nombre = new Map(users.map((u) => [u.id, u.fullName]));
    return {
      otorgados: otorgados.map((g) => ({
        userId: g.editorId,
        fullName: nombre.get(g.editorId) ?? '',
        createdAt: g.createdAt,
      })),
      recibidos: recibidos.map((g) => ({
        userId: g.ownerId,
        fullName: nombre.get(g.ownerId) ?? '',
        createdAt: g.createdAt,
      })),
    };
  }

  async darAccesoEdicion(actor: CotActor, userId: number) {
    const cid = this.requireCompany(actor);
    if (userId === actor.userId)
      throw new BadRequestException('No hace falta darte acceso a ti mismo');
    const u = await this.usuarioDeLaEmpresa(cid, userId);
    await this.prisma.cotEditGrant.upsert({
      where: { ownerId_editorId: { ownerId: actor.userId, editorId: u.id } },
      create: { companyId: cid, ownerId: actor.userId, editorId: u.id },
      update: {},
    });
    return { userId: u.id, fullName: u.fullName };
  }

  async quitarAccesoEdicion(actor: CotActor, userId: number) {
    const cid = this.requireCompany(actor);
    await this.prisma.cotEditGrant.deleteMany({
      where: { companyId: cid, ownerId: actor.userId, editorId: userId },
    });
    return { ok: true };
  }
}
