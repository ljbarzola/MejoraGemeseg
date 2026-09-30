import { IsIn, IsInt, IsOptional, IsString, Min } from 'class-validator';

export const TIPOS_TURNO_PUESTO = ['8H', '12H', '24H'] as const;

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
}
