import {
  IsDateString,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

export class CreateContratoDto {
  @IsInt()
  entidadId: number;

  @IsString()
  numero: string;

  @IsString()
  objeto: string;

  @IsString()
  @IsOptional()
  referenciaProceso?: string;

  @IsDateString()
  fechaInicio: string;

  @IsDateString()
  fechaFin: string;

  @IsNumber()
  @IsOptional()
  valorTotal?: number;

  /** Quién administra el contrato en la entidad (para el informe mensual). */
  @IsString()
  @IsOptional()
  administradorNombre?: string;

  @IsString()
  @IsOptional()
  administradorCargo?: string;

  /** Cómo se compró, p. ej. «Compra por catálogo electrónico». */
  @IsString()
  @IsOptional()
  tipoCompra?: string;

  /** Día en que empieza el ciclo mensual (1 a 31). Sin valor o 1 = mes calendario. */
  @IsInt()
  @Min(1)
  @Max(31)
  @IsOptional()
  diaCorte?: number;

  /** Datos de la orden de compra (el informe del Ministerio los cita). */
  @IsDateString()
  @IsOptional()
  fechaEmisionOrden?: string;

  @IsDateString()
  @IsOptional()
  fechaAceptacionOrden?: string;

  @IsDateString()
  @IsOptional()
  fechaSuscripcionOrden?: string;

  @IsInt()
  @Min(1)
  @IsOptional()
  plazoDias?: number;
}
