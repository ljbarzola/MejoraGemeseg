import { IsOptional, IsString } from 'class-validator';

export class UpdatePlantillaDto {
  @IsString()
  @IsOptional()
  driveUrl?: string;
}
