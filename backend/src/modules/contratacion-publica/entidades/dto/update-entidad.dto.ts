import { IsString, IsOptional } from 'class-validator';

export class UpdateEntidadDto {
  @IsString()
  @IsOptional()
  nombre?: string;

  @IsString()
  @IsOptional()
  ruc?: string;

  @IsString()
  @IsOptional()
  direccion?: string;
}
