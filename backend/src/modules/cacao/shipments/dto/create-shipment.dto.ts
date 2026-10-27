import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export const UNIDADES_EMBARQUE = ['KG', 'TON', 'SACO', 'QQ'] as const;

export class ShipmentLotDto {
  @IsInt()
  lotId: number;

  /** Cantidad a embarcar, en la unidad de medida del embarque. */
  @IsNumber()
  @IsPositive({ message: 'La cantidad de cada lote debe ser mayor a cero' })
  quantity: number;

  // El costo y el monto de cada lote los calcula el servidor; se aceptan por compatibilidad
  // con pantallas anteriores, pero se ignoran.
  @IsOptional()
  @IsNumber()
  unitCost?: number;

  @IsOptional()
  @IsNumber()
  saleAmount?: number;
}

export class CreateShipmentDto {
  @IsDateString()
  date: string;

  @IsInt()
  clientId: number;

  @IsString()
  @MinLength(1, { message: 'La referencia del contrato es requerida' })
  @MaxLength(80)
  contractRef: string;

  @IsOptional()
  @IsIn(UNIDADES_EMBARQUE, { message: 'Unidad de medida no válida' })
  unitOfMeasure?: (typeof UNIDADES_EMBARQUE)[number];

  /** Precio de venta en $/kg. */
  @IsNumber()
  @IsPositive({ message: 'El precio de venta debe ser mayor a cero' })
  salePrice: number;

  /** Días de plazo de cobro. Si falta, se usa el de la configuración de la empresa. */
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(365)
  dueDays?: number;

  @IsArray()
  @ArrayMinSize(1, { message: 'Debe incluir al menos un lote' })
  @ValidateNested({ each: true })
  @Type(() => ShipmentLotDto)
  lots: ShipmentLotDto[];

  // Peso, costo y margen totales los calcula el servidor; se aceptan por compatibilidad con
  // pantallas anteriores, pero se ignoran.
  @IsOptional()
  @IsNumber()
  totalWeight?: number;

  @IsOptional()
  @IsNumber()
  totalCost?: number;

  @IsOptional()
  @IsNumber()
  margin?: number;
}
