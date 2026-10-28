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
import { Transform } from 'class-transformer';

export const UNIDADES_RECEPCION = ['KG', 'TON', 'SACO', 'QQ'] as const;

/**
 * Cómo se pesó la entrega: por bultos (se cuentan y pesan los sacos) o en báscula (camión o
 * plataforma). Es un dato del ticket de pesaje, no cambia ningún cálculo.
 */
export const PERFILES_PESAJE = ['BULTOS', 'BASCULA'] as const;

/** Un texto opcional: se recorta y, si queda vacío, se trata como «no se mandó». */
const textoOpcional = ({ value }: { value: unknown }) => {
  if (typeof value !== 'string') return value;
  const recortado = value.trim();
  return recortado === '' ? undefined : recortado;
};

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

  // ─── Datos del ticket de pesaje (todos opcionales) ───

  /** Número del ticket que imprimió la báscula o el comprobante de pesaje. Único por empresa. */
  @IsOptional()
  @Transform(textoOpcional)
  @IsString()
  @MaxLength(40, {
    message: 'El número de ticket admite como máximo 40 caracteres',
  })
  ticketNumber?: string;

  /** Cómo se pesó: BULTOS o BASCULA. */
  @IsOptional()
  @IsIn(PERFILES_PESAJE, { message: 'El perfil de pesaje no es válido' })
  weighingProfile?: (typeof PERFILES_PESAJE)[number];

  /**
   * Punto de acopio donde se recibió la entrega. Es obligatorio apenas la empresa tiene algún
   * punto activo; mientras no tenga ninguno, no se pide.
   */
  @IsOptional()
  @IsInt({ message: 'Selecciona el punto de acopio' })
  puntoId?: number;

  /** Quién transportó la entrega. */
  @IsOptional()
  @Transform(textoOpcional)
  @IsString()
  @MaxLength(80, {
    message: 'El nombre del chofer admite como máximo 80 caracteres',
  })
  driverName?: string;

  /** Placa del vehículo; se guarda en mayúsculas y sin espacios en los extremos. */
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => {
    const t = textoOpcional({ value });
    return typeof t === 'string' ? t.toUpperCase() : t;
  })
  @IsString()
  @MaxLength(15, { message: 'La placa admite como máximo 15 caracteres' })
  vehiclePlate?: string;
}
