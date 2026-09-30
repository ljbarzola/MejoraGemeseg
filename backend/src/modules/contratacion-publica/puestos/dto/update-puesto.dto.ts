import { IsIn, IsInt, IsOptional, IsString, Min } from 'class-validator';
import { TIPOS_TURNO_PUESTO } from './create-puesto.dto';

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
}
