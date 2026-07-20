import { IsNumber, IsDateString, IsOptional, IsString } from 'class-validator';

export class CreatePriceFixingDto {
  @IsNumber()
  lotId: number;

  @IsNumber()
  referencePrice: number;

  @IsNumber()
  differential: number;

  @IsNumber()
  fixedPrice: number;

  @IsDateString()
  @IsOptional()
  deadline?: string;
}
