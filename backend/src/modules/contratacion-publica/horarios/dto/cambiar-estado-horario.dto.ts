import { IsIn, IsOptional, IsString } from 'class-validator';

export const ESTADOS_HORARIO = [
  'BORRADOR',
  'ENVIADO',
  'APROBADO',
  'RECHAZADO',
] as const;

export class CambiarEstadoHorarioDto {
  @IsIn(ESTADOS_HORARIO)
  estado: string;

  @IsString()
  @IsOptional()
  motivoRechazo?: string;
}
