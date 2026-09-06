import { IsString, IsOptional, IsNumber, IsArray, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateKanbanColumnDto {
  @IsString()
  name: string;

  @IsString()
  @IsOptional()
  color?: string;
}

export class UpdateKanbanColumnDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  color?: string;

  @IsNumber()
  @IsOptional()
  position?: number;
}

export class ReorderColumnDto {
  @IsNumber()
  id: number;

  @IsNumber()
  position: number;
}

export class ReorderKanbanDto {
  // Sin ValidateNested + Type los elementos del array no se validaban ni se
  // filtraban: un `position` no numerico llegaba hasta Prisma como error 500.
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ReorderColumnDto)
  columns: ReorderColumnDto[];
}
