import { IsString, IsOptional, IsNumber } from 'class-validator';

export class AssignToolDto {
  @IsNumber()
  toolId: number;

  @IsNumber()
  userId: number;

  @IsOptional()
  @IsString()
  version?: string;

  @IsOptional()
  @IsString()
  licenseKey?: string;
}
