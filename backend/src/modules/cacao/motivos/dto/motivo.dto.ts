import {
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { Transform } from 'class-transformer';

export const TIPOS_MOTIVO = ['LIQUIDACION', 'PAGO'] as const;
export type TipoMotivo = (typeof TIPOS_MOTIVO)[number];

const recortar = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class CreateMotivoDto {
  /** LIQUIDACION: rechazar o anular una liquidación. PAGO: anular un pago o un cobro. */
  @IsIn(TIPOS_MOTIVO, { message: 'El tipo de motivo no es válido' })
  tipo: TipoMotivo;

  @Transform(recortar)
  @IsString()
  @MinLength(3, { message: 'El motivo necesita al menos 3 caracteres' })
  @MaxLength(80, { message: 'El motivo admite como máximo 80 caracteres' })
  nombre: string;
}

export class UpdateMotivoDto {
  @IsOptional()
  @Transform(recortar)
  @IsString()
  @MinLength(3, { message: 'El motivo necesita al menos 3 caracteres' })
  @MaxLength(80, { message: 'El motivo admite como máximo 80 caracteres' })
  nombre?: string;

  @IsOptional()
  @IsBoolean()
  activo?: boolean;
}
