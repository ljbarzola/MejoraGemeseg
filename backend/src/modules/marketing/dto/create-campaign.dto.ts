import { IsInt, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

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
}
