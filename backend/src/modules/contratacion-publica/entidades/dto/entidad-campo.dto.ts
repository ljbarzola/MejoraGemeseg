import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { MAXIMO_OPCIONES, TIPOS_CAMPO } from '../entidad-campos.util';

export class CreateEntidadCampoDto {
  @IsString()
  @MaxLength(80)
  nombre: string;

  @IsIn(TIPOS_CAMPO as unknown as string[])
  tipo: string;

  /** Solo para LISTA: las opciones que se pueden elegir. */
  @IsArray()
  @ArrayMaxSize(MAXIMO_OPCIONES)
  @IsString({ each: true })
  @IsOptional()
  opciones?: string[];

  @IsBoolean()
  @IsOptional()
  obligatorio?: boolean;
}

/** El tipo no se puede cambiar: ya hay valores guardados con ese formato. */
export class UpdateEntidadCampoDto {
  @IsString()
  @MaxLength(80)
  @IsOptional()
  nombre?: string;

  @IsArray()
  @ArrayMaxSize(MAXIMO_OPCIONES)
  @IsString({ each: true })
  @IsOptional()
  opciones?: string[];

  @IsBoolean()
  @IsOptional()
  obligatorio?: boolean;

  @IsBoolean()
  @IsOptional()
  activo?: boolean;
}

export class ReordenarCamposDto {
  @IsArray()
  @IsInt({ each: true })
  ids: number[];
}
