import { IsOptional, IsString } from 'class-validator';

export class UpdateInformeDto {
  @IsString()
  @IsOptional()
  retroalimentacion?: string;

  @IsString()
  @IsOptional()
  conclusiones?: string;
}
