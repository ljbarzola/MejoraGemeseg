import {
  IsEmail,
  IsOptional,
  IsString,
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

export class UpdateUserDto {
  @IsString()
  @IsOptional()
  fullName?: string;

  @IsEmail()
  @IsOptional()
  email?: string;

  @IsString()
  @MinLength(6)
  @IsOptional()
  password?: string;

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
  departmentId?: number | null;

  @IsInt()
  @IsOptional()
  roleId?: number | null;

  @IsInt()
  @IsOptional()
  locationId?: number | null;

  @IsOptional()
  isActive?: boolean;
}
