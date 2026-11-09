import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  Max,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { ESTADOS_ARMA, TIPOS_ARTICULO, TIPOS_MOVIMIENTO } from '../inventario.util';

const FECHA = /^\d{4}-\d{2}-\d{2}$/;
const MSG_FECHA = 'La fecha debe tener el formato AAAA-MM-DD.';
const CLASES_ARMA = ['PISTOLA', 'REVOLVER', 'ESCOPETA', 'OTRA'] as const;

const texto = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class CrearArticuloDto {
  @IsIn(TIPOS_ARTICULO as unknown as string[], { message: 'Elige si es uniforme, implemento o munición.' })
  tipo: string;

  @Transform(texto)
  @IsString()
  @MaxLength(120)
  nombre: string;

  @IsOptional()
  @Transform(texto)
  @IsString()
  @MaxLength(60)
  variante?: string;

  @IsOptional()
  @Transform(texto)
  @IsString()
  @MaxLength(30)
  unidad?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(1_000_000)
  stockMinimo?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(1_000_000)
  stockMaximo?: number | null;
}

export class ActualizarArticuloDto {
  @IsOptional()
  @Transform(texto)
  @IsString()
  @MaxLength(120)
  nombre?: string;

  @IsOptional()
  @Transform(texto)
  @IsString()
  @MaxLength(60)
  variante?: string;

  @IsOptional()
  @Transform(texto)
  @IsString()
  @MaxLength(30)
  unidad?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(1_000_000)
  stockMinimo?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(1_000_000)
  stockMaximo?: number | null;

  @IsOptional()
  activo?: boolean;
}

export class CrearMovimientoDto {
  @Type(() => Number)
  @IsInt()
  articuloId: number;

  @IsIn(TIPOS_MOVIMIENTO as unknown as string[])
  tipo: string;

  /** Positiva en todos los tipos menos AJUSTE, que puede ser negativa (corrige un conteo). */
  @Type(() => Number)
  @IsInt()
  @Min(-1_000_000)
  @Max(1_000_000)
  cantidad: number;

  @IsOptional()
  @Matches(FECHA, { message: MSG_FECHA })
  fecha?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  puestoId?: number | null;

  @IsOptional()
  @Transform(texto)
  @IsString()
  @MaxLength(20)
  guardiaCedula?: string | null;

  @IsOptional()
  @Transform(texto)
  @IsString()
  @MaxLength(160)
  guardiaNombre?: string | null;

  @IsOptional()
  @IsIn(['NUEVO', 'USADO', 'DANADO'])
  estadoDevuelto?: string | null;

  @IsOptional()
  @Transform(texto)
  @IsString()
  @MaxLength(300)
  motivo?: string | null;

  /** Número de factura, acta de entrega o guía que respalda el movimiento. */
  @IsOptional()
  @Transform(texto)
  @IsString()
  @MaxLength(80)
  documento?: string | null;
}

export class ListarMovimientosQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  articuloId?: number;

  @IsOptional()
  @IsIn(TIPOS_MOVIMIENTO as unknown as string[])
  tipo?: string;

  @IsOptional()
  @Matches(FECHA, { message: MSG_FECHA })
  desde?: string;

  @IsOptional()
  @Matches(FECHA, { message: MSG_FECHA })
  hasta?: string;
}

export class TenenciasQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  articuloId?: number;
}

export class CrearArmaDto {
  @Transform(texto)
  @IsString()
  @MaxLength(60)
  serie: string;

  @IsOptional()
  @IsIn(CLASES_ARMA as unknown as string[])
  clase?: string;

  @IsOptional()
  @Transform(texto)
  @IsString()
  @MaxLength(60)
  marca?: string | null;

  @IsOptional()
  @Transform(texto)
  @IsString()
  @MaxLength(60)
  modelo?: string | null;

  @IsOptional()
  @Transform(texto)
  @IsString()
  @MaxLength(40)
  calibre?: string | null;

  @IsOptional()
  @Transform(texto)
  @IsString()
  @MaxLength(60)
  permisoNumero?: string | null;

  @IsOptional()
  @Matches(FECHA, { message: MSG_FECHA })
  permisoVence?: string | null;

  @IsOptional()
  @Transform(texto)
  @IsString()
  @MaxLength(300)
  notas?: string | null;
}

export class ActualizarArmaDto {
  @IsOptional()
  @Transform(texto)
  @IsString()
  @MaxLength(60)
  serie?: string;

  @IsOptional()
  @IsIn(CLASES_ARMA as unknown as string[])
  clase?: string;

  @IsOptional()
  @Transform(texto)
  @IsString()
  @MaxLength(60)
  marca?: string | null;

  @IsOptional()
  @Transform(texto)
  @IsString()
  @MaxLength(60)
  modelo?: string | null;

  @IsOptional()
  @Transform(texto)
  @IsString()
  @MaxLength(40)
  calibre?: string | null;

  @IsOptional()
  @Transform(texto)
  @IsString()
  @MaxLength(60)
  permisoNumero?: string | null;

  @IsOptional()
  @Matches(FECHA, { message: MSG_FECHA })
  permisoVence?: string | null;

  @IsOptional()
  @Transform(texto)
  @IsString()
  @MaxLength(300)
  notas?: string | null;
}

export class AsignarArmaDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  puestoId?: number | null;

  @IsOptional()
  @Transform(texto)
  @IsString()
  @MaxLength(20)
  guardiaCedula?: string | null;

  @IsOptional()
  @Transform(texto)
  @IsString()
  @MaxLength(160)
  guardiaNombre?: string | null;
}

export class MotivoArmaDto {
  @IsOptional()
  @Transform(texto)
  @IsString()
  @MaxLength(300)
  motivo?: string;
}

export class ListarArmasQueryDto {
  @IsOptional()
  @IsIn(ESTADOS_ARMA as unknown as string[])
  estado?: string;
}
