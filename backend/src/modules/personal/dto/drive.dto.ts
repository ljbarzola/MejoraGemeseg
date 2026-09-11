import { IsString, IsOptional, IsIn } from 'class-validator';
import { Transform } from 'class-transformer';

export const FOLDER_CONFIG_TYPES = [
  'CUMPLIMIENTO',
  'RECLUTAMIENTO',
  'PERSONAL_ADMIN',
  'GUARDIAS_ARCHIVO',
] as const;

export class SaveDriveConfigDto {
  @IsString()
  @Transform(({ value }) => value?.trim().replace(/\.+$/, ''))
  driveFolderId: string;

  @IsIn([...FOLDER_CONFIG_TYPES])
  @IsOptional()
  type?: string;
}

export class TestDriveConnectionDto {
  @IsString()
  @IsOptional()
  @Transform(({ value }) => value?.trim().replace(/\.+$/, ''))
  driveFolderId?: string;

  @IsIn([...FOLDER_CONFIG_TYPES])
  @IsOptional()
  type?: string;
}
