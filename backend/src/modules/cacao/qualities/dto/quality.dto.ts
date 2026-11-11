import {
  IsBoolean,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class CreateQualityDto {
  @IsString()
  @MinLength(1, { message: 'El nombre es requerido' })
  @MaxLength(80)
  name: string;

  /** Descuento de humedad en %, 0 a 100. */
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  humidityDiscount?: number;

  /** Descuento de impurezas en %, 0 a 100. */
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  impurityDiscount?: number;

  @IsOptional()
  @IsBoolean()
  isFixedPrice?: boolean;

  /** Precio fijo en $/kg; puede venir nulo si la calidad no es de precio fijo. */
  @IsOptional()
  @IsNumber()
  @Min(0)
  fixedPrice?: number | null;

  /** Precio mínimo esperado en $/kg; nulo = sin mínimo. */
  @IsOptional()
  @IsNumber()
  @Min(0)
  minPrice?: number | null;

  /** Precio máximo esperado en $/kg; nulo = sin máximo. */
  @IsOptional()
  @IsNumber()
  @Min(0)
  maxPrice?: number | null;
}

export class UpdateQualityDto {
  @IsOptional()
  @IsString()
  @MinLength(1, { message: 'El nombre es requerido' })
  @MaxLength(80)
  name?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  humidityDiscount?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  impurityDiscount?: number;

  @IsOptional()
  @IsBoolean()
  isFixedPrice?: boolean;

  @IsOptional()
  @IsNumber()
  @Min(0)
  fixedPrice?: number | null;

  @IsOptional()
  @IsNumber()
  @Min(0)
  minPrice?: number | null;

  @IsOptional()
  @IsNumber()
  @Min(0)
  maxPrice?: number | null;
}
