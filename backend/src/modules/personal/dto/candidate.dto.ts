import { IsString, IsOptional, IsNumber } from 'class-validator';

export class CreateCandidateDto {
  @IsString()
  fullName: string;

  @IsString()
  cedula: string;

  @IsString()
  positionApplied: string;

  @IsString()
  @IsOptional()
  phone?: string;

  @IsString()
  @IsOptional()
  email?: string;

  @IsString()
  @IsOptional()
  availability?: string;

  @IsNumber()
  @IsOptional()
  salaryExpected?: number | null;

  @IsString()
  @IsOptional()
  education?: string;

  @IsString()
  @IsOptional()
  experience?: string;

  @IsString()
  @IsOptional()
  references?: string;

  @IsString()
  @IsOptional()
  observations?: string;

  @IsString()
  @IsOptional()
  cvUrl?: string;

  @IsNumber()
  @IsOptional()
  columnId?: number | null;
}

export class UpdateCandidateDto {
  @IsString()
  @IsOptional()
  fullName?: string;

  @IsString()
  @IsOptional()
  cedula?: string;

  @IsString()
  @IsOptional()
  positionApplied?: string;

  @IsString()
  @IsOptional()
  phone?: string;

  @IsString()
  @IsOptional()
  email?: string;

  @IsString()
  @IsOptional()
  availability?: string;

  @IsNumber()
  @IsOptional()
  salaryExpected?: number | null;

  @IsString()
  @IsOptional()
  education?: string;

  @IsString()
  @IsOptional()
  experience?: string;

  @IsString()
  @IsOptional()
  references?: string;

  @IsString()
  @IsOptional()
  observations?: string;

  @IsString()
  @IsOptional()
  cvUrl?: string;

  @IsString()
  @IsOptional()
  status?: string;
}

export class MoveCandidateDto {
  @IsNumber()
  @IsOptional()
  columnId: number | null;
}
