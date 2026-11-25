import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

// Los textos se revisan a fondo en los servicios (con mensajes en español); aquí solo se declara cada campo para
// que el ValidationPipe (whitelist) no lo rechace.

export class CrearCodigoDispositivoDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  nombre: string;
}

export class RenombrarDispositivoDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  nombre: string;
}

export class NumeracionDto {
  /** De 2 a 6 letras (se revisa en el servicio, con mensaje en español). */
  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  prefijo: string;
}

export class CrearPinDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(30)
  cedula: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  nombre: string;
}

export class LimpiarFotosDto {
  /** Día de Ecuador, «AAAA-MM-DD»: se borran las fotos de los viajes anteriores a esa fecha. */
  @IsOptional()
  @IsString()
  @MaxLength(10)
  antesDe?: string;
}
