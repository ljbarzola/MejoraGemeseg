import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsBoolean, IsInt, IsOptional, IsString, Matches, ValidateNested } from 'class-validator';
import { PatronRotacionConfigDto } from '../../puestos/dto/patron-rotacion.dto';

export class GenerarPatronDto {
  @IsInt()
  puestoId: number;

  @ValidateNested()
  @Type(() => PatronRotacionConfigDto)
  patron: PatronRotacionConfigDto;

  @IsBoolean()
  @IsOptional()
  guardarComoPatronDelPuesto?: boolean;

  /** Llenar solo hasta este día (YYYY-MM-DD, dentro del horario). Sin valor: hasta el último día del horario. */
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'La fecha «Llenar hasta» no es válida' })
  hasta?: string;

  /**
   * «El último día termina con» (2026-11-16): códigos de turno que NO se ponen el último día llenado,
   * p. ej. ['N'] para que ese día termine con el turno de Día y la noche quede sin nadie.
   */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  quitarUltimoDia?: string[];
}
