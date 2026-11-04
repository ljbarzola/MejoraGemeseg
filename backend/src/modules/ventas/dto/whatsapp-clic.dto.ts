import { IsOptional, IsString, MaxLength } from 'class-validator';

// El servidor tiene forbidNonWhitelisted: todo campo del body debe estar aquí.

// Datos de contacto con los que el vendedor confirma que llegó el mensaje de WhatsApp («Escribió»).
// Se exige al menos uno (nombre, teléfono o correo): lo valida VentasLeadsService.ingresar.
export class EscribioDto {
  @IsOptional() @IsString() @MaxLength(150) name?: string;
  @IsOptional() @IsString() @MaxLength(150) phone?: string;
  @IsOptional() @IsString() @MaxLength(150) email?: string;
  @IsOptional() @IsString() @MaxLength(150) companyName?: string;
  @IsOptional() @IsString() @MaxLength(2000) message?: string;
}
