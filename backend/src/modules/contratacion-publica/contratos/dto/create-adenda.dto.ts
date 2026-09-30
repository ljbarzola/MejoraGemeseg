import { IsDateString, IsOptional, IsString } from 'class-validator';

export class CreateAdendaDto {
  @IsString()
  numero: string;

  @IsString()
  @IsOptional()
  descripcion?: string;

  @IsDateString()
  @IsOptional()
  fechaInicio?: string;

  @IsDateString()
  @IsOptional()
  fechaFin?: string;

  @IsString()
  @IsOptional()
  archivoUrl?: string;
}
