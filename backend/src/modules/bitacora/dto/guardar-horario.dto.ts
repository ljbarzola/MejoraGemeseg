import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsInt,
  IsOptional,
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

  // Los límites (tolerancia 0 a 60, inactividad 10 a 120) los comprueba `errorDeReglas` en el
  // servicio: así el mensaje es el de la regla y no el genérico de datos no válidos.
  /** Menos de estos minutos de tiempo extra no suman. */
  @IsOptional()
  @IsInt()
  toleranciaMinutos?: number;

  /** Minutos sin actividad tras los que se cierra solo el tiempo extra. */
  @IsOptional()
  @IsInt()
  inactividadMinutos?: number;
}
