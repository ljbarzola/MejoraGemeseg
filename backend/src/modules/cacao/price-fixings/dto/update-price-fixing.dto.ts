import { IsNumber, IsOptional, IsDateString } from 'class-validator';

export class UpdatePriceFixingDto {
  @IsNumber()
  @IsOptional()
  referencePrice?: number;

  @IsNumber()
  @IsOptional()
  differential?: number;

  @IsNumber()
  @IsOptional()
  fixedPrice?: number;

  @IsNumber()
  @IsOptional()
  pendingWeight?: number;

  @IsDateString()
  @IsOptional()
  deadline?: string;
}
