import { IsBoolean, IsInt, IsOptional, IsString } from 'class-validator';

// Los límites y mensajes (minutos, motivo, fecha, nota) los comprueba BitacoraHorasService:
// así la persona ve la regla concreta y no el mensaje genérico de datos no válidos.

export class AnotarDeudaDto {
  /** Si falta, es la propia persona. Un administrador o gerente puede anotársela a alguien de su empresa. */
  @IsOptional()
  @IsInt()
  userId?: number;

  @IsInt()
  minutos: number;

  @IsString()
  motivo: string;

  /** AAAA-MM-DD; por defecto, hoy. */
  @IsOptional()
  @IsString()
  fecha?: string;
}

export class ResolverExtraDto {
  @IsBoolean()
  aprobar: boolean;

  @IsOptional()
  @IsString()
  nota?: string;
}
