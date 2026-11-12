import { IsInt, IsOptional, IsString } from 'class-validator';

// Los límites y mensajes (texto, horas, fecha, tipo) los comprueba BitacoraNotasService:
// así la persona ve la regla concreta y no el mensaje genérico de datos no válidos.

export class CrearNotaDto {
  /** AAAA-MM-DD; por defecto, hoy. */
  @IsOptional()
  @IsString()
  fecha?: string;

  /** «HH:MM» opcional (hora de Ecuador); va junto con `hasta`. */
  @IsOptional()
  @IsString()
  desde?: string;

  @IsOptional()
  @IsString()
  hasta?: string;

  /** REUNION | VISITA | SIN_COMPUTADOR | OTRO */
  @IsOptional()
  @IsString()
  tipo?: string;

  @IsString()
  texto: string;
}

export class ActualizarNotaDto {
  /** Para quitar el horario, enviar cadena vacía en ambos. */
  @IsOptional()
  @IsString()
  desde?: string;

  @IsOptional()
  @IsString()
  hasta?: string;

  @IsOptional()
  @IsString()
  tipo?: string;

  @IsOptional()
  @IsString()
  texto?: string;
}

export class GenerarResumenDto {
  /** AAAA-MM-DD; por defecto, hoy. */
  @IsOptional()
  @IsString()
  fecha?: string;

  /** Si falta, es el resumen de quien pulsa. Con otra persona exige poder ver la bitácora del equipo. */
  @IsOptional()
  @IsInt()
  userId?: number;
}

export class GuardarSitiosSensiblesDto {
  @IsString({ each: true })
  dominios: string[];
}
