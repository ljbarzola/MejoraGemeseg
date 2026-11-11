import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { saldoAnticipos } from '../common/anticipos.util';
import { round2, TOLERANCIA_MONTO } from '../common/payment.dto';
import { CreateAdvanceDto } from './dto/advance.dto';

/**
 * Anticipos a proveedores: dinero que se le adelanta a un proveedor y se descuenta cuando se le
 * liquida. Aquí solo se REGISTRA el adelanto (no pasa por la autorización de pagos de las cuentas
 * por pagar, que son deudas ya liquidadas). El saldo nunca se guarda: ver anticipos.util.ts.
 */
@Injectable()
export class CacaoSupplierAdvancesService {
  constructor(private readonly prisma: PrismaService) {}

  /** Movimientos de un proveedor y su saldo disponible. */
  async list(supplierId: number, companyId: number) {
    await this.findProveedor(supplierId, companyId);
    const [anticipos, saldo] = await Promise.all([
      this.prisma.cacaoSupplierAdvance.findMany({
        where: { supplierId, companyId },
        orderBy: [{ date: 'desc' }, { id: 'desc' }],
      }),
      saldoAnticipos(this.prisma, companyId, supplierId),
    ]);
    return { saldo, anticipos };
  }

  async create(dto: CreateAdvanceDto, companyId: number, userId: number) {
    await this.findProveedor(dto.supplierId, companyId);
    const creado = await this.prisma.cacaoSupplierAdvance.create({
      data: {
        companyId,
        supplierId: dto.supplierId,
        date: new Date(dto.date),
        amount: round2(dto.amount),
        method: dto.method,
        reference: dto.reference?.trim() || null,
        note: dto.note?.trim() || null,
        createdBy: userId,
      },
    });
    return {
      anticipo: creado,
      saldo: await saldoAnticipos(this.prisma, companyId, dto.supplierId),
    };
  }

  /**
   * Anula un anticipo registrado por error. Solo si su monto no se ha descontado ya en una
   * liquidación vigente: si no, el saldo quedaría negativo y la deuda de esa liquidación sería
   * incorrecta (primero hay que rechazar o anular esa liquidación).
   */
  async void(id: number, reason: string, companyId: number, userId: number) {
    const supplierId = await this.prisma.$transaction(async (tx) => {
      const anticipo = await tx.cacaoSupplierAdvance.findFirst({
        where: { id, companyId },
      });
      if (!anticipo) throw new NotFoundException('Anticipo no encontrado');
      // Mismo bloqueo que usa una liquidación al descontar: no se anula mientras se está descontando.
      await tx.$queryRaw`SELECT "id" FROM "CacaoSupplier" WHERE "id" = ${anticipo.supplierId} FOR UPDATE`;

      const actual = await tx.cacaoSupplierAdvance.findUnique({ where: { id } });
      if (actual?.voidedAt) {
        throw new BadRequestException('Este anticipo ya está anulado');
      }
      const saldo = await saldoAnticipos(tx, companyId, anticipo.supplierId);
      if (saldo - anticipo.amount < -TOLERANCIA_MONTO) {
        throw new BadRequestException(
          `Este anticipo ya se descontó en una liquidación vigente (saldo actual $${saldo.toFixed(2)}): rechaza o anula esa liquidación antes de anularlo`,
        );
      }
      await tx.cacaoSupplierAdvance.update({
        where: { id },
        data: {
          voidedAt: new Date(),
          voidedBy: userId,
          voidReason: reason.trim(),
        },
      });
      return anticipo.supplierId;
    });
    return this.list(supplierId, companyId);
  }

  private async findProveedor(id: number, companyId: number) {
    const supplier = await this.prisma.cacaoSupplier.findFirst({
      where: { id, companyId },
      select: { id: true },
    });
    if (!supplier) throw new NotFoundException('Proveedor no encontrado');
  }
}
