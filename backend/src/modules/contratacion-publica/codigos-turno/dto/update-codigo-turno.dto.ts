import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class UpdateCodigoTurnoDto {
  @IsString()
  @IsOptional()
  codigo?: string;

  @IsString()
  @IsOptional()
  nombre?: string;

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
