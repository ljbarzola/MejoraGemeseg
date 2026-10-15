import {
  IsEmail,
  IsNotEmpty,
  IsString,
  IsOptional,
  IsEnum,
  IsInt,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { UserRole } from '@prisma/client';
import {
  TELEFONO_USUARIO_MENSAJE,
  TELEFONO_USUARIO_REGEX,
} from '../phone.const';

export class CreateUserDto {
  @IsString()
  @IsNotEmpty()
  fullName: string;

  @IsEmail()
  email: string;

  @IsString()
  @MinLength(6)
  password: string;

  @IsEnum(UserRole)
  @IsOptional()
  role?: UserRole;

  @IsString()
  @IsOptional()
  documentNumber?: string;

  @IsString()
  @IsOptional()
  position?: string;

  // null o vacío = sin teléfono.
  @IsString()
  @IsOptional()
  @MaxLength(25)
  @Matches(TELEFONO_USUARIO_REGEX, { message: TELEFONO_USUARIO_MENSAJE })
  phone?: string | null;

  @IsInt()
  @IsOptional()
  departmentId?: number;

  @IsInt()
  @IsOptional()
  roleId?: number;
}
