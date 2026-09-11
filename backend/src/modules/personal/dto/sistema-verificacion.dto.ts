import { IsString, IsOptional, IsNumber, IsBoolean } from 'class-validator';

export class CreateSistemaVerificacionDto {
  @IsString()
  nombre: string;

  @IsString()
  @IsOptional()
  urlPortal?: string;

  @IsNumber()
  @IsOptional()
  orden?: number;
}

export class UpdateSistemaVerificacionDto {
  @IsString()
  @IsOptional()
  nombre?: string;

  @IsString()
  @IsOptional()
  urlPortal?: string;

  @IsBoolean()
  @IsOptional()
  activo?: boolean;

  @IsNumber()
  @IsOptional()
  orden?: number;
}
