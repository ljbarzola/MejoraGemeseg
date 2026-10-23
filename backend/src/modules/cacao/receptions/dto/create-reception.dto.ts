import {
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
} from 'class-validator';

export const UNIDADES_RECEPCION = ['KG', 'TON', 'SACO'] as const;

export class CreateReceptionDto {
  @IsDateString()
  date: string;

  @IsInt()
  supplierId: number;

  @IsString()
  @MinLength(1, { message: 'La guía de remisión es requerida' })
  @MaxLength(60)
  guideNumber: string;

  @IsOptional()
  @IsIn(UNIDADES_RECEPCION, { message: 'Unidad de medida no válida' })
  unitOfMeasure?: (typeof UNIDADES_RECEPCION)[number];

  /** Peso bruto en la unidad indicada. */
  @IsNumber()
  @IsPositive({ message: 'El peso bruto debe ser mayor a cero' })
  grossWeight: number;

  /** Tara en la unidad indicada. */
  @IsNumber()
  @Min(0)
  tare: number;

  /** Humedad medida, en %. */
  @IsNumber()
  @Min(0)
  @Max(100)
  humidity: number;

  /** Impurezas medidas, en %. */
  @IsNumber()
  @Min(0)
  @Max(100)
  impurities: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  provisionalPrice?: number;

  @IsOptional()
  @IsNumber()
  differential?: number;

  /** Calidad del cacao recibido: es obligatoria y debe ser de la empresa. */
  @IsInt({ message: 'Selecciona la calidad del cacao' })
  qualityId: number;

  @IsOptional()
  @IsInt()
  lotId?: number;
}
