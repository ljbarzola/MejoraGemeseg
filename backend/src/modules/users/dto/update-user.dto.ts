import { IsEmail, IsOptional, IsString, IsEnum, IsInt, MinLength } from 'class-validator';
import { UserRole } from '@prisma/client';

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

  @IsInt()
  @IsOptional()
  departmentId?: number | null;

  @IsInt()
  @IsOptional()
  roleId?: number | null;

  @IsOptional()
  isActive?: boolean;
}
