import { IsString, IsOptional, IsNumber, IsArray, IsEnum } from 'class-validator';
import { ContractType } from '@prisma/client';

export class CreateContractTemplateDto {
  @IsString()
  name: string;

  @IsEnum(ContractType)
  type: ContractType;

  @IsString()
  fileName: string;

  @IsString()
  fileUrl: string;

  @IsArray()
  @IsOptional()
  fields?: string[];
}

export class UpdateContractDto {
  @IsString()
  @IsOptional()
  generatedUrl?: string;

  @IsString()
  @IsOptional()
  status?: string;
}

export class GenerateContractDto {
  @IsNumber()
  candidateId: number;

  @IsNumber()
  templateId: number;
}
