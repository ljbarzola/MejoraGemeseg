import {
  IsBoolean,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { Transform } from 'class-transformer';

const recortar = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

/** Un texto opcional: se recorta y, si queda vacío, se trata como «sin dirección». */
const textoOpcional = ({ value }: { value: unknown }) => {
  if (typeof value !== 'string') return value;
  const recortado = value.trim();
  return recortado === '' ? null : recortado;
};

export class CreatePuntoDto {
  @Transform(recortar)
  @IsString()
  @MinLength(2, { message: 'El nombre necesita al menos 2 caracteres' })
  @MaxLength(80, { message: 'El nombre admite como máximo 80 caracteres' })
  nombre: string;

  @IsOptional()
  @Transform(textoOpcional)
  @IsString()
  @MaxLength(200, {
    message: 'La dirección admite como máximo 200 caracteres',
  })
  direccion?: string | null;
}

export class UpdatePuntoDto {
  @IsOptional()
  @Transform(recortar)
  @IsString()
  @MinLength(2, { message: 'El nombre necesita al menos 2 caracteres' })
  @MaxLength(80, { message: 'El nombre admite como máximo 80 caracteres' })
  nombre?: string;

  @IsOptional()
  @Transform(textoOpcional)
  @IsString()
  @MaxLength(200, {
    message: 'La dirección admite como máximo 200 caracteres',
  })
  direccion?: string | null;

  @IsOptional()
  @IsBoolean()
  activo?: boolean;
}
