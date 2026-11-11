import { IsInt, IsOptional, Max, Min } from 'class-validator';

export class CreateInformeDto {
  @IsInt()
  contratoId: number;

  @IsInt()
  @Min(2000)
  anio: number;

  @IsInt()
  @Min(1)
  @Max(12)
  mes: number;

  /** Si no se envía, se busca el horario APROBADO de ese contrato/mes. */
  @IsInt()
  @IsOptional()
  horarioMensualId?: number;

  /** Plantilla Word a usar; sin valor = la primera de la empresa. */
  @IsInt()
  @IsOptional()
  plantillaId?: number;
}
