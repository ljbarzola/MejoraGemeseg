import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
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
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';

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

/** Una pesada de un ticket pesado por tandas, en la unidad de la recepción. */
export class ReceptionWeighingDto {
  @IsNumber()
  @IsPositive({ message: 'El peso bruto de cada pesada debe ser mayor a cero' })
  grossWeight: number;

  @IsNumber()
  @Min(0, { message: 'La tara de cada pesada no puede ser negativa' })
  tare: number;
}

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

  /**
   * Peso bruto en la unidad indicada. Si el ticket se pesó por tandas (`weighings`), no se manda: el
   * servidor suma el de todas las pesadas.
   */
  @ValidateIf((o: { weighings?: unknown[] }) => !o.weighings?.length)
  @IsNumber()
  @IsPositive({ message: 'El peso bruto debe ser mayor a cero' })
  grossWeight?: number;

  /** Tara en la unidad indicada (con tandas, el servidor suma la de cada pesada). */
  @ValidateIf((o: { weighings?: unknown[] }) => !o.weighings?.length)
  @IsNumber()
  @Min(0)
  tare?: number;

  /**
   * Pesadas (tandas) de un mismo ticket: la recepción guarda la suma y el detalle de cada una. Todas
   * van en la unidad de la recepción y del mismo producto (una calidad, un lote).
   */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50, { message: 'Un ticket admite como máximo 50 pesadas' })
  @ValidateNested({ each: true })
  @Type(() => ReceptionWeighingDto)
  weighings?: ReceptionWeighingDto[];

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

  /**
   * La persona ya vio el aviso de que el precio queda fuera del rango de la calidad y decidió
   * registrarlo igual. Sin esto, un precio fuera de rango se rechaza.
   */
  @IsOptional()
  @IsBoolean()
  confirmPriceOutOfRange?: boolean;

  /**
   * Entrega en consignación (se le paga al proveedor después de venderla). Es una marca para las
   * listas y el informe: no cambia las reglas de liquidar.
   */
  @IsOptional()
  @IsBoolean()
  consigned?: boolean;

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
