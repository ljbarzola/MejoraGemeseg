import { IsNumber, IsDateString, IsString, IsOptional, IsArray, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class ShipmentLotDto {
  @IsNumber()
  lotId: number;

  @IsNumber()
  quantity: number;

  @IsNumber()
  unitCost: number;

  @IsNumber()
  saleAmount: number;
}

export class CreateShipmentDto {
  @IsDateString()
  date: string;

  @IsNumber()
  clientId: number;

  @IsString()
  contractRef: string;

  @IsString()
  @IsOptional()
  unitOfMeasure?: string;

  @IsNumber()
  totalWeight: number;

  @IsNumber()
  totalCost: number;

  @IsNumber()
  salePrice: number;

  @IsNumber()
  margin: number;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ShipmentLotDto)
  @IsOptional()
  lots?: ShipmentLotDto[];
}
