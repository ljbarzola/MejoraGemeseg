import { IsString } from 'class-validator';

export class MergeCedulaDto {
  @IsString()
  cedulaOrigen: string;

  @IsString()
  cedulaDestino: string;
}
