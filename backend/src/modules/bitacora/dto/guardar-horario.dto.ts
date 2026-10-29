import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsInt,
  IsString,
  Matches,
  Max,
  Min,
} from 'class-validator';

const HORA_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

export class GuardarHorarioDto {
  /** 1 = lunes ... 7 = domingo. */
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(7)
  @IsInt({ each: true })
  @Min(1, { each: true })
  @Max(7, { each: true })
  dias: number[];

  @IsString()
  @Matches(HORA_RE, { message: 'La hora de inicio debe ser como 08:00.' })
  inicio: string;

  @IsString()
  @Matches(HORA_RE, { message: 'La hora de fin debe ser como 17:00.' })
  fin: string;
}
