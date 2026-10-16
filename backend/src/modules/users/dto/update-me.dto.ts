import { IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import {
  TELEFONO_USUARIO_MENSAJE,
  TELEFONO_USUARIO_REGEX,
} from '../phone.const';

// Lo único que una persona puede cambiar de su propio perfil. Es una lista
// cerrada a propósito: nada de rol, correo, cargo ni empresa.
export class UpdateMeDto {
  // null o vacío borra el teléfono.
  @IsOptional()
  @IsString()
  @MaxLength(25)
  @Matches(TELEFONO_USUARIO_REGEX, { message: TELEFONO_USUARIO_MENSAJE })
  phone?: string | null;
}
