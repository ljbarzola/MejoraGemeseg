import { IsString, MaxLength, MinLength } from 'class-validator';

/** Motivo obligatorio al rechazar o anular una liquidación. */
export class SettlementDecisionDto {
  @IsString()
  @MinLength(3, { message: 'Indica el motivo (mínimo 3 caracteres)' })
  @MaxLength(500)
  reason: string;
}
