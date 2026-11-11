import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';
import { JORNADAS } from '../supervision.util';

export class CrearCronogramaDto {
  @IsInt()
  contratoId: number;

  @IsDateString()
  fechaInicio: string;

  @IsDateString()
  fechaFin: string;
}

export class EditarPuntoDto {
  /** null = quitar la persona del sistema (queda solo el nombre escrito). */
  @IsOptional()
  @IsInt()
  supervisorUserId?: number | null;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  supervisorNombre?: string;

  @IsOptional()
  @IsIn(JORNADAS as unknown as string[])
  jornada?: string;
}

export class ReemplazarDiasDto {
  @IsArray()
  @ArrayMaxSize(70)
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { each: true, message: 'Cada día debe ser AAAA-MM-DD.' })
  fechas: string[];
}

export class RegistrarVisitaDto {
  @Type(() => Number)
  @IsInt()
  puestoId: number;

  /** AAAA-MM-DD; sin valor = hoy. */
  @IsOptional()
  @IsDateString()
  fecha?: string;

  @IsOptional()
  @IsString()
  hora?: string;

  @IsIn(['SI', 'NO', 'NO_APLICA'])
  guardiaPresente: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  observacion?: string;
}

export class ListarVisitasQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  puestoId?: number;

  @IsOptional()
  @IsDateString()
  desde?: string;

  @IsOptional()
  @IsDateString()
  hasta?: string;
}
