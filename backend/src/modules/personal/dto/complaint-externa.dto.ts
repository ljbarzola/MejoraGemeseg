import {
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

// Formulario público (sin sesión). Todo se vuelve a validar en el servicio.
export class SubmitPublicComplaintDto {
  @IsString()
  @MaxLength(80)
  tipo: string;

  @IsString()
  @MaxLength(80)
  sede: string;

  // 'YYYY-MM-DD'
  @IsString()
  @MaxLength(10)
  fechaInduccion: string;

  @IsString()
  @MinLength(5, { message: 'Describe lo ocurrido con al menos 5 caracteres.' })
  @MaxLength(5000, { message: 'El texto es demasiado largo (máximo 5000).' })
  description: string;

  @IsBoolean()
  anonima: boolean;

  // Debe llegar en true: quien envía acepta la política de privacidad (se valida también en el servicio).
  @IsBoolean()
  aceptaPrivacidad: boolean;

  // Opcional: nombres o cargos de quienes estuvieron presentes o están involucrados.
  @IsOptional()
  @IsString()
  @MaxLength(300, { message: 'Personas involucradas: máximo 300 caracteres.' })
  personasInvolucradas?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  contactoNombre?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  contactoEmail?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  contactoTelefono?: string;

  // Trampa para robots: una persona nunca ve este campo, así que debe llegar vacío.
  @IsOptional()
  @IsString()
  @MaxLength(200)
  sitioWeb?: string;
}

export class SetComplaintPublicEnabledDto {
  @IsBoolean()
  enabled: boolean;
}

export class CreateComplaintPublicOptionDto {
  @IsIn(['TIPO', 'SEDE'])
  kind: 'TIPO' | 'SEDE';

  @IsString()
  @MinLength(2, { message: 'Escribe un nombre de al menos 2 caracteres.' })
  @MaxLength(80, { message: 'El nombre es demasiado largo (máximo 80).' })
  label: string;
}
