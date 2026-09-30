import { IsDateString, IsInt } from 'class-validator';

/**
 * El período real casi nunca coincide con un mes calendario (ej. 30 de julio
 * al 29 de agosto) — se pide directamente el rango de fechas; anio/mes se
 * derivan de fechaInicio solo como etiqueta para el cruce con Informes.
 */
export class CreateHorarioDto {
  @IsInt()
  contratoId: number;

  @IsDateString()
  fechaInicio: string;

  @IsDateString()
  fechaFin: string;
}
