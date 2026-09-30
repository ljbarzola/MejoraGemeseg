import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class CreateCodigoTurnoDto {
  @IsString()
  codigo: string;

  @IsString()
  nombre: string;

  @IsString()
  @IsOptional()
  color?: string;

  @IsBoolean()
  @IsOptional()
  activo?: boolean;

  @IsBoolean()
  @IsOptional()
  esDescanso?: boolean;
}
