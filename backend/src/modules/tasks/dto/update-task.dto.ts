import { IsString, IsOptional, IsEnum, IsDateString, IsNumber, Min, IsInt } from 'class-validator';

export class UpdateTaskDto {
  @IsString()
  @IsOptional()
  title?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsEnum(['TODO', 'IN_PROGRESS', 'IN_REVIEW', 'DONE', 'CANCELLED'] as const)
  @IsOptional()
  status?: 'TODO' | 'IN_PROGRESS' | 'IN_REVIEW' | 'DONE' | 'CANCELLED';

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

  @IsInt()
  @IsOptional()
  assigneeId?: number;
}
