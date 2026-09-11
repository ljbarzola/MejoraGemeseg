import {
  IsString,
  IsOptional,
  IsNumber,
  IsArray,
  IsBoolean,
} from 'class-validator';

export class CreateKanbanColumnDto {
  @IsString()
  name: string;

  @IsString()
  @IsOptional()
  color?: string;

  @IsBoolean()
  @IsOptional()
  triggersHire?: boolean;
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

  @IsBoolean()
  @IsOptional()
  triggersHire?: boolean;
}

export class ReorderKanbanDto {
  @IsArray()
  columns: { id: number; position: number }[];
}
