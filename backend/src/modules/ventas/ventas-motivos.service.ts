import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

// En qué cierres aparece un motivo. Los valores gobiernan la lógica (no son
// editables); el catálogo de motivos sí lo edita cada empresa.
export const MOTIVO_KINDS = [
  'LEAD_DESCARTE', // se descarta un lead
  'OPP_PERDIDA', // se rechaza una oportunidad
  'CONTRATO_CANCELADO', // se cancela un contrato
  'CONTRATO_REDUCCION', // se renueva con menos servicios o con menor valor
  'CONTRATO_NO_RENOVADO', // el contrato venció sin renovarse
] as const;
export type MotivoKind = (typeof MOTIVO_KINDS)[number];

export const ETIQUETA_KIND: Record<MotivoKind, string> = {
  LEAD_DESCARTE: 'Lead descartado',
  OPP_PERDIDA: 'Oportunidad perdida',
  CONTRATO_CANCELADO: 'Contrato cancelado',
  CONTRATO_REDUCCION: 'Contrato renovado con menos',
  CONTRATO_NO_RENOVADO: 'Contrato vencido sin renovar',
};

// Quién dio el motivo. Los estudios de win/loss muestran que el motivo que
// anota el vendedor coincide poco con el real, así que se guarda el origen y el
// agente de ventas lo trata como hipótesis cuando es VENDEDOR.
export const MOTIVO_ORIGENES = ['CLIENTE', 'VENDEDOR'] as const;
export type MotivoOrigen = (typeof MOTIVO_ORIGENES)[number];

export interface MotivoInput {
  reasonId?: number;
  comment?: string;
  source?: string;
}

// Referencias opcionales de lo que se está cerrando.
export interface MotivoRefs {
  leadId?: number;
  opportunityId?: number;
  agreementId?: number;
  salesClientId?: number;
  detail?: Prisma.InputJsonValue;
}

// Lo mínimo que hace falta del cliente de Prisma, para poder correr dentro de
// una transacción (`tx`) o fuera de ella.
type Db = Pick<PrismaService, 'salesReason' | 'salesReasonEntry'>;

const MAX_COMENTARIO = 1000;
const MAX_LABEL = 80;

const TODOS_LOS_CIERRES = [...MOTIVO_KINDS];
const CONTRATOS = ['CONTRATO_CANCELADO', 'CONTRATO_REDUCCION', 'CONTRATO_NO_RENOVADO'];

// Motivos de fábrica. Los `isSystem` no se borran, no se desactivan ni se
// renombran: el sistema depende de ellos («Sin información» para no obligar a
// inventar un motivo; «Otro» con comentario; los de descarte de leads).
const MOTIVOS_DE_FABRICA: {
  label: string;
  kinds: string[];
  isSystem?: boolean;
  isNoInfo?: boolean;
  requiresComment?: boolean;
}[] = [
  { label: 'Sin información', kinds: TODOS_LOS_CIERRES, isSystem: true, isNoInfo: true },
  { label: 'Otro', kinds: TODOS_LOS_CIERRES, isSystem: true, requiresComment: true },
  { label: 'Postulante a empleo', kinds: ['LEAD_DESCARTE'], isSystem: true },
  { label: 'Proveedor', kinds: ['LEAD_DESCARTE'], isSystem: true },
  { label: 'Spam', kinds: ['LEAD_DESCARTE'], isSystem: true },
  { label: 'Contacto duplicado', kinds: ['LEAD_DESCARTE'], isSystem: true },
  // Llenó el formulario y nunca contestó: no avanza a la siguiente fase (2026-10-08).
  // Al ser de sistema, `ensureDefaultReasons` también se lo agrega a las empresas que ya tenían catálogo.
  { label: 'No contestó', kinds: ['LEAD_DESCARTE'], isSystem: true },
  { label: 'Precio', kinds: ['OPP_PERDIDA', ...CONTRATOS] },
  { label: 'Eligió a la competencia', kinds: ['OPP_PERDIDA', 'CONTRATO_CANCELADO', 'CONTRATO_NO_RENOVADO'] },
  { label: 'Sin presupuesto', kinds: ['OPP_PERDIDA', 'CONTRATO_REDUCCION', 'CONTRATO_NO_RENOVADO'] },
  { label: 'Servicio que no cubrimos', kinds: ['OPP_PERDIDA', 'LEAD_DESCARTE'] },
  { label: 'Mala experiencia con el servicio', kinds: CONTRATOS },
  { label: 'Tardamos en responder o cotizar', kinds: ['OPP_PERDIDA'] },
  { label: 'Sin respuesta del cliente', kinds: ['OPP_PERDIDA', 'LEAD_DESCARTE'] },
  { label: 'Cambió de prioridades', kinds: ['OPP_PERDIDA', ...CONTRATOS] },
  { label: 'Cierre o reducción de su operación', kinds: CONTRATOS },
  { label: 'Lo resolvió por su cuenta', kinds: ['OPP_PERDIDA', ...CONTRATOS] },
];

