import { IsString, IsOptional, IsNumber, IsArray } from 'class-validator';

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

export class ReorderKanbanDto {
  @IsArray()
  columns: { id: number; position: number }[];
}
