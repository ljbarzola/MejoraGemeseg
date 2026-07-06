import { IsString, IsOptional } from 'class-validator';

export class UpdateAssignmentDto {
  @IsOptional()
  @IsString()
  version?: string;

  @IsOptional()
  @IsString()
  licenseKey?: string;
}
