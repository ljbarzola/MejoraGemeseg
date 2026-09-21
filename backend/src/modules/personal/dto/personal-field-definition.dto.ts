import {
  IsString,
  IsOptional,
  IsIn,
  IsInt,
  IsBoolean,
  MaxLength,
} from 'class-validator';

export const PERSONAL_FIELD_TYPES = [
  'TEXT',
  'NUMBER',
  'DATE',
  'BOOLEAN',
] as const;
export const PERSONAL_FIELD_SCOPES = ['GUARDIA', 'PERSONAL_ADMIN'] as const;
export const PERSONAL_FIELD_CATEGORIES = ['PERSONAL', 'LABORAL'] as const;

// Campos que antes eran columnas fijas de AdministrativeStaffFicha /
// GuardiaFichaPersonal (no editables desde Configuración) y ahora se
// bootstrapean como PersonalFieldDefinition normales la primera vez que se
// piden (ver PersonalFieldDefinitionService.ensureDefaults) — así quedan
// editables/renombrables/eliminables igual que cualquier campo creado a
// mano. `key` es fijo (no se genera desde el label) para poder mapear el
// valor legado de la columna DB correspondiente en el primer acceso.
export interface DefaultFieldSpec {
  key: string;
  label: string;
  type: (typeof PERSONAL_FIELD_TYPES)[number];
  category: (typeof PERSONAL_FIELD_CATEGORIES)[number];
}

export const DEFAULT_FIELDS_BY_SCOPE: Record<
  (typeof PERSONAL_FIELD_SCOPES)[number],
  DefaultFieldSpec[]
> = {
  PERSONAL_ADMIN: [
    { key: 'departamento', label: 'Departamento / área', type: 'TEXT', category: 'PERSONAL' },
    { key: 'fecha_ingreso', label: 'Fecha de ingreso', type: 'DATE', category: 'PERSONAL' },
    { key: 'activo', label: 'Activo', type: 'BOOLEAN', category: 'PERSONAL' },
    { key: 'telefono', label: 'Teléfono', type: 'TEXT', category: 'PERSONAL' },
    { key: 'direccion', label: 'Dirección', type: 'TEXT', category: 'PERSONAL' },
    { key: 'contacto_emergencia_nombre', label: 'Contacto de emergencia — nombre', type: 'TEXT', category: 'PERSONAL' },
    { key: 'contacto_emergencia_telefono', label: 'Contacto de emergencia — teléfono', type: 'TEXT', category: 'PERSONAL' },
    { key: 'tipo_contrato', label: 'Tipo de contrato', type: 'TEXT', category: 'LABORAL' },
    { key: 'salario_acordado', label: 'Salario acordado', type: 'NUMBER', category: 'LABORAL' },
  ],
  GUARDIA: [
    { key: 'telefono', label: 'Teléfono', type: 'TEXT', category: 'PERSONAL' },
    { key: 'email', label: 'Email', type: 'TEXT', category: 'PERSONAL' },
    { key: 'direccion', label: 'Dirección', type: 'TEXT', category: 'PERSONAL' },
    { key: 'fecha_nacimiento', label: 'Fecha de nacimiento', type: 'DATE', category: 'PERSONAL' },
    { key: 'contacto_emergencia_nombre', label: 'Contacto de emergencia — nombre', type: 'TEXT', category: 'PERSONAL' },
    { key: 'contacto_emergencia_telefono', label: 'Contacto de emergencia — teléfono', type: 'TEXT', category: 'PERSONAL' },
    { key: 'horario', label: 'Horario', type: 'TEXT', category: 'LABORAL' },
    { key: 'puesto_formal', label: 'Puesto formal', type: 'TEXT', category: 'LABORAL' },
    { key: 'salario_acordado', label: 'Salario acordado', type: 'NUMBER', category: 'LABORAL' },
  ],
};

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

  // Puramente informativo (ver PersonalFieldDefinitionService/PersonalFieldsConfigModal):
  // nunca bloquea guardar la ficha, ni se mezcla con compliancePercent.
  @IsBoolean()
  @IsOptional()
  required?: boolean;
}

export class UpdatePersonalFieldDefinitionDto {
  @IsString()
  @MaxLength(60)
  @IsOptional()
  label?: string;

  @IsInt()
  @IsOptional()
  order?: number;

  @IsBoolean()
  @IsOptional()
  required?: boolean;
}
