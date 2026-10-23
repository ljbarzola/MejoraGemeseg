import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsInt,
  IsNumber,
  IsOptional,
  IsPositive,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

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
