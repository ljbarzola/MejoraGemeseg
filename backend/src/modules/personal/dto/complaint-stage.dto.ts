import {
  IsString,
  IsOptional,
  IsBoolean,
  IsInt,
  Matches,
} from 'class-validator';

// `key` es el valor estable que se persiste en Complaint.status — mayúsculas
// y guiones bajos, sin espacios (mismo criterio que el resto de los "enums
// de texto libre" de este módulo, ver PersonalFieldDefinition.type).
const KEY_PATTERN = /^[A-Z][A-Z0-9_]*$/;

export class CreateComplaintStageDto {
  @IsString()
  @Matches(KEY_PATTERN, {
    message:
      'key debe ser mayúsculas/guiones bajos, sin espacios (ej. EN_REVISION)',
  })
  key: string;

  @IsString()
  label: string;

  @IsOptional()
  @IsString()
  color?: string;

  @IsOptional()
  @IsInt()
  order?: number;

  @IsOptional()
  @IsBoolean()
  isInitial?: boolean;

  @IsOptional()
  @IsBoolean()
  isFinal?: boolean;
}

export class UpdateComplaintStageDto {
  @IsOptional()
  @IsString()
  label?: string;

  @IsOptional()
  @IsString()
  color?: string;

  @IsOptional()
  @IsInt()
  order?: number;

  @IsOptional()
  @IsBoolean()
  isInitial?: boolean;

  @IsOptional()
  @IsBoolean()
  isFinal?: boolean;
}
