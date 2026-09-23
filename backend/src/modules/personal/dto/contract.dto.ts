import {
  IsString,
  IsOptional,
  IsNumber,
  IsArray,
  IsBoolean,
  IsNotEmpty,
  IsIn,
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
  @Matches(/^[A-Za-zÀ-ÿ_][A-Za-zÀ-ÿ0-9_ .()/-]*$/, {
    message:
      'variableName debe ser el nombre detectado en el documento (letras, números, espacios, acentos, puntos, paréntesis, "/" o "-")',
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

  // Opcional: en modo manual el documento se genera para alguien que no está
  // en el padrón de guardias (un cliente, un tercero, un guardia todavía sin
  // ficha), así que no hay cédula que seleccionar. El nombre sí es
  // obligatorio siempre — es a nombre de quién sale el documento.
  @IsOptional()
  @IsString()
  cedula?: string;

  @IsString()
  @IsNotEmpty()
  nombreGuardia: string;

  @IsOptional()
  fieldValues?: Record<string, string>;

  // Solo cuando se eligió un guardia del padrón. "general" es la carpeta fija
  // de Documentación; "guardia" es la carpeta de Drive de esa persona.
  // En "Llenar a mano" no se pregunta: siempre queda en la carpeta general.
  @IsOptional()
  @IsIn(['general', 'guardia'])
  guardarEn?: 'general' | 'guardia';
}
