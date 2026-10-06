import { IsString, IsOptional, IsObject } from 'class-validator';

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

  /** Valores de los campos configurables: { "<idCampo>": valor }. Reemplaza los de los campos activos. */
  @IsObject()
  @IsOptional()
  camposExtra?: Record<string, unknown>;
}
