import { IsString, IsOptional, IsNumber, IsArray, IsEnum, IsIn, MaxLength } from 'class-validator';
import { ContractType } from '@prisma/client';

/// Estados del ciclo de vida de un contrato. `DRAFT` es el inicial (y el que el
/// dashboard cuenta como "contratos pendientes"), los demas los fija RRHH desde
/// la UI. Es una lista cerrada para que no entre texto libre a la base.
export const CONTRACT_STATUSES = ['DRAFT', 'GENERADO', 'FIRMADO', 'ANULADO'] as const;

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

  // Cuerpo del contrato con variables {{NOMBRE}}, {{CEDULA}}... que rellena el
  // generador de PDF. Si se omite se usa el texto base de GEMESEG.
  @IsString()
  @IsOptional()
  @MaxLength(20000)
  content?: string;
}

export class UpdateContractDto {
  @IsString()
  @IsOptional()
  generatedUrl?: string;

  @IsIn([...CONTRACT_STATUSES])
  @IsOptional()
  status?: string;
}

export class GenerateContractDto {
  @IsNumber()
  candidateId: number;

  @IsNumber()
  templateId: number;
}
