import { IsString, IsOptional, IsNumber } from 'class-validator';

export class CreateSalesClientDto {
  @IsString()
  name: string;

  @IsString()
  email: string;

  @IsString()
  @IsOptional()
  phone?: string;

  @IsString()
  @IsOptional()
  ruc?: string;

  @IsString()
  @IsOptional()
  address?: string;

  @IsString()
  @IsOptional()
  observaciones?: string;

  @IsOptional()
  extra?: Record<string, string>;
}

export class UpdateSalesClientDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  email?: string;

  @IsString()
  @IsOptional()
  phone?: string;

  @IsString()
  @IsOptional()
  ruc?: string;

  @IsString()
  @IsOptional()
  address?: string;

  @IsString()
  @IsOptional()
  observaciones?: string;

  @IsOptional()
  extra?: Record<string, string>;
}

export class CreateSalesClientFieldDto {
  @IsString()
  label: string;

  @IsString()
  @IsOptional()
  key?: string;

  @IsString()
  @IsOptional()
  fieldType?: string;

  @IsNumber()
  @IsOptional()
  order?: number;
}
