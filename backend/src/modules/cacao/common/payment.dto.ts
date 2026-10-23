import {
  IsIn,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export const PAYMENT_METHODS = ['TRANSFER', 'CASH', 'CHECK'] as const;

/** Cuerpo de un pago (cuentas por pagar) o de un cobro (cuentas por cobrar). */
export class PaymentDto {
  @IsNumber(
    { maxDecimalPlaces: 2 },
    { message: 'El monto debe tener máximo 2 decimales' },
  )
  @IsPositive({ message: 'El monto debe ser mayor a cero' })
  amount: number;

  @IsIn(PAYMENT_METHODS, { message: 'Método de pago no válido' })
  method: (typeof PAYMENT_METHODS)[number];

  @IsOptional()
  @IsString()
  @MaxLength(120)
  reference?: string;
}

/** Motivo obligatorio al anular un pago o un cobro. */
export class VoidPaymentDto {
  @IsString()
  @MinLength(3, { message: 'Indica el motivo (mínimo 3 caracteres)' })
  @MaxLength(500)
  reason: string;
}

export const round2 = (n: number) =>
  Math.round((n + Number.EPSILON) * 100) / 100;

/** Diferencia máxima que se tolera al comparar montos en dólares. */
export const TOLERANCIA_MONTO = 0.005;
