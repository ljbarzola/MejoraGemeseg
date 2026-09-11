import { IsString, IsOptional, IsBoolean, IsIn } from 'class-validator';

export const ENTIDAD_TIPOS = ['PUBLICA', 'PRIVADA'] as const;

export class CreateEntidadDto {
  @IsString()
  nombre: string;

  @IsIn([...ENTIDAD_TIPOS])
  tipo: string;

  @IsBoolean()
  @IsOptional()
  activo?: boolean;
}

export class UpdateEntidadDto {
  @IsString()
  @IsOptional()
  nombre?: string;

  @IsIn([...ENTIDAD_TIPOS])
  @IsOptional()
  tipo?: string;

  @IsBoolean()
  @IsOptional()
  activo?: boolean;
}
