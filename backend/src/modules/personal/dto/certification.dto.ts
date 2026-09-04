import { IsString, IsOptional, IsDateString } from 'class-validator';

export class CreateCertificationDto {
  @IsString()
  employeeName: string;

  @IsString()
  cedula: string;

  @IsString()
  type: string;

  @IsDateString()
  issueDate: string;

  @IsDateString()
  expiryDate: string;

  @IsString()
  @IsOptional()
  status?: string;

  @IsString()
  @IsOptional()
  documentUrl?: string;
}

export class UpdateCertificationDto {
  @IsString()
  @IsOptional()
  employeeName?: string;

  @IsString()
  @IsOptional()
  cedula?: string;

  @IsString()
  @IsOptional()
  type?: string;

  @IsDateString()
  @IsOptional()
  issueDate?: string;

  @IsDateString()
  @IsOptional()
  expiryDate?: string;

  @IsString()
  @IsOptional()
  status?: string;

  @IsString()
  @IsOptional()
  documentUrl?: string;
}
