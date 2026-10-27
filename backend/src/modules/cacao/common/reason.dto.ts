import { IsString, MaxLength, MinLength } from 'class-validator';

/** Motivo obligatorio al anular una recepción o un embarque. */
export class ReasonDto {
  @IsString()
  @MinLength(3, { message: 'Indica el motivo (mínimo 3 caracteres)' })
  @MaxLength(500)
  reason: string;
}
