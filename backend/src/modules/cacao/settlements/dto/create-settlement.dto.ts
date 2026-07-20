import { IsNumber, IsDateString, IsArray, ValidateNested, IsOptional } from 'class-validator';
import { Type } from 'class-transformer';

export class SettlementLotDto {
  @IsNumber()
  lotId: number;

  @IsNumber()
  quantity: number;

  @IsNumber()
  unitCost: number;
}

export class CreateSettlementDto {
  @IsDateString()
  date: string;

  @IsNumber()
  supplierId: number;

  @IsDateString()
  periodStart: string;

  @IsDateString()
  periodEnd: string;

  @IsNumber()
  totalNetWeight: number;

  @IsNumber()
  totalDeductions: number;

  @IsNumber()
  finalPrice: number;

  @IsNumber()
  totalAmount: number;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SettlementLotDto)
  @IsOptional()
  lots?: SettlementLotDto[];
}
