import { IsString, IsOptional } from 'class-validator';

export class CreateToolDto {
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  category?: string;
}
