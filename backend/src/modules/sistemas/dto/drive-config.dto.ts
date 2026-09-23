import { IsInt, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { Type } from 'class-transformer';

export class SaveSistemasDriveConfigDto {
  @IsString()
  @IsNotEmpty()
  driveFolderId: string;

  /** Solo lo usa el super admin, que no tiene empresa propia. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  companyId?: number;
}
