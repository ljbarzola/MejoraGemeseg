import { IsString, IsOptional, IsObject, IsIn } from 'class-validator';

export class CreateEntidadDto {
  @IsString()
  nombre: string;

  @IsString()
  @IsOptional()
  ruc?: string;

  @IsString()
  @IsOptional()
  direccion?: string;

  /** Pública (entidad del Estado) o privada (cliente privado). Sin valor = pública. */
  @IsIn(['PUBLICA', 'PRIVADA'], { message: 'El tipo de entidad no es válido' })
  @IsOptional()
  tipo?: 'PUBLICA' | 'PRIVADA';

  /** Valores de los campos configurables: { "<idCampo>": valor }. */
  @IsObject()
  @IsOptional()
  camposExtra?: Record<string, unknown>;
}

/** Carpeta de Drive que se quiere convertir en entidad (aviso de la sincronización). */
export class CrearEntidadDesdeCarpetaDto {
  @IsString()
  folderId: string;
}
