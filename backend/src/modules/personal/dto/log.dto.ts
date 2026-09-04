import { IsString, IsOptional, IsNumber, IsEnum } from 'class-validator';
import { LogType } from '@prisma/client';

export class CreateLogTemplateDto {
  @IsString()
  name: string;

  @IsEnum(LogType)
  type: LogType;

  @IsString()
  content: string;
}

export class CreateLogEntryDto {
  @IsString()
  title: string;

  @IsString()
  content: string;

  @IsEnum(LogType)
  type: LogType;

  @IsNumber()
  @IsOptional()
  templateId?: number;
}
