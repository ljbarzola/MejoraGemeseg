import {
  IsDateString,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

export class UpdateContratoDto {
  @IsInt()
  @IsOptional()
  entidadId?: number;

  @IsString()
  @IsOptional()
  numero?: string;

  @IsString()
  @IsOptional()
  objeto?: string;

  @IsString()
  @IsOptional()
  referenciaProceso?: string;

  @IsDateString()
  @IsOptional()
  fechaInicio?: string;

  @IsDateString()
  @IsOptional()
  fechaFin?: string;

  @IsNumber()
  @IsOptional()
  valorTotal?: number;

  @IsString()
  @IsOptional()
  administradorNombre?: string;

  @IsString()
  @IsOptional()
  administradorCargo?: string;

  @IsString()
  @IsOptional()
  tipoCompra?: string;

  /** null borra el corte (vuelve al mes calendario). */
  @IsInt()
  @Min(1)
  @Max(31)
  @IsOptional()
  diaCorte?: number | null;

  /** null o vacío borra la fecha. */
  @IsDateString()
  @IsOptional()
  fechaEmisionOrden?: string | null;

  @IsDateString()
  @IsOptional()
  fechaAceptacionOrden?: string | null;

  @IsDateString()
  @IsOptional()
  fechaSuscripcionOrden?: string | null;

  @IsInt()
  @Min(1)
  @IsOptional()
  plazoDias?: number | null;

  @IsIn(['ACTIVO', 'FINALIZADO'])
  @IsOptional()
  estado?: string;
}
