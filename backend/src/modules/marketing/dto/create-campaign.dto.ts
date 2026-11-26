import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class RespuestaEntrevistaDto {
  @IsString()
  @MaxLength(400)
  pregunta!: string;

  // Puede traer varias opciones elegidas (separadas por coma) más texto libre.
  @IsString()
  @MaxLength(1500)
  respuesta!: string;
}

export class SiguientePreguntaDto {
  @IsString()
  @MinLength(4, { message: 'Escribe la idea con al menos 4 caracteres.' })
  @MaxLength(1000)
  idea!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  objetivo?: string;

  @IsArray()
  @ArrayMaxSize(12)
  @ValidateNested({ each: true })
  @Type(() => RespuestaEntrevistaDto)
  respuestas!: RespuestaEntrevistaDto[];
}

export class CreateCampaignDto {
  @IsString()
  @MinLength(4, { message: 'Escribe la idea con al menos 4 caracteres.' })
  @MaxLength(1000)
  idea!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  objetivo?: string;

  @IsOptional()
  @IsInt()
  duplicarDe?: number;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(12)
  @ValidateNested({ each: true })
  @Type(() => RespuestaEntrevistaDto)
  entrevista?: RespuestaEntrevistaDto[];

  /** Claves del catálogo (META, GOOGLE_ADS…). Vacío = el agente decide. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(12)
  @IsString({ each: true })
  canales?: string[];

  /** Canales que no están en el catálogo: se piden al equipo y el agente igual prepara las piezas. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(5)
  @IsString({ each: true })
  @MaxLength(80, { each: true })
  canalesExtra?: string[];

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(10000000)
  presupuestoMensual?: number;

  @IsOptional()
  @IsDateString()
  fechaInicio?: string;
}

export class SugerirCanalesDto extends SiguientePreguntaDto {}

export class ClasificarCanalExtraDto {
  @IsString()
  @MinLength(2, { message: 'Escribe el nombre del canal.' })
  @MaxLength(80)
  nombre!: string;
}

export class RecursoDto {
  @IsIn(['LOGO', 'FOTO', 'VIDEO', 'DOCUMENTO'], { message: 'Elige el tipo de recurso: logo, foto, video o documento.' })
  tipo!: 'LOGO' | 'FOTO' | 'VIDEO' | 'DOCUMENTO';

  @IsOptional()
  @IsString()
  @MaxLength(500)
  descripcion?: string;
}

export class GenerarImagenDto {
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  feedback?: string;
}

export class FechaPiezaDto {
  @IsDateString()
  fecha!: string;
}

export class PublicarEnvioDto {
  @IsOptional()
  @IsDateString()
  programadoPara?: string;
}

export class ConexionDto {
  @IsIn(['DEMO', 'SOLICITAR', 'DESCONECTAR'])
  accion!: 'DEMO' | 'SOLICITAR' | 'DESCONECTAR';

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  detalle?: string;
}

export class RequerimientoDto {
  @IsIn(['CANAL', 'INTEGRACION', 'NECESIDAD'])
  tipo!: 'CANAL' | 'INTEGRACION' | 'NECESIDAD';

  @IsOptional()
  @IsString()
  @MaxLength(80)
  canal?: string;

  @IsString()
  @MinLength(4, { message: 'Cuéntanos un poco más (al menos 4 caracteres).' })
  @MaxLength(3000)
  detalle!: string;
}

export class RadarDto {
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  competidores?: string;
}

export class UpdatePieceDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  titulo?: string;

  @IsString()
  @MinLength(1)
  contenido!: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  estado?: string;
}

export class RegenerarDto {
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  feedback?: string;
}

export class UpdateMarketingSettingDto {
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  tono?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  servicios?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  canalesPermitidos?: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  consentimiento?: string;

  @IsOptional()
  @IsBoolean()
  aprobadorDistinto?: boolean;

  /** Sitio web de la empresa (http/https). */
  @IsOptional()
  @IsString()
  @MaxLength(300)
  sitioWeb?: string;

  /** Redes sociales, una por línea. */
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  redesSociales?: string;

  /** Aplicaciones o herramientas que usa la empresa (texto libre). */
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  herramientas?: string;

  /** Resumen del sitio web (lo escribe la IA con «leer-web»; se puede corregir a mano). */
  @IsOptional()
  @IsString()
  @MaxLength(3000)
  resumenWeb?: string;
}
