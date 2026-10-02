import { ArrayMaxSize, IsArray, IsString, MaxLength } from 'class-validator';

/** Clave de preferencia de columnas de una tabla, ej. `columnas:ventas-clientes`. */
export const PREFERENCE_KEY_PATTERN = /^columnas:[a-z0-9-]{1,60}$/;

export class SetPreferenceDto {
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  @MaxLength(64, { each: true })
  value: string[];
}
