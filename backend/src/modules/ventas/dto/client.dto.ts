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
}

// {key,label}[] — el key es lo que se guarda en SalesClient.extra, el label
// se puede renombrar después sin corromper datos ya guardados (ver
// SalesClientField.options en schema.prisma).
export class SalesClientFieldOptionDto {
  @IsString()
  key: string;

  @IsString()
  label: string;
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
