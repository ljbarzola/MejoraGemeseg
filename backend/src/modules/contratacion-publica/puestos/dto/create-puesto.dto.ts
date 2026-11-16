import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsIn, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min, ValidateNested } from 'class-validator';

export const TIPOS_TURNO_PUESTO = ['8H', '12H', '24H'] as const;

const HORA = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Un turno del puesto: «Día 07:00–19:00, 2 guardias». */
export class TurnoPuestoDto {
  @IsString()
  @MaxLength(40)
  nombre: string;

  @IsOptional()
  @Matches(HORA, { message: 'La hora del turno debe ser HH:MM' })
  horaInicio?: string | null;

  @IsOptional()
  @Matches(HORA, { message: 'La hora del turno debe ser HH:MM' })
  horaFin?: string | null;

  @IsInt()
  @Min(1)
  @Max(50)
  guardias: number;
}

export class CreatePuestoDto {
  @IsInt()
  contratoId: number;

  @IsString()
  nombre: string;

  @IsIn(TIPOS_TURNO_PUESTO)
  tipoTurno: string;

  @IsInt()
  @Min(1)
  @IsOptional()
  cantidadGuardias?: number;

  @IsInt()
  @Min(1)
  @IsOptional()
  guardiasSimultaneosRequeridos?: number;

  @IsString()
  @IsOptional()
  canton?: string;

  @IsString()
  @IsOptional()
  edificio?: string;

  @IsString()
  @IsOptional()
  ubicacion?: string;

  /** Turnos del puesto. Con turnos, el mínimo de guardias por día es la suma de los de cada turno. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(6)
  @ValidateNested({ each: true })
  @Type(() => TurnoPuestoDto)
  turnos?: TurnoPuestoDto[];
}
