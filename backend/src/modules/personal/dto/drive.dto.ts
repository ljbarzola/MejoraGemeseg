import { IsString } from 'class-validator';

export class SaveDriveConfigDto {
  @IsString()
  driveFolderId: string;

  @IsString()
  driveFolderName: string;
}
