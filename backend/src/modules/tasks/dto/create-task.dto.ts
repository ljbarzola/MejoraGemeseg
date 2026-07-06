import { IsString, IsNotEmpty, IsOptional, IsEnum, IsDateString, IsNumber, Min } from 'class-validator';

export class CreateTaskDto {
  @IsString()
  @IsNotEmpty()
  title: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsEnum(['LOW', 'MEDIUM', 'HIGH', 'URGENT'] as const)
  @IsOptional()
  priority?: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';

  @IsDateString()
  @IsOptional()
  dueDate?: string;

  @IsNumber()
  @Min(0)
  @IsOptional()
  estimatedHours?: number;
}
