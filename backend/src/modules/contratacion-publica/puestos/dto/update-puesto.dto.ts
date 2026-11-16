import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsIn, IsInt, IsOptional, IsString, Min, ValidateNested } from 'class-validator';
import { TIPOS_TURNO_PUESTO, TurnoPuestoDto } from './create-puesto.dto';

export class UpdatePuestoDto {
  @IsString()
  @IsOptional()
  nombre?: string;

  @IsIn(TIPOS_TURNO_PUESTO)
  @IsOptional()
  tipoTurno?: string;

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

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(6)
  @ValidateNested({ each: true })
  @Type(() => TurnoPuestoDto)
  turnos?: TurnoPuestoDto[];
}
