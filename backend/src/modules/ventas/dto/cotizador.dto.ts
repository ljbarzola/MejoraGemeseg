import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

// ---------------------------------------------------------------------------
// Catálogo del Cotizador
// ---------------------------------------------------------------------------

export const COT_KINDS = ['EQUIPO', 'MATERIAL', 'SERVICIO'] as const;
export type CotKind = (typeof COT_KINDS)[number];

const MAX_DINERO = 9_999_999_999;

// El código (EQ-0001...) NO viaja en estos DTOs a propósito: lo asigna el
// servidor (último + 1), no se puede teclear ni cambiar.
export class CreateCotProductDto {
  @IsIn(COT_KINDS)
  kind: CotKind;

  @IsString()
  @MaxLength(500)
  name: string;

  @IsOptional() @IsString() @MaxLength(200) category?: string;
  @IsOptional() @IsString() @MaxLength(200) subcategory?: string;
  @IsOptional() @IsString() @MaxLength(200) model?: string;
  @IsOptional() @IsString() @MaxLength(3000) description?: string;
  @IsOptional() @IsString() @MaxLength(50) unit?: string;
  @IsOptional() @IsString() @MaxLength(200) supplier?: string;
  @IsOptional() @IsString() @MaxLength(100) lastUpdate?: string;
  @IsOptional() @IsString() @MaxLength(3000) notes?: string;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(1_000_000)
  defaultQty?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  @Max(MAX_DINERO)
  unitCost?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  @Max(MAX_DINERO)
  monthlyCost?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  @Max(MAX_DINERO)
  annualCost?: number;

  @IsOptional() @IsBoolean() hasProfit?: boolean;
  @IsOptional() @IsBoolean() hasInstall?: boolean;
}

// Editar: todo opcional y sin `kind` ni `code` (no cambian nunca).
export class UpdateCotProductDto {
  @IsOptional() @IsString() @MaxLength(500) name?: string;
  @IsOptional() @IsString() @MaxLength(200) category?: string;
  @IsOptional() @IsString() @MaxLength(200) subcategory?: string;
  @IsOptional() @IsString() @MaxLength(200) model?: string;
  @IsOptional() @IsString() @MaxLength(3000) description?: string;
  @IsOptional() @IsString() @MaxLength(50) unit?: string;
  @IsOptional() @IsString() @MaxLength(200) supplier?: string;
  @IsOptional() @IsString() @MaxLength(100) lastUpdate?: string;
  @IsOptional() @IsString() @MaxLength(3000) notes?: string;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(1_000_000)
  defaultQty?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  @Max(MAX_DINERO)
  unitCost?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  @Max(MAX_DINERO)
  monthlyCost?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  @Max(MAX_DINERO)
  annualCost?: number;

  @IsOptional() @IsBoolean() hasProfit?: boolean;
  @IsOptional() @IsBoolean() hasInstall?: boolean;
}

export class CreateCotInstallDto {
  @IsString()
  @MaxLength(500)
  name: string;

  @IsOptional() @IsString() @MaxLength(200) category?: string;
  @IsOptional() @IsString() @MaxLength(200) subcategory?: string;
  @IsOptional() @IsString() @MaxLength(3000) notes?: string;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  @Max(MAX_DINERO)
  unitCost?: number;
}

export class UpdateCotInstallDto {
  @IsOptional() @IsString() @MaxLength(500) name?: string;
  @IsOptional() @IsString() @MaxLength(200) category?: string;
  @IsOptional() @IsString() @MaxLength(200) subcategory?: string;
  @IsOptional() @IsString() @MaxLength(3000) notes?: string;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  @Max(MAX_DINERO)
  unitCost?: number;
}

class ProductoCambioDto extends UpdateCotProductDto {
  @IsInt()
  id: number;
}

class InstalacionCambioDto extends UpdateCotInstallDto {
  @IsInt()
  id: number;
}

