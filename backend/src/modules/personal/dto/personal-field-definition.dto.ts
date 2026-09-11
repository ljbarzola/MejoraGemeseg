import { IsString, IsOptional, IsIn, IsInt, MaxLength } from 'class-validator';

export const PERSONAL_FIELD_TYPES = ['TEXT', 'NUMBER', 'DATE'] as const;
export const PERSONAL_FIELD_SCOPES = ['GUARDIA', 'PERSONAL_ADMIN'] as const;
export const PERSONAL_FIELD_CATEGORIES = ['PERSONAL', 'LABORAL'] as const;

export class CreatePersonalFieldDefinitionDto {
  @IsString()
  @MaxLength(60)
  label: string;

  @IsIn([...PERSONAL_FIELD_TYPES])
  type: string;

  @IsIn([...PERSONAL_FIELD_SCOPES])
  @IsOptional()
  scope?: string;

  @IsIn([...PERSONAL_FIELD_CATEGORIES])
  @IsOptional()
  category?: string;
}

export class UpdatePersonalFieldDefinitionDto {
  @IsString()
  @MaxLength(60)
  @IsOptional()
  label?: string;

  @IsInt()
  @IsOptional()
  order?: number;
}
