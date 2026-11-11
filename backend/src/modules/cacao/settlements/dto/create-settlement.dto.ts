import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsPositive,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

/**
 * Cómo se piensa pagar lo que queda por pagar de una liquidación. «Crédito» es la parte que se
 * deja a plazo. Es un plan para la persona que paga: el pago real se sigue registrando en
 * Cuentas por pagar.
 */
export const METODOS_PLAN_PAGO = [
  'CASH',
  'TRANSFER',
  'CHECK',
  'CREDIT',
] as const;

export class PaymentPlanLineDto {
  @IsIn(METODOS_PLAN_PAGO, { message: 'Forma de pago no válida' })
  method: (typeof METODOS_PLAN_PAGO)[number];

  @IsNumber(
    { maxDecimalPlaces: 2 },
    { message: 'Cada monto de la forma de pago debe tener máximo 2 decimales' },
  )
  @IsPositive({ message: 'Cada monto de la forma de pago debe ser mayor a cero' })
  amount: number;
}

export class SettlementLotDto {
  @IsInt()
  lotId: number;

  /** Peso bruto a liquidar, en kg, antes de descuentos. */
  @IsNumber()
  @IsPositive()
  quantity: number;

  /** Descuento de humedad en %. Si falta, se usa el de la calidad del lote. */
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  humidityPct?: number;

  /** Descuento de impurezas en %. Si falta, se usa el de la calidad del lote. */
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  impurityPct?: number;

  /** Castigo de calidad en $/kg. */
  @IsOptional()
  @IsNumber()
  @Min(0)
  qualityPunishment?: number;

  /** Se ignora: el servidor usa el costo del lote. Se acepta por compatibilidad. */
  @IsOptional()
  @IsNumber()
  unitCost?: number;
}

export class CreateSettlementDto {
  @IsDateString()
  date: string;

  @IsInt()
  supplierId: number;

  @IsDateString()
  periodStart: string;

  @IsDateString()
  periodEnd: string;

  /** Días de plazo para pagar desde la aprobación. Por defecto 30. */
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(365)
  dueDays?: number;

  @IsArray()
  @ArrayMinSize(1, { message: 'Debe incluir al menos un lote' })
  @ValidateNested({ each: true })
  @Type(() => SettlementLotDto)
  lots: SettlementLotDto[];

  /**
   * Anticipo del proveedor que se descuenta en esta liquidación (en $). No puede superar su saldo
   * disponible ni cubrir toda la liquidación: lo valida el servidor.
   */
  @IsOptional()
  @IsNumber(
    { maxDecimalPlaces: 2 },
    { message: 'El anticipo debe tener máximo 2 decimales' },
  )
  @Min(0, { message: 'El anticipo no puede ser negativo' })
  advanceApplied?: number;

  /** Forma de pago de lo que queda por pagar. Si se manda, debe sumar exactamente ese monto. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(8)
  @ValidateNested({ each: true })
  @Type(() => PaymentPlanLineDto)
  paymentPlan?: PaymentPlanLineDto[];

  // Los totales los calcula el servidor. Se aceptan por compatibilidad con pantallas
  // anteriores, pero se ignoran.
  @IsOptional()
  @IsNumber()
  totalNetWeight?: number;

  @IsOptional()
  @IsNumber()
  totalDeductions?: number;

  @IsOptional()
  @IsNumber()
  finalPrice?: number;

  @IsOptional()
  @IsNumber()
  totalAmount?: number;
}
