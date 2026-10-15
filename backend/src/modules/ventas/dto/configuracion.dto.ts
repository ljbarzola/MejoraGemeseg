import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';

// El servidor tiene forbidNonWhitelisted: todo campo del body debe estar aquí.
// Las reglas de fondo (10 dígitos, slug válido...) las valida VentasConfigService
// con mensajes en español; aquí solo se acota el tamaño.

export class GoogleAdsConfigDto {
  @IsOptional() @IsString() @MaxLength(20) customerId?: string;
  @IsOptional() @IsString() @MaxLength(30) conversionCualificado?: string;
  @IsOptional() @IsString() @MaxLength(30) conversionConvertido?: string;
  @IsOptional() @IsBoolean() activo?: boolean;
  @IsOptional() @IsBoolean() soloValidar?: boolean;
}

export class LandingItemDto {
  @IsString() @MaxLength(80) slug!: string;
  @IsString() @MaxLength(120) servicio!: string;
  @IsOptional() @IsString() @MaxLength(60) linea?: string;
}

export class LandingsConfigDto {
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => LandingItemDto)
  landings!: LandingItemDto[];
}
