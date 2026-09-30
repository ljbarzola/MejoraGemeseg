import { IsDateString, IsInt, IsString } from 'class-validator';

export class UpsertCeldaDto {
  @IsInt()
  puestoId: number;

  @IsString()
  cedula: string;

  @IsString()
  nombreGuardia: string;

  @IsDateString()
  fecha: string;

  @IsString()
  codigoTurno: string;
}
