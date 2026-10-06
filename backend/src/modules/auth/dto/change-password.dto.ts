import { IsString, MinLength } from 'class-validator';

/** Cambio de contraseña con la sesión iniciada (desde el perfil). */
export class ChangePasswordDto {
  @IsString()
  @MinLength(1, { message: 'Escribe tu contraseña actual' })
  currentPassword: string;

  @IsString()
  @MinLength(8, {
    message: 'La contraseña debe tener al menos 8 caracteres',
  })
  newPassword: string;
}
