import {
  IsString,
  IsOptional,
  IsBoolean,
  IsDateString,
  IsInt,
} from 'class-validator';

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

// Fecha de emisión/vencimiento de un EmployeeDocument (fila ya sincronizada
// desde Drive). Fase A: RRHH las carga manualmente. Fase B (futura): extracción
// asistida por IA con esta misma confirmación manual como paso final.
export class UpdateDocumentExpiryDto {
  @IsDateString()
  @IsOptional()
  issueDate?: string;

  @IsDateString()
  @IsOptional()
  expiryDate?: string;
}

// RRHH reclasifica un archivo "adicional" (que no matcheó ningún tipo
// requerido) como el documento faltante X. Ver DriveService.reassignDocumentType.
export class ReassignDocumentTypeDto {
  @IsInt()
  documentTypeId: number;
}
