import { IsDateString, IsInt, IsString } from 'class-validator';

/**
 * Intercambia el código de turno entre dos guardias del MISMO puesto en un
 * día puntual — puestoId es obligatorio para que el intercambio no pueda
 * cruzar accidentalmente celdas de puestos distintos (ver plan, "el
 * intercambio debe ser lógico").
 */
export class IntercambiarTurnoDto {
  @IsInt()
  puestoId: number;

  @IsDateString()
  fecha: string;

  @IsString()
  cedulaA: string;

  @IsString()
  cedulaB: string;
}
