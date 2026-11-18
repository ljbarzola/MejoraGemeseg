import { IsString, IsOptional, IsObject, IsIn, MaxLength } from 'class-validator';

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

  /** Sector según el tipo (ver entidad-clasificacion.util.ts). '' o null = sin sector. */
  @IsString()
  @MaxLength(60)
  @IsOptional()
  sector?: string | null;

  /** Una de las 24 provincias. '' o null = sin provincia. */
  @IsString()
  @MaxLength(60)
  @IsOptional()
  provincia?: string | null;

  @IsString()
  @MaxLength(80)
  @IsOptional()
  canton?: string | null;

  /** Valores de los campos configurables: { "<idCampo>": valor }. Reemplaza los de los campos activos. */
  @IsObject()
  @IsOptional()
  camposExtra?: Record<string, unknown>;
}
