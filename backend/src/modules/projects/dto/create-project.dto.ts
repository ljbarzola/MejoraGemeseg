import { IsString, IsNotEmpty, IsOptional, IsDateString, IsEnum } from 'class-validator';

export class CreateProjectDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsDateString()
  @IsOptional()
  startDate?: string;

  @IsDateString()
  @IsOptional()
  endDate?: string;

  @IsEnum(['ACTIVE', 'ON_HOLD', 'COMPLETED', 'CANCELLED'])
  @IsOptional()
  status?: string;
}
