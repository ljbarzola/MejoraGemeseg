import { IsString } from 'class-validator';

export class UpsertTextoDto {
  @IsString()
  clave: string;

  @IsString()
  contenido: string;
}
