import {
  IsString,
  IsOptional,
  IsEnum,
  IsNumber,
  IsDateString,
  IsArray,
  IsInt,
  Min,
  Max,
} from 'class-validator';

export class UpdateTaskDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsEnum(['TODO', 'IN_PROGRESS', 'IN_REVIEW', 'DONE', 'CANCELLED'])
  status?: string;

  @IsOptional()
  @IsEnum(['LOW', 'MEDIUM', 'HIGH', 'URGENT'])
  priority?: string;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsNumber()
  estimatedHours?: number;

  @IsOptional()
  @IsArray()
  @IsNumber({}, { each: true })
  assigneeIds?: number[];

  /** Días respecto a la fecha fin en que se avisa a los asignados (0 = el mismo día; positivo = antes; negativo = avisar una vez, esos días después, si sigue sin terminar). */
  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  @Min(-365, { each: true })
  @Max(365, { each: true })
  reminderDays?: number[];
}
