import { IsInt, IsNumber, IsOptional, Max, Min } from 'class-validator';

/** Ajustes del módulo Cacao de una empresa. Lo que no se manda no se cambia. */
export class UpdateCacaoConfigDto {
  /** Días de plazo para pagar a un proveedor desde que se aprueba la liquidación. */
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(365)
  plazoPagoDias?: number;

  /** Días de plazo para cobrar a un cliente desde el embarque. */
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(365)
  plazoCobroDias?: number;

  /** Precio de referencia ICE en $/T (máx. 2 decimales). `null` lo borra. */
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(1000000)
  precioIce?: number | null;
}