@Injectable()
export class VentasMotivosService {
  constructor(private readonly prisma: PrismaService) {}

  private requireCompany(companyId: number | null): number {
    if (!companyId) throw new BadRequestException('Se requiere una empresa');
    return companyId;
  }

  // Se siembra la primera vez que la empresa lo pide (mismo patrón que
  // ensureDefaultStages / ensureDefaultServices). Si la empresa ya tiene
  // motivos no se toca nada; solo se garantiza que existan los de sistema.
  async ensureDefaultReasons(companyId: number): Promise<void> {
    const total = await this.prisma.salesReason.count({ where: { companyId } });
    if (total === 0) {
      await this.prisma.salesReason.createMany({
        data: MOTIVOS_DE_FABRICA.map((m, i) => ({
          companyId,
          label: m.label,
          kinds: m.kinds,
          order: i,
          isSystem: !!m.isSystem,
          isNoInfo: !!m.isNoInfo,
          requiresComment: !!m.requiresComment,
        })),
        skipDuplicates: true,
      });
      return;
    }
    const sistema = MOTIVOS_DE_FABRICA.filter((m) => m.isSystem);
    const existentes = await this.prisma.salesReason.findMany({
      where: { companyId, isSystem: true },
      select: { label: true },
    });
    const faltan = sistema.filter(
      (m) => !existentes.some((e) => e.label === m.label),
    );
    if (faltan.length > 0) {
      await this.prisma.salesReason.createMany({
        data: faltan.map((m, i) => ({
          companyId,
          label: m.label,
          kinds: m.kinds,
          order: 1000 + i,
          isSystem: true,
          isNoInfo: !!m.isNoInfo,
          requiresComment: !!m.requiresComment,
        })),
        skipDuplicates: true,
      });
    }
  }

  async list(
    companyId: number | null,
    opts: { kind?: string; incluirInactivos?: boolean } = {},
  ) {
    const cid = this.requireCompany(companyId);
    await this.ensureDefaultReasons(cid);
    const where: Prisma.SalesReasonWhereInput = { companyId: cid };
    if (!opts.incluirInactivos) where.isActive = true;
    if (opts.kind) where.kinds = { has: opts.kind };
    return this.prisma.salesReason.findMany({
      where,
      orderBy: [{ order: 'asc' }, { label: 'asc' }],
    });
  }

  private limpiarKinds(kinds: string[] | undefined): string[] {
    const lista = [...new Set(kinds || [])];
    if (lista.length === 0) {
      throw new BadRequestException('Elige en qué cierres se usa este motivo.');
    }
    const invalido = lista.find((k) => !(MOTIVO_KINDS as readonly string[]).includes(k));
    if (invalido) throw new BadRequestException('Alguno de los cierres elegidos no existe.');
    return lista;
  }

  private limpiarLabel(raw: string | undefined): string {
    const label = (raw || '').trim();
    if (!label) throw new BadRequestException('Escribe el nombre del motivo.');
    if (label.length > MAX_LABEL) {
      throw new BadRequestException(`El nombre no puede pasar de ${MAX_LABEL} caracteres.`);
    }
    return label;
  }

  async create(
    companyId: number | null,
    dto: { label: string; kinds: string[]; requiresComment?: boolean },
  ) {
    const cid = this.requireCompany(companyId);
    const label = this.limpiarLabel(dto.label);
    const kinds = this.limpiarKinds(dto.kinds);
    const repetido = await this.prisma.salesReason.findFirst({
      where: { companyId: cid, label: { equals: label, mode: 'insensitive' } },
    });
    if (repetido) throw new BadRequestException('Ya existe un motivo con ese nombre.');
    const ultimo = await this.prisma.salesReason.aggregate({
      where: { companyId: cid },
      _max: { order: true },
    });
    return this.prisma.salesReason.create({
      data: {
        companyId: cid,
        label,
        kinds,
        requiresComment: !!dto.requiresComment,
        order: (ultimo._max.order ?? -1) + 1,
      },
    });
  }

