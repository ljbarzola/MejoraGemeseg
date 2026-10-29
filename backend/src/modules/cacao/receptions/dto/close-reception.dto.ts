import { IsString, MaxLength, MinLength } from 'class-validator';

/** Motivo obligatorio al cerrar una entrega sin liquidarla. */
export class CloseReceptionDto {
  @IsString()
  @MinLength(3, { message: 'Indica el motivo (mínimo 3 caracteres)' })
  @MaxLength(500)
  reason: string;
}
