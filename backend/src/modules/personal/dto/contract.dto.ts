import {
  IsString,
  IsOptional,
  IsNumber,
  IsArray,
  IsBoolean,
  IsNotEmpty,
  Matches,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateContractTemplateDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsNotEmpty()
  type: string;

  @IsString()
  @IsOptional()
  driveUrl?: string;
}

export class UpdateContractTemplateDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  type?: string;

  @IsString()
  @IsOptional()
  driveUrl?: string;
}

export class ContractFieldDto {
  @IsString()
  @Matches(/^[A-Za-z_][A-Za-z0-9_]*$/, {
    message: 'variableName debe ser el nombre detectado en el documento (solo letras, números y guion bajo)',
  })
  variableName: string;

  @IsString()
  @IsNotEmpty()
  label: string;

  @IsBoolean()
  @IsOptional()
  isRequired?: boolean;

  @IsString()
  @IsOptional()
  systemField?: string;

  @IsNumber()
  @IsOptional()
  order?: number;
}

export class SaveContractFieldsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ContractFieldDto)
  fields: ContractFieldDto[];
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
  templateId: number;

  @IsString()
  @IsNotEmpty()
  cedula: string;

  @IsString()
  @IsNotEmpty()
  nombreGuardia: string;

  @IsOptional()
  fieldValues?: Record<string, string>;
}
