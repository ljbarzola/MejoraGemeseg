import {
  IsString,
  IsOptional,
  IsNumber,
  IsInt,
  IsBoolean,
  IsArray,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateSalesClientDto {
  @IsString()
  name: string;

  @IsString()
  @IsOptional()
  email?: string;

  @IsString()
  @IsOptional()
  phone?: string;

  @IsString()
  @IsOptional()
  ruc?: string;

  @IsString()
  @IsOptional()
  address?: string;

  @IsString()
  @IsOptional()
  observaciones?: string;

  @IsOptional()
  extra?: Record<string, string>;

  // 'YYYY-MM-DD'. Permite registrar prospectos de meses anteriores; sin
  // enviar, queda la fecha de hoy. No puede ser futura.
  @IsString()
  @IsOptional()
  fechaIngreso?: string;
}

export class UpdateSalesClientDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  email?: string;

  @IsString()
  @IsOptional()
  phone?: string;

  @IsString()
  @IsOptional()
  ruc?: string;

  @IsString()
  @IsOptional()
  address?: string;

  @IsString()
  @IsOptional()
  observaciones?: string;

  @IsOptional()
  extra?: Record<string, string>;

  // 'YYYY-MM-DD'. Solo se reescribe la fecha de creación si el día cambió.
  @IsString()
  @IsOptional()
  fechaIngreso?: string;

  // null o '' borran el siguiente paso; sin enviar, no se toca.
  @IsOptional()
  @IsString()
  nextActionText?: string | null;

  // 'YYYY-MM-DD' (solo día). null o '' la borran.
  @IsOptional()
  @IsString()
  nextActionDate?: string | null;
}

// {key,label}[] — el key es lo que se guarda en SalesClient.extra, el label
// se puede renombrar después sin corromper datos ya guardados (ver
// SalesClientField.options en schema.prisma).
export class SalesClientFieldSubOptionDto {
  @IsString()
  key: string;

  @IsString()
  label: string;
}

export class SalesClientFieldOptionDto {
  @IsString()
  key: string;

  @IsString()
  label: string;

  // Hijos de esta opción. En `servicio_requerido` son los sub-servicios.
  // En un campo `LISTA_SUBOPCIONES` son las casillas de esa opción. Sin
  // `children` declarado (undefined) = nunca se sembró; [] = sin hijos.
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SalesClientFieldSubOptionDto)
  children?: SalesClientFieldSubOptionDto[];
}

export class CreateSalesClientFieldDto {
  @IsString()
  label: string;

  @IsString()
  @IsOptional()
  key?: string;

  @IsString()
  @IsOptional()
  fieldType?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SalesClientFieldOptionDto)
  options?: SalesClientFieldOptionDto[];

  @IsOptional()
  @IsBoolean()
  allowOther?: boolean;

  @IsNumber()
  @IsOptional()
  order?: number;
}

export class UpdateSalesClientFieldDto {
  @IsString()
  @IsOptional()
  label?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SalesClientFieldOptionDto)
  options?: SalesClientFieldOptionDto[];

  @IsOptional()
  @IsBoolean()
  allowOther?: boolean;

  @IsNumber()
  @IsOptional()
  order?: number;
}

// Formulario abierto "Referir un cliente" — cualquier autenticado, no
// depende del permiso de sección VENTAS (ver VentasClientesController).
export class CreateReferralDto {
  @IsString()
  nombre: string;

  @IsString()
  @IsOptional()
  celular?: string;

  @IsString()
  @IsOptional()
  correo?: string;

  // key de una opción del campo núcleo `servicio_requerido`.
  @IsString()
  @IsOptional()
  servicioRequerido?: string;

  // keys de `children` de esa opción del servicio. Opcional.
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  subserviciosRequeridos?: string[];

  @IsString()
  @IsOptional()
  nota?: string;
}

export class ChangeSalesClientStageDto {
  // `key` de un SalesClientStage de la empresa (validado en el servicio, no
  // acá, ya que depende de la empresa del usuario autenticado).
  @IsString()
  toStatus: string;

  @IsOptional()
  @IsString()
  notes?: string;

  // Siguiente paso opcional que se deja al mover de etapa (ver
  // UpdateSalesClientDto). Si la etapa destino es final se borran siempre.
  @IsOptional()
  @IsString()
  nextActionText?: string | null;

  @IsOptional()
  @IsString()
  nextActionDate?: string | null;
}

// Tipos de actividad de la ficha del cliente. OTRO lleva una etiqueta libre
// (`otherLabel`) que la persona escribe. Se validan en el servicio para dar un
// mensaje claro en español en vez del genérico de class-validator.
export const ACTIVITY_TYPES = ['NOTA', 'LLAMADA', 'REUNION', 'CORREO', 'OTRO'] as const;
export type ActivityType = (typeof ACTIVITY_TYPES)[number];

export class CreateSalesClientActivityDto {
  @IsString()
  type: string;

  @IsOptional()
  @IsString()
  otherLabel?: string;

  @IsString()
  text: string;
}

export class UpdateSalesClientActivityDto {
  @IsOptional()
  @IsString()
  type?: string;

  @IsOptional()
  @IsString()
  otherLabel?: string;

  @IsOptional()
  @IsString()
  text?: string;
}

// "Hecho" de la vista Hoy: deja constancia de lo que se hizo (opcional) y el
// nuevo siguiente paso, todo en una sola operación.
export class MarkSalesClientDoneDto {
  // ¿Qué hiciste? Vacío = no se registra actividad.
  @IsOptional()
  @IsString()
  text?: string;

  @IsOptional()
  @IsString()
  type?: string;

  @IsOptional()
  @IsString()
  otherLabel?: string;

  @IsOptional()
  @IsString()
  nextActionText?: string | null;

  @IsOptional()
  @IsString()
  nextActionDate?: string | null;
}

export class CreateSalesClientStageDto {
  @IsString()
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

export class UpdateSalesClientStageDto {
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
