import { IsString, IsOptional, IsBoolean, IsDateString, IsIn } from 'class-validator';

export class CreateTrainingDto {
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  type?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsDateString()
  dueDate?: string;

  @IsOptional()
  @IsBoolean()
  isAnnualPlan?: boolean;
}

export class UpdateTrainingDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  type?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsDateString()
  dueDate?: string;

  @IsOptional()
  @IsBoolean()
  isAnnualPlan?: boolean;
}

export class AddTrainingAttachmentDto {
  @IsString()
  url: string;

  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsIn(['DOCUMENTO', 'EVIDENCIA'])
  kind?: string;
}

export class SetTrainingCompletedDto {
  @IsBoolean()
  completed: boolean;
}
