import { IsEmail, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * Persona nueva que Operaciones registra desde el formulario del viaje (2026-11-17). Solo el nombre y la cédula
 * son obligatorios; el resto va a la ficha personal de RRHH si se llena.
 */
export class CreatePersonaCustodiaDto {
  /** «Apellidos Nombres», el formato de RRHH. */
  @IsString()
  @IsNotEmpty({ message: 'Escribe los apellidos y nombres.' })
  @MaxLength(120)
  nombre: string;

  /** Cédula o documento de identidad: OPCIONAL (si falta, RRHH la completa después). */
  @IsOptional()
  @IsString()
  @MaxLength(40)
  cedula?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  telefono?: string;

  @IsOptional()
  @IsEmail({}, { message: 'El correo no es válido.' })
  @MaxLength(120)
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  direccion?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  contactoEmergenciaNombre?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  contactoEmergenciaTelefono?: string;
}
