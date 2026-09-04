import { IsString, IsOptional, IsArray } from 'class-validator';

export class CreateJobPositionDto {
  @IsString()
  puesto: string;

  @IsString()
  @IsOptional()
  descripcion?: string;

  @IsArray()
  @IsOptional()
  camposRequeridos?: string[];

  @IsArray()
  @IsOptional()
  archivosRequeridos?: string[];

  @IsString()
  @IsOptional()
  driveFileId?: string;
}

export class UpdateJobPositionDto {
  @IsString()
  @IsOptional()
  puesto?: string;

  @IsString()
  @IsOptional()
  descripcion?: string;

  @IsArray()
  @IsOptional()
  camposRequeridos?: string[];

  @IsArray()
  @IsOptional()
  archivosRequeridos?: string[];

  @IsString()
  @IsOptional()
  driveFileId?: string;
}