class LoteProductosDto {
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(300)
  @ValidateNested({ each: true })
  @Type(() => CreateCotProductDto)
  nuevos?: CreateCotProductDto[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(1000)
  @ValidateNested({ each: true })
  @Type(() => ProductoCambioDto)
  cambios?: ProductoCambioDto[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(1000)
  @IsInt({ each: true })
  borrados?: number[];
}

class LoteInstalacionesDto {
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(300)
  @ValidateNested({ each: true })
  @Type(() => CreateCotInstallDto)
  nuevos?: CreateCotInstallDto[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(1000)
  @ValidateNested({ each: true })
  @Type(() => InstalacionCambioDto)
  cambios?: InstalacionCambioDto[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(1000)
  @IsInt({ each: true })
  borrados?: number[];
}

// El editor del catálogo guarda varios cambios de una vez; todo va en UNA transacción.
export class CatalogoLoteDto {
  @IsOptional()
  @ValidateNested()
  @Type(() => LoteProductosDto)
  productos?: LoteProductosDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => LoteInstalacionesDto)
  instalaciones?: LoteInstalacionesDto;
}

// ---------------------------------------------------------------------------
// Kits y plantillas
// ---------------------------------------------------------------------------

export class CotKitDto {
  @IsString()
  @MaxLength(200)
  name: string;

  // [{ code, qty, included }]
  @IsArray()
  @ArrayMaxSize(200)
  components: Record<string, unknown>[];
}

export class UpdateCotKitDto {
  @IsOptional() @IsString() @MaxLength(200) name?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  components?: Record<string, unknown>[];
}

export class CotTemplateDto {
  @IsString()
  @MaxLength(200)
  name: string;

  @IsOptional() @IsString() @MaxLength(3000) description?: string;
  @IsOptional() @IsString() @MaxLength(100) clientType?: string;
  @IsOptional() @IsString() @MaxLength(100) industry?: string;
  @IsOptional() @IsObject() client?: Record<string, unknown>;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(500)
  items?: Record<string, unknown>[];

  @IsOptional() @IsObject() supplierMargins?: Record<string, number>;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(1000)
  installMargin?: number;

  @IsOptional() @IsBoolean() isSample?: boolean;
}

export class UpdateCotTemplateDto {
  @IsOptional() @IsString() @MaxLength(200) name?: string;
  @IsOptional() @IsString() @MaxLength(3000) description?: string;
  @IsOptional() @IsString() @MaxLength(100) clientType?: string;
  @IsOptional() @IsString() @MaxLength(100) industry?: string;
  @IsOptional() @IsObject() client?: Record<string, unknown>;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(500)
  items?: Record<string, unknown>[];

  @IsOptional() @IsObject() supplierMargins?: Record<string, number>;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(1000)
  installMargin?: number;
}

// ---------------------------------------------------------------------------
// Cotizaciones
// ---------------------------------------------------------------------------

export const COT_STATUSES = [
  'borrador',
  'enviada',
  'vista',
  'aceptada',
  'rechazada',
  'vencida',
] as const;
export type CotStatus = (typeof COT_STATUSES)[number];

export const COT_DISCOUNT_TYPES = ['none', 'percent', 'fixed'] as const;

export class CreateCotQuoteDto {
  // Si no viene, el servidor asigna el siguiente (COT-AAAAMMDD-NNNN).
  @IsOptional()
  @IsString()
  @MaxLength(60)
  @Matches(/^[A-Za-z0-9._-]+$/, {
    message:
      'El número de cotización solo admite letras, números, punto, guion y guion bajo',
  })
  quoteNumber?: string;

  // 'YYYY-MM-DD'; por defecto, hoy.
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'La fecha debe ser AAAA-MM-DD' })
  quoteDate?: string;

  @IsObject()
  client: Record<string, unknown>;

  @IsArray()
  @ArrayMaxSize(500)
  items: Record<string, unknown>[];

  @IsOptional()
  @IsIn(COT_STATUSES)
  status?: CotStatus;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(1000)
  installMargin?: number;

  @IsOptional() @IsObject() supplierMargins?: Record<string, number>;

  @IsOptional()
  @IsIn(COT_DISCOUNT_TYPES)
  discountType?: string;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(MAX_DINERO)
  discountValue?: number;

  @IsOptional() @IsString() @MaxLength(8000) conditions?: string;
  @IsOptional() @IsString() @MaxLength(8000) notes?: string;
}

export class UpdateCotQuoteDto {
  @IsOptional()
  @IsString()
  @MaxLength(60)
  @Matches(/^[A-Za-z0-9._-]+$/, {
    message:
      'El número de cotización solo admite letras, números, punto, guion y guion bajo',
  })
  quoteNumber?: string;

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'La fecha debe ser AAAA-MM-DD' })
  quoteDate?: string;

  @IsOptional() @IsObject() client?: Record<string, unknown>;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(500)
  items?: Record<string, unknown>[];

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(1000)
  installMargin?: number;

  @IsOptional() @IsObject() supplierMargins?: Record<string, number>;

  @IsOptional()
  @IsIn(COT_DISCOUNT_TYPES)
  discountType?: string;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(MAX_DINERO)
  discountValue?: number;

  @IsOptional() @IsString() @MaxLength(8000) conditions?: string;
  @IsOptional() @IsString() @MaxLength(8000) notes?: string;
}

export class ChangeCotStatusDto {
  @IsIn(COT_STATUSES)
  status: CotStatus;
}

export class ShareCotQuoteDto {
  @IsInt()
  userId: number;
}

export class EditGrantDto {
  @IsInt()
  userId: number;
}
