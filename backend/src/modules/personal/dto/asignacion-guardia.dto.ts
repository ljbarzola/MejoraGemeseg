import {
  IsString,
  IsOptional,
  IsInt,
  IsDateString,
  IsNotEmpty,
} from 'class-validator';

export class CreateAsignacionGuardiaDto {
  @IsString()
  @IsNotEmpty()
  cedula: string;

  @IsString()
  @IsNotEmpty()
  nombreGuardia: string;

  @IsInt()
  entidadId: number;

  @IsDateString()
  fechaInicio: string;

  @IsDateString()
  @IsOptional()
  fechaFin?: string;
}

export class UpdateAsignacionGuardiaDto {
  @IsString()
  @IsNotEmpty()
  @IsOptional()
  cedula?: string;

  @IsString()
  @IsNotEmpty()
  @IsOptional()
  nombreGuardia?: string;

  @IsInt()
  @IsOptional()
  entidadId?: number;

  @IsDateString()
  @IsOptional()
  fechaInicio?: string;

  @IsDateString()
  @IsOptional()
  fechaFin?: string;
}
