import { IsString, IsOptional, IsBoolean } from 'class-validator';

export class CreateDocumentTypeDto {
  @IsString()
  name: string;

  @IsString()
  folder: string;

  @IsBoolean()
  @IsOptional()
  required?: boolean;
}

export class UpdateDocumentTypeDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  folder?: string;

  @IsBoolean()
  @IsOptional()
  required?: boolean;
}
