import { IsString, IsOptional, IsObject } from 'class-validator';

export class CreateEntidadDto {
  @IsString()
  nombre: string;

  @IsString()
  @IsOptional()
  ruc?: string;

  @IsString()
  @IsOptional()
  direccion?: string;

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
