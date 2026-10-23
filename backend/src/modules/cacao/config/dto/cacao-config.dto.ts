import { IsInt, IsOptional, Max, Min } from 'class-validator';

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
}
