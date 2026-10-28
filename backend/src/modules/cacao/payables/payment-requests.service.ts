import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { CacaoConfigService } from '../config/cacao-config.service';
import { CacaoPayablesService } from './payables.service';
import { PaymentDto, round2, TOLERANCIA_MONTO } from '../common/payment.dto';

/** Estados de una solicitud que todavía comprometen parte del saldo de la cuenta. */
export const ESTADOS_ABIERTOS = ['REQUESTED', 'AUTHORIZED'];

const MSG_PAGO_DIRECTO =
  'Tu empresa exige autorización para pagar: solicita el pago y que otra persona lo autorice';

/**
 * Pagos con autorización. Si la empresa lo activa (Cacao → Configuración → Pagos), un pago a un
 * proveedor pasa por tres pasos: alguien lo SOLICITA, otra persona lo AUTORIZA (distinta de quien
 * lo pidió) y recién entonces se PAGA, que es lo que mueve el saldo de la cuenta. Es el mismo
 * estilo que la aprobación de liquidaciones.
 */
@Injectable()
export class CacaoPaymentRequestsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: CacaoConfigService,
    private readonly payables: CacaoPayablesService,
  ) {}

  /** Si la empresa exige autorización, el pago directo está cerrado. */
  async asegurarPagoDirecto(companyId: number) {
    if (await this.config.pagosRequierenAutorizacion(companyId)) {
      throw new BadRequestException(MSG_PAGO_DIRECTO);
    }
  }

  async list(companyId: number, status?: string, id?: number) {
    const where: Prisma.CacaoPaymentRequestWhereInput = { companyId };
    if (status) where.status = status;
    if (id !== undefined) where.id = id;
    const solicitudes = await this.prisma.cacaoPaymentRequest.findMany({
      where,
      include: {
        payable: {
          include: { supplier: true, settlement: { select: { id: true } } },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    // Los nombres de quienes intervinieron, para que la pantalla diga «solicitó Fulano».
    const ids = new Set<number>();
    for (const s of solicitudes) {
      ids.add(s.requestedBy);
      if (s.decidedBy) ids.add(s.decidedBy);
      if (s.paidBy) ids.add(s.paidBy);
    }
    const usuarios = ids.size
      ? await this.prisma.user.findMany({
          where: { id: { in: [...ids] } },
          select: { id: true, fullName: true },
        })
      : [];
    const nombre = new Map(usuarios.map((u) => [u.id, u.fullName]));
    return solicitudes.map((s) => ({
      ...s,
      requestedByName: nombre.get(s.requestedBy) ?? null,
      decidedByName: s.decidedBy ? (nombre.get(s.decidedBy) ?? null) : null,
      paidByName: s.paidBy ? (nombre.get(s.paidBy) ?? null) : null,
    }));
  }

  /**
   * Pide un pago. Con la cuenta bloqueada se comprueba que el monto no supere el saldo menos lo
   * que ya está pedido o autorizado, así dos solicitudes no pueden pedir más de lo que se debe.
   */
  async create(
    payableId: number,
    dto: PaymentDto,
    companyId: number,
    userId: number,
  ) {
    if (!(await this.config.pagosRequierenAutorizacion(companyId))) {
      throw new BadRequestException(
        'Tu empresa paga directo: registra el pago desde la cuenta (para pedir autorización, actívala en Configuración)',
      );
    }
    const amount = round2(dto.amount);

    const creada = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "CacaoPayable" WHERE "id" = ${payableId} AND "companyId" = ${companyId} FOR UPDATE`;

      const payable = await tx.cacaoPayable.findFirst({
        where: { id: payableId, companyId },
        include: { settlement: true },
      });
      if (!payable)
        throw new NotFoundException('Cuenta por pagar no encontrada');
      if (payable.status === 'PAID')
        throw new BadRequestException('Ya está pagada');
      if (payable.status === 'CANCELLED')
        throw new BadRequestException('La cuenta por pagar fue anulada');
      if (payable.settlement.status !== 'APPROVED')
        throw new BadRequestException(
          'La liquidación aún no está aprobada, no se puede pagar',
        );

      const abiertas = await tx.cacaoPaymentRequest.aggregate({
        where: { payableId, status: { in: ESTADOS_ABIERTOS } },
        _sum: { amount: true },
      });
      const libre = round2(
        payable.totalAmount - payable.paidAmount - (abiertas._sum.amount ?? 0),
      );
      if (amount > libre + TOLERANCIA_MONTO) {
        throw new BadRequestException(
          `El monto excede lo que falta por pagar sin solicitud ($${Math.max(0, libre).toFixed(2)})`,
        );
      }

      return tx.cacaoPaymentRequest.create({
        data: {
          companyId,
          payableId,
          amount,
          method: dto.method,
          reference: dto.reference?.trim() || null,
          requestedBy: userId,
        },
      });
    });
    return this.uno(creada.id, companyId);
  }

  /** Autoriza una solicitud pendiente. No la puede autorizar quien la pidió. */
  async authorize(id: number, companyId: number, userId: number) {
    const solicitud = await this.buscar(id, companyId);
    if (solicitud.status !== 'REQUESTED') {
      throw new BadRequestException(
        'Solo se puede autorizar una solicitud pendiente de autorización',
      );
    }
    if (solicitud.requestedBy === userId) {
      throw new ForbiddenException(
        'El pago debe autorizarlo otra persona, no quien lo solicitó',
      );
    }
    const decidida = await this.prisma.cacaoPaymentRequest.updateMany({
      where: { id, companyId, status: 'REQUESTED' },
      data: { status: 'AUTHORIZED', decidedBy: userId, decidedAt: new Date() },
    });
    if (decidida.count === 0) {
      throw new BadRequestException(
        'La solicitud ya fue decidida por otra persona',
      );
    }
    return this.uno(id, companyId);
  }

  /** Rechaza una solicitud pendiente, con motivo. Tampoco la rechaza quien la pidió (eso es cancelarla). */
  async reject(id: number, companyId: number, userId: number, reason: string) {
    const solicitud = await this.buscar(id, companyId);
    if (solicitud.status !== 'REQUESTED') {
      throw new BadRequestException(
        'Solo se puede rechazar una solicitud pendiente de autorización',
      );
    }
    if (solicitud.requestedBy === userId) {
      throw new ForbiddenException(
        'La solicitud debe rechazarla otra persona; si quieres retirarla, cancélala',
      );
    }
    const decidida = await this.prisma.cacaoPaymentRequest.updateMany({
      where: { id, companyId, status: 'REQUESTED' },
      data: {
        status: 'REJECTED',
        decidedBy: userId,
        decidedAt: new Date(),
        decisionReason: reason.trim(),
      },
    });
    if (decidida.count === 0) {
      throw new BadRequestException(
        'La solicitud ya fue decidida por otra persona',
      );
    }
    return this.uno(id, companyId);
  }

  /**
   * Retira una solicitud que aún no se pagó. La puede cancelar quien la pidió o un administrador;
   * si ya estaba autorizada, la autorización se pierde y el saldo queda libre otra vez.
   */
  async cancel(
    id: number,
    companyId: number,
    userId: number,
    esAdmin: boolean,
    reason?: string,
  ) {
    const solicitud = await this.buscar(id, companyId);
    if (!ESTADOS_ABIERTOS.includes(solicitud.status)) {
      throw new BadRequestException(
        'Solo se puede cancelar una solicitud que aún no se pagó',
      );
    }
    if (solicitud.requestedBy !== userId && !esAdmin) {
      throw new ForbiddenException(
        'Solo quien pidió el pago o un administrador puede cancelarlo',
      );
    }
    const cancelada = await this.prisma.cacaoPaymentRequest.updateMany({
      where: { id, companyId, status: { in: ESTADOS_ABIERTOS } },
      data: {
        status: 'CANCELLED',
        decidedBy: userId,
        decidedAt: new Date(),
        decisionReason: reason?.trim() || null,
      },
    });
    if (cancelada.count === 0) {
      throw new BadRequestException('La solicitud ya cambió de estado');
    }
    return this.uno(id, companyId);
  }

  /** Paga una solicitud autorizada: registra el pago con los datos que se autorizaron. */
  async pay(id: number, companyId: number, userId: number) {
    const solicitud = await this.buscar(id, companyId);
    if (solicitud.status !== 'AUTHORIZED') {
      throw new BadRequestException(
        solicitud.status === 'PAID'
          ? 'Esta solicitud ya se pagó'
          : 'Solo se puede pagar una solicitud autorizada',
      );
    }
    await this.payables.pay(
      solicitud.payableId,
      {
        amount: solicitud.amount,
        method: solicitud.method as PaymentDto['method'],
        reference: solicitud.reference ?? undefined,
      },
      companyId,
      userId,
      id,
    );
    return this.uno(id, companyId);
  }

  private async buscar(id: number, companyId: number) {
    const solicitud = await this.prisma.cacaoPaymentRequest.findFirst({
      where: { id, companyId },
    });
    if (!solicitud)
      throw new NotFoundException('Solicitud de pago no encontrada');
    return solicitud;
  }

  private async uno(id: number, companyId: number) {
    return (await this.list(companyId, undefined, id))[0];
  }
}
