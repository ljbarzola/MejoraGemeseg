import { Transform, Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

const FECHA = /^\d{4}-\d{2}-\d{2}$/;
const HORA = /^([01]?\d|2[0-3]):[0-5]\d$/;

export const MOTIVOS_AUSENCIA = ['NO_AVISO', 'ENFERMEDAD', 'PERMISO', 'OTRO'] as const;
export const ESTADOS_AUSENCIA = ['POR_CUBRIR', 'CUBIERTA', 'ANULADA'] as const;

const texto = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class CrearAusenciaDto {
  @Type(() => Number)
  @IsInt()
  puestoId: number;

  @Transform(texto)
  @IsString()
  @MaxLength(20)
  cedula: string;

  /** Por defecto hoy (día de Ecuador). Hasta 7 días atrás. */
  @IsOptional()
  @Matches(FECHA, { message: 'La fecha debe tener el formato AAAA-MM-DD.' })
  fecha?: string;

  @IsIn(MOTIVOS_AUSENCIA as unknown as string[], { message: 'Elige el motivo de la falta.' })
  motivo: string;

  @IsOptional()
  @Matches(HORA, { message: 'La hora debe tener el formato HH:mm (24 horas).' })
  hora?: string | null;

  @IsOptional()
  @Transform(texto)
  @IsString()
  @MaxLength(300)
  nota?: string | null;

  @IsOptional()
  @Transform(texto)
  @IsString()
  @MaxLength(20)
  reemplazoCedula?: string | null;

  @IsOptional()
  @Transform(texto)
  @IsString()
  @MaxLength(160)
  reemplazoNombre?: string | null;
}

export class CubrirAusenciaDto {
  @Transform(texto)
  @IsString()
  @MaxLength(20)
  reemplazoCedula: string;

  @Transform(texto)
  @IsString()
  @MaxLength(160)
  reemplazoNombre: string;
}

export class AnularAusenciaDto {
  @IsOptional()
  @Transform(texto)
  @IsString()
  @MaxLength(300)
  nota?: string;
}

export class SugerenciasAusenciaQueryDto {
  @Type(() => Number)
  @IsInt()
  puestoId: number;

  @Transform(texto)
  @IsString()
  cedula: string;

  @IsOptional()
  @Matches(FECHA, { message: 'La fecha debe tener el formato AAAA-MM-DD.' })
  fecha?: string;
}

export class ListarAusenciasQueryDto {
  @IsOptional()
  @Matches(FECHA, { message: 'La fecha debe tener el formato AAAA-MM-DD.' })
  desde?: string;

  @IsOptional()
  @Matches(FECHA, { message: 'La fecha debe tener el formato AAAA-MM-DD.' })
  hasta?: string;

  @IsOptional()
  @IsIn(ESTADOS_AUSENCIA as unknown as string[])
  estado?: string;
}
