import {
  IsDateString,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
} from 'class-validator';

export class UpdateContratoDto {
  @IsInt()
  @IsOptional()
  entidadId?: number;

  @IsString()
  @IsOptional()
  numero?: string;

  @IsString()
  @IsOptional()
  objeto?: string;

  @IsString()
  @IsOptional()
  referenciaProceso?: string;

  @IsDateString()
  @IsOptional()
  fechaInicio?: string;

  @IsDateString()
  @IsOptional()
  fechaFin?: string;

  @IsNumber()
  @IsOptional()
  valorTotal?: number;

  @IsIn(['ACTIVO', 'FINALIZADO'])
  @IsOptional()
  estado?: string;
}
