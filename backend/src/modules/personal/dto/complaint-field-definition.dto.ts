import { IsString, IsOptional, IsBoolean, IsInt, IsIn } from 'class-validator';

export class CreateComplaintFieldDto {
  @IsString()
  label: string;

  @IsOptional()
  @IsIn(['TEXT', 'NUMBER', 'DATE'])
  type?: string;

  @IsOptional()
  @IsBoolean()
  required?: boolean;

  @IsOptional()
  @IsInt()
  order?: number;
}

export class UpdateComplaintFieldDto {
  @IsOptional()
  @IsString()
  label?: string;

  @IsOptional()
  @IsIn(['TEXT', 'NUMBER', 'DATE'])
  type?: string;

  @IsOptional()
  @IsBoolean()
  required?: boolean;

  @IsOptional()
  @IsInt()
  order?: number;
}
