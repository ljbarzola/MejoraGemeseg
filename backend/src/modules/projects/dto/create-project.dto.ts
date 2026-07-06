import { IsString, IsNotEmpty, IsOptional, IsDateString, IsEnum } from 'class-validator';
import { Transform } from 'class-transformer';

export class CreateProjectDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsOptional()
  description?: string;

  @Transform(({ value }) => value === '' ? undefined : value)
  @IsDateString()
  @IsOptional()
  startDate?: string;

  @Transform(({ value }) => value === '' ? undefined : value)
  @IsDateString()
  @IsOptional()
  endDate?: string;

  @IsEnum(['ACTIVE', 'ON_HOLD', 'COMPLETED', 'CANCELLED'])
  @IsOptional()
  status?: string;
}
