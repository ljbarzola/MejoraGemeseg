import { IsDateString, IsNumber, IsOptional, IsString } from 'class-validator';

/**
 * Renovación como contrato nuevo (en vez de una adenda sobre el mismo, ver
 * CreateAdendaDto) — hereda entidad/objeto/referencia del contrato origen
 * salvo que se sobreescriban aquí.
 */
export class RenovarContratoDto {
  @IsString()
  numero: string;

  @IsString()
  @IsOptional()
  objeto?: string;

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
}
