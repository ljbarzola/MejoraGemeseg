import { IsString, IsOptional, IsIn } from 'class-validator';
import { Transform } from 'class-transformer';

export const VERIFICATION_PLATFORMS = ['SICOSEP', 'SUT', 'IESS'] as const;
export const VERIFICATION_STATUSES = ['PENDIENTE', 'VERIFICADO', 'NO_ENCONTRADO'] as const;

export class CreateVerificationDto {
  @IsString()
  cedula: string;

  @IsIn([...VERIFICATION_PLATFORMS])
  platform: string;

  @IsIn([...VERIFICATION_STATUSES])
  @IsOptional()
  status?: string;

  @IsString()
  @IsOptional()
  notes?: string;
}

export class UpdateVerificationDto {
  @IsIn([...VERIFICATION_PLATFORMS])
  @IsOptional()
  platform?: string;

  @IsIn([...VERIFICATION_STATUSES])
  @IsOptional()
  status?: string;

  @IsString()
  @IsOptional()
  notes?: string;
}

export class TestDriveConnectionDto {
  @IsString()
  @IsOptional()
  @Transform(({ value }) => value?.trim().replace(/\.+$/, ''))
  driveFolderId?: string;
}
