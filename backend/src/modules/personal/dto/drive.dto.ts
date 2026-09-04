import { IsString } from 'class-validator';
import { Transform } from 'class-transformer';

export class SaveDriveConfigDto {
  @IsString()
  @Transform(({ value }) => value?.trim().replace(/\.+$/, ''))
  driveFolderId: string;

  @IsString()
  @Transform(({ value }) => value?.trim())
  driveFolderName: string;
}
