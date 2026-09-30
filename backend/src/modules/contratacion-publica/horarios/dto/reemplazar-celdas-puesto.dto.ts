import { Type } from 'class-transformer';
import {
  IsArray,
  IsDateString,
  IsInt,
  IsString,
  ValidateNested,
} from 'class-validator';

export class CeldaGuardiaDto {
  @IsString()
  cedula: string;

  @IsString()
  nombreGuardia: string;

  @IsDateString()
  fecha: string;

  @IsString()
  codigoTurno: string;
}

/**
 * Reemplaza de una sola vez todas las celdas de un puesto dentro de un
 * horario — pensado para cuando Operaciones sube/pega el mes completo de un
 * puesto en vez de celda por celda.
 */
export class ReemplazarCeldasPuestoDto {
  @IsInt()
  puestoId: number;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CeldaGuardiaDto)
  celdas: CeldaGuardiaDto[];
}
