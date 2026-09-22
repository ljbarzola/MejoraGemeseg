import { IsEmail, IsString, Length, MinLength } from 'class-validator';

/** Paso 1: pedir el código. Solo el correo — nunca la contraseña nueva. */
export class RequestPasswordResetDto {
  @IsEmail()
  email: string;
}

/** Paso 2: canjear el código por una contraseña nueva. */
export class ConfirmPasswordResetDto {
  @IsEmail()
  email: string;

  @IsString()
  @Length(6, 6)
  code: string;

  @IsString()
  @MinLength(8, {
    message: 'La contraseña debe tener al menos 8 caracteres',
  })
  newPassword: string;
}
