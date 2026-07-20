import { IsNumber, IsString, IsOptional, IsDateString } from 'class-validator';

export class CreateReceptionDto {
  @IsDateString()
  date: string;

  @IsNumber()
  supplierId: number;

  @IsString()
  guideNumber: string;

  @IsString()
  @IsOptional()
  unitOfMeasure?: string;

  @IsNumber()
  grossWeight: number;

  @IsNumber()
  tare: number;

  @IsNumber()
  humidity: number;

  @IsNumber()
  impurities: number;

  @IsNumber()
  @IsOptional()
  provisionalPrice?: number;

  @IsNumber()
  @IsOptional()
  differential?: number;

  @IsNumber()
  @IsOptional()
  qualityId?: number;

  @IsNumber()
  @IsOptional()
  lotId?: number;
}
