import { IsString, IsOptional, IsObject, IsIn } from 'class-validator';

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

  @IsIn(['PUBLICA', 'PRIVADA'], { message: 'El tipo de entidad no es válido' })
  @IsOptional()
  tipo?: 'PUBLICA' | 'PRIVADA';

  /** Valores de los campos configurables: { "<idCampo>": valor }. Reemplaza los de los campos activos. */
  @IsObject()
  @IsOptional()
  camposExtra?: Record<string, unknown>;
}