  async update(
    companyId: number | null,
    id: number,
    dto: { label?: string; kinds?: string[]; requiresComment?: boolean; isActive?: boolean },
  ) {
    const cid = this.requireCompany(companyId);
    const actual = await this.prisma.salesReason.findFirst({ where: { id, companyId: cid } });
    if (!actual) throw new NotFoundException('Motivo no encontrado');
    if (actual.isSystem) {
      throw new BadRequestException(
        'Este motivo lo usa el sistema y no se puede modificar ni desactivar.',
      );
    }
    const data: Prisma.SalesReasonUpdateInput = {};
    if (dto.label !== undefined) {
      const label = this.limpiarLabel(dto.label);
      const repetido = await this.prisma.salesReason.findFirst({
        where: { companyId: cid, id: { not: id }, label: { equals: label, mode: 'insensitive' } },
      });
      if (repetido) throw new BadRequestException('Ya existe un motivo con ese nombre.');
      data.label = label;
    }
    if (dto.kinds !== undefined) data.kinds = this.limpiarKinds(dto.kinds);
    if (dto.requiresComment !== undefined) data.requiresComment = dto.requiresComment;
    if (dto.isActive !== undefined) data.isActive = dto.isActive;
    return this.prisma.salesReason.update({ where: { id }, data });
  }

  async remove(companyId: number | null, id: number) {
    const cid = this.requireCompany(companyId);
    const actual = await this.prisma.salesReason.findFirst({ where: { id, companyId: cid } });
    if (!actual) throw new NotFoundException('Motivo no encontrado');
    if (actual.isSystem) {
      throw new BadRequestException('Este motivo lo usa el sistema y no se puede eliminar.');
    }
    const usos = await this.prisma.salesReasonEntry.count({
      where: { companyId: cid, reasonId: id },
    });
    if (usos > 0) {
      throw new BadRequestException(
        `Este motivo ya se usó en ${usos} cierre(s). Desactívalo en lugar de eliminarlo: deja de ofrecerse pero se conserva en lo ya registrado.`,
      );
    }
    await this.prisma.salesReason.delete({ where: { id } });
    return { success: true };
  }

  /**
   * Valida un motivo de cierre y lo registra. Es la ÚNICA puerta por la que se
   * guarda un motivo, para que las reglas sean las mismas en leads,
   * oportunidades y contratos:
   *  - el motivo existe, es de la empresa, está activo y aplica a ese cierre;
   *  - «Otro» (u otro marcado así) exige comentario;
   *  - se exige «quién lo dijo», salvo en «Sin información».
   * Acepta el cliente de Prisma de una transacción (`db`) para que el motivo se
   * guarde junto con el cierre que explica.
   */
  async registrar(
    db: Db,
    companyId: number,
    userId: number,
    kind: MotivoKind,
    input: MotivoInput | undefined,
    refs: MotivoRefs = {},
  ) {
    if (!input || !input.reasonId) {
      throw new BadRequestException(
        'Elige el motivo del cierre. Si no se sabe, elige «Sin información».',
      );
    }
    const motivo = await db.salesReason.findFirst({
      where: { id: Number(input.reasonId), companyId },
    });
    if (!motivo || !motivo.isActive || !motivo.kinds.includes(kind)) {
      throw new BadRequestException('Ese motivo no está disponible para este cierre.');
    }
    const comment = (input.comment || '').trim();
    if (comment.length > MAX_COMENTARIO) {
      throw new BadRequestException(
        `El comentario no puede pasar de ${MAX_COMENTARIO} caracteres.`,
      );
    }
    if (motivo.requiresComment && !comment) {
      throw new BadRequestException(
        `Con el motivo «${motivo.label}» hay que escribir un comentario.`,
      );
    }
    let source: MotivoOrigen | null = null;
    if (!motivo.isNoInfo) {
      if (!(MOTIVO_ORIGENES as readonly string[]).includes(input.source || '')) {
        throw new BadRequestException(
          'Indica quién dio este motivo: el cliente, o es una suposición del vendedor.',
        );
      }
      source = input.source as MotivoOrigen;
    }
    return db.salesReasonEntry.create({
      data: {
        companyId,
        kind,
        reasonId: motivo.id,
        reasonLabel: motivo.label,
        comment: comment || null,
        source,
        leadId: refs.leadId ?? null,
        opportunityId: refs.opportunityId ?? null,
        agreementId: refs.agreementId ?? null,
        salesClientId: refs.salesClientId ?? null,
        detail: refs.detail ?? Prisma.JsonNull,
        createdBy: userId,
      },
    });
  }
}
