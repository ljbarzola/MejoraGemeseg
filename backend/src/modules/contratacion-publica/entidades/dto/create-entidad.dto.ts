import { IsString, IsOptional } from 'class-validator';

export class CreateEntidadDto {
  @IsString()
  nombre: string;

  @IsString()
  @IsOptional()
  ruc?: string;

  @IsString()
  @IsOptional()
  direccion?: string;
}
