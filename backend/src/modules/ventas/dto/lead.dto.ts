import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { MotivoInputDto } from './opportunity.dto';

// El servidor tiene forbidNonWhitelisted: todo campo del body debe estar aquí.

export class CreateLeadDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() email?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsString() companyName?: string;
  @IsOptional() @IsString() message?: string;
  // Fuente obligatoria: una clave del registro de canales (lead-canales.const.ts).
  @IsOptional() @IsString() channel?: string;
  @IsOptional() @IsString() campaign?: string;
  // Datos propios de la fuente elegida (gclid, quién refirió, landing...).
  @IsOptional() @IsObject() extra?: Record<string, string>;
}

export class UpdateLeadDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() email?: string | null;
  @IsOptional() @IsString() phone?: string | null;
  @IsOptional() @IsString() companyName?: string | null;
  @IsOptional() @IsString() message?: string | null;
  // SERVICIO, EMPLEO, PROVEEDOR, OTRO, SPAM; null = sin clasificar.
  @IsOptional() @IsString() contactReason?: string | null;
}

export class DiscardLeadDto {
  @IsOptional()
  @ValidateNested()
  @Type(() => MotivoInputDto)
  motivo?: MotivoInputDto;
}

export class ConvertLeadDto {
  // Si el contacto ya es un cliente, se le suma la oportunidad.
  @IsOptional() @IsInt() salesClientId?: number;
  // Confirma que es otro cliente aunque se parezca a uno existente.
  @IsOptional() @IsBoolean() confirmarNuevo?: boolean;
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() email?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsString() ruc?: string;
  @IsOptional() @IsArray() @IsInt({ each: true }) serviceIds?: number[];
  @IsOptional() @IsString() title?: string;
  // Fase 2: contacto reconocido en `coincidencias` (se le guarda el teléfono/
  // correo nuevo si no lo tenía) o el nombre de un contacto nuevo a registrar
  // en un cliente existente.
  @IsOptional() @IsInt() contactId?: number;
  @IsOptional() @IsString() nuevoContactoNombre?: string;
}
