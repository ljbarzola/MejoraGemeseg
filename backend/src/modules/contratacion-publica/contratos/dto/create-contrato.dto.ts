import {
  IsDateString,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
} from 'class-validator';

export class CreateContratoDto {
  @IsInt()
  entidadId: number;

  @IsString()
  numero: string;

  @IsString()
  objeto: string;

  @IsString()
  @IsOptional()
  referenciaProceso?: string;

  @IsDateString()
  fechaInicio: string;

  @IsDateString()
  fechaFin: string;

  @IsNumber()
  @IsOptional()
  valorTotal?: number;
}
