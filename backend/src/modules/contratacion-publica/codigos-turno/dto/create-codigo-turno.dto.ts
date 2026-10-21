import { IsBoolean, IsOptional, IsString, Matches } from 'class-validator';

const HORA = /^([01]?\d|2[0-3]):[0-5]\d$/;
const MSG_HORA = 'La hora debe tener el formato HH:mm (24 horas).';

export class CreateCodigoTurnoDto {
  @IsString()
  codigo: string;

  @IsString()
  nombre: string;

  @IsString()
  @IsOptional()
  color?: string;

  @IsBoolean()
  @IsOptional()
  activo?: boolean;

  @IsBoolean()
  @IsOptional()
  esDescanso?: boolean;

  /** Ventana del turno, "07:00". null = sin hora. La usa el revisor de bitácoras. */
  @IsOptional()
  @Matches(HORA, { message: MSG_HORA })
  horaInicio?: string | null;

  @IsOptional()
  @Matches(HORA, { message: MSG_HORA })
  horaFin?: string | null;
}
