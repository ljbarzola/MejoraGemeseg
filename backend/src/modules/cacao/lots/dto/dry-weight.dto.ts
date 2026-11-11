import { IsNumber, IsPositive, ValidateIf } from 'class-validator';

/** Peso del lote después de secar, en kg. `null` lo borra. */
export class SetDryWeightDto {
  @ValidateIf((o: { dryWeight?: number | null }) => o.dryWeight !== null)
  @IsNumber(
    { maxDecimalPlaces: 4 },
    { message: 'El peso seco admite como máximo 4 decimales' },
  )
  @IsPositive({ message: 'El peso seco debe ser mayor a cero' })
  dryWeight: number | null;
}
