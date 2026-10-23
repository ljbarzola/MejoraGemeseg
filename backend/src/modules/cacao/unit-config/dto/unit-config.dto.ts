import {
  IsBoolean,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateUnitConfigDto {
  /** Nombre interno, ej. SACO_ESTANDAR. */
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  name: string;

  /** Nombre que ve el usuario, ej. «Saco estándar». */
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  displayName: string;

  /** Kilogramos que pesa una unidad (un saco). */
  @IsNumber()
  @IsPositive({ message: 'El peso por unidad debe ser mayor a cero' })
  kgPerUnit: number;

  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}

export class UpdateUnitConfigDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  name?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  displayName?: string;

  @IsOptional()
  @IsNumber()
  @IsPositive({ message: 'El peso por unidad debe ser mayor a cero' })
  kgPerUnit?: number;

  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}
